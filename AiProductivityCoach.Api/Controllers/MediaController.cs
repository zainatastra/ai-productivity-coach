using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Google.Cloud.Firestore;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using AiProductivityCoach.Api.Services;

namespace AiProductivityCoach.Api.Controllers
{
    [ApiController]
    [Route("api/company/{companyId}/media")]
    [Authorize(Policy = "PublisherOnly")]
    public class MediaController : ControllerBase
    {
        private readonly FirestoreDb _firestore;
        private readonly ProviderMediaStorage _mediaStorage;
        private readonly IConfiguration _configuration;
        private readonly IHttpClientFactory _httpClientFactory;

        public MediaController(
            FirestoreDb firestore,
            ProviderMediaStorage mediaStorage,
            IConfiguration configuration,
            IHttpClientFactory httpClientFactory)
        {
            _firestore = firestore;
            _mediaStorage = mediaStorage;
            _configuration = configuration;
            _httpClientFactory = httpClientFactory;
        }

        public class AuthorizeMediaUploadDto
        {
            public string Scope { get; set; } = string.Empty;
            public string Slot { get; set; } = string.Empty;
            public string ResourceType { get; set; } = string.Empty;
            public string ResourceId { get; set; } = string.Empty;
            public string Pathname { get; set; } = string.Empty;
            public string ContentType { get; set; } = string.Empty;
            public long Size { get; set; }
        }

        public class CommitMediaUploadDto : AuthorizeMediaUploadDto
        {
            public string Url { get; set; } = string.Empty;
        }

        private sealed record MediaDefinition(
            string UrlField,
            string ObjectPathField,
            bool PdfOnly,
            int MaxMb,
            string Scope,
            string Slot
        );

        [HttpPost("authorize")]
        public async Task<IActionResult> AuthorizeUpload(
            string companyId,
            [FromBody] AuthorizeMediaUploadDto request,
            CancellationToken cancellationToken)
        {
            var ownership = await GetOwnedCompanyAsync(companyId, cancellationToken);
            if (ownership.Error != null) return ownership.Error;

            var workflowError = await PrepareForPublisherMutationAsync(
                ownership.Company!,
                cancellationToken
            );
            if (workflowError != null) return workflowError;

            var resolved = await ResolveTargetAsync(
                ownership.Company!,
                request,
                cancellationToken
            );

            if (resolved.Error != null)
                return resolved.Error;

            var definition = resolved.Definition!;
            var validationError = ValidateUploadMetadata(companyId, request, definition);

            if (validationError != null)
                return validationError;

            return Ok(new
            {
                allowedContentTypes = definition.PdfOnly
                    ? new[] { "application/pdf" }
                    : new[] { "image/jpeg", "image/png", "image/webp" },
                maximumSizeInBytes = definition.MaxMb * 1024L * 1024L,
                pathname = request.Pathname
            });
        }

        [HttpPost("commit")]
        public async Task<IActionResult> CommitUpload(
            string companyId,
            [FromBody] CommitMediaUploadDto request,
            CancellationToken cancellationToken)
        {
            var ownership = await GetOwnedCompanyAsync(companyId, cancellationToken);
            if (ownership.Error != null)
            {
                await TryCleanupNewBlobAsync(request.Pathname, cancellationToken);
                return ownership.Error;
            }

            var workflowError = await PrepareForPublisherMutationAsync(
                ownership.Company!,
                cancellationToken
            );
            if (workflowError != null)
            {
                await TryCleanupNewBlobAsync(request.Pathname, cancellationToken);
                return workflowError;
            }

            var resolved = await ResolveTargetAsync(
                ownership.Company!,
                request,
                cancellationToken
            );

            if (resolved.Error != null)
            {
                await TryCleanupNewBlobAsync(request.Pathname, cancellationToken);
                return resolved.Error;
            }

            var definition = resolved.Definition!;
            var metadataError = ValidateUploadMetadata(companyId, request, definition);

            if (metadataError != null)
            {
                await TryCleanupNewBlobAsync(request.Pathname, cancellationToken);
                return metadataError;
            }

            if (!IsValidVercelBlobUrl(request.Url, request.Pathname))
            {
                await TryCleanupNewBlobAsync(request.Pathname, cancellationToken);
                return BadRequest(new { message = "The uploaded media URL is not a valid Vercel Blob URL." });
            }

            var signature = await ValidateRemoteFileSignatureAsync(
                request.Url,
                definition,
                cancellationToken
            );

            if (signature.Error != null)
            {
                await TryCleanupNewBlobAsync(request.Pathname, cancellationToken);
                return signature.Error;
            }

            var targetDoc = resolved.TargetDocument!;
            var current = await targetDoc.GetSnapshotAsync(cancellationToken);

            if (!current.Exists)
            {
                await TryCleanupNewBlobAsync(request.Pathname, cancellationToken);
                return NotFound(new { message = "Media target no longer exists." });
            }

            var currentData = current.ToDictionary();
            var previousObjectPath = GetString(currentData, definition.ObjectPathField);

            try
            {
                await targetDoc.UpdateAsync(
                    new Dictionary<string, object>
                    {
                        [definition.UrlField] = request.Url.Trim(),
                        [definition.ObjectPathField] = request.Pathname.Trim(),
                        ["updatedAt"] = Timestamp.GetCurrentTimestamp()
                    },
                    cancellationToken: cancellationToken
                );
            }
            catch
            {
                await TryCleanupNewBlobAsync(request.Pathname, cancellationToken);
                throw;
            }

            if (!string.Equals(previousObjectPath, request.Pathname, StringComparison.Ordinal))
            {
                await _mediaStorage.DeleteIfExistsAsync(previousObjectPath, cancellationToken);
            }

            await WriteAuditLogAsync(
                GetPublisherUid()!,
                "publisher",
                string.IsNullOrWhiteSpace(previousObjectPath)
                    ? "media.uploaded"
                    : "media.replaced",
                companyId,
                request.Scope.Equals("company", StringComparison.OrdinalIgnoreCase)
                    ? "company_media"
                    : request.ResourceType.Trim().ToLowerInvariant(),
                request.Scope.Equals("company", StringComparison.OrdinalIgnoreCase)
                    ? definition.Slot
                    : request.ResourceId.Trim(),
                cancellationToken
            );

            return Ok(new
            {
                success = true,
                field = definition.UrlField,
                url = request.Url.Trim(),
                pathname = request.Pathname.Trim(),
                contentType = signature.ContentType
            });
        }

        [HttpDelete("company/{slot}")]
        public async Task<IActionResult> DeleteCompanyMedia(
            string companyId,
            string slot,
            CancellationToken cancellationToken)
        {
            var definition = GetCompanyDefinition(slot);

            if (definition == null)
                return BadRequest(new { message = "Unsupported company media slot." });

            var ownership = await GetOwnedCompanyAsync(companyId, cancellationToken);
            if (ownership.Error != null) return ownership.Error;

            var workflowError = await PrepareForPublisherMutationAsync(
                ownership.Company!,
                cancellationToken
            );
            if (workflowError != null) return workflowError;

            var companyDoc = await ownership.Company!.Reference.GetSnapshotAsync(cancellationToken);
            var currentData = companyDoc.ToDictionary();
            var pathname = GetString(currentData, definition.ObjectPathField);

            await companyDoc.Reference.UpdateAsync(
                new Dictionary<string, object>
                {
                    [definition.UrlField] = string.Empty,
                    [definition.ObjectPathField] = FieldValue.Delete,
                    ["updatedAt"] = Timestamp.GetCurrentTimestamp()
                },
                cancellationToken: cancellationToken
            );

            await _mediaStorage.DeleteIfExistsAsync(pathname, cancellationToken);

            await WriteAuditLogAsync(
                GetPublisherUid()!,
                "publisher",
                "media.company_removed",
                companyId,
                "company_media",
                definition.Slot,
                cancellationToken
            );

            return Ok(new { success = true, slot = definition.Slot, url = "" });
        }

        [HttpDelete("{resourceType}/{resourceId}")]
        public async Task<IActionResult> DeleteResourceMedia(
            string companyId,
            string resourceType,
            string resourceId,
            CancellationToken cancellationToken)
        {
            var definition = GetResourceDefinition(resourceType);

            if (definition == null)
                return BadRequest(new { message = "Unsupported provider media type." });

            var ownership = await GetOwnedCompanyAsync(companyId, cancellationToken);
            if (ownership.Error != null) return ownership.Error;

            var workflowError = await PrepareForPublisherMutationAsync(
                ownership.Company!,
                cancellationToken
            );
            if (workflowError != null) return workflowError;

            var resourceRef = ownership.Company!.Reference
                .Collection(resourceType.Trim().ToLowerInvariant())
                .Document(resourceId);

            var resourceDoc = await resourceRef.GetSnapshotAsync(cancellationToken);

            if (!resourceDoc.Exists)
                return NotFound(new { message = "Resource not found." });

            var resourceData = resourceDoc.ToDictionary();
            var pathname = GetString(resourceData, definition.ObjectPathField);

            await resourceRef.UpdateAsync(
                new Dictionary<string, object>
                {
                    [definition.UrlField] = string.Empty,
                    [definition.ObjectPathField] = FieldValue.Delete,
                    ["updatedAt"] = Timestamp.GetCurrentTimestamp()
                },
                cancellationToken: cancellationToken
            );

            await _mediaStorage.DeleteIfExistsAsync(pathname, cancellationToken);

            await WriteAuditLogAsync(
                GetPublisherUid()!,
                "publisher",
                "media.resource_removed",
                companyId,
                resourceType.Trim().ToLowerInvariant(),
                resourceId,
                cancellationToken
            );

            return Ok(new
            {
                success = true,
                resourceId,
                resourceType,
                field = definition.UrlField,
                url = ""
            });
        }

        private async Task<(MediaDefinition? Definition, DocumentReference? TargetDocument, IActionResult? Error)>
            ResolveTargetAsync(
                DocumentSnapshot companyDoc,
                AuthorizeMediaUploadDto request,
                CancellationToken cancellationToken)
        {
            var scope = request.Scope?.Trim().ToLowerInvariant() ?? string.Empty;

            if (scope == "company")
            {
                var definition = GetCompanyDefinition(request.Slot);
                if (definition == null)
                    return (null, null, BadRequest(new { message = "Unsupported company media slot." }));

                return (definition, companyDoc.Reference, null);
            }

            if (scope != "resource")
                return (null, null, BadRequest(new { message = "Media scope must be company or resource." }));

            var resourceType = request.ResourceType?.Trim().ToLowerInvariant() ?? string.Empty;
            var resourceId = request.ResourceId?.Trim() ?? string.Empty;
            var definitionForResource = GetResourceDefinition(resourceType);

            if (definitionForResource == null)
                return (null, null, BadRequest(new { message = "Unsupported provider media type." }));

            if (string.IsNullOrWhiteSpace(resourceId))
                return (null, null, BadRequest(new { message = "Resource ID is required." }));

            var resourceRef = companyDoc.Reference.Collection(resourceType).Document(resourceId);
            var resourceDoc = await resourceRef.GetSnapshotAsync(cancellationToken);

            if (!resourceDoc.Exists)
                return (null, null, NotFound(new { message = "Resource not found." }));

            return (definitionForResource, resourceRef, null);
        }

        private async Task<(DocumentSnapshot? Company, IActionResult? Error)> GetOwnedCompanyAsync(
            string companyId,
            CancellationToken cancellationToken)
        {
            var publisherUid = GetPublisherUid();

            if (string.IsNullOrWhiteSpace(publisherUid))
                return (null, Unauthorized());

            if (string.IsNullOrWhiteSpace(companyId))
                return (null, BadRequest(new { message = "Company ID is required." }));

            var companyDoc = await _firestore
                .Collection("companies")
                .Document(companyId)
                .GetSnapshotAsync(cancellationToken);

            if (!companyDoc.Exists)
                return (null, NotFound(new { message = "Company not found." }));

            var ownerUid = GetString(companyDoc.ToDictionary(), "ownerUid");

            if (!string.Equals(ownerUid, publisherUid, StringComparison.Ordinal))
                return (null, Forbid());

            return (companyDoc, null);
        }

        private async Task<IActionResult?> PrepareForPublisherMutationAsync(
            DocumentSnapshot companyDoc,
            CancellationToken cancellationToken)
        {
            var currentData = companyDoc.ToDictionary();
            var moderationState = GetString(currentData, "moderationState", "draft");

            if (string.Equals(moderationState, "pending_review", StringComparison.OrdinalIgnoreCase))
            {
                return Conflict(new
                {
                    message = "This profile is pending admin review. Editing is temporarily locked until the review is completed."
                });
            }

            if (string.Equals(moderationState, "approved", StringComparison.OrdinalIgnoreCase))
            {
                await companyDoc.Reference.UpdateAsync(
                    new Dictionary<string, object>
                    {
                        ["moderationState"] = "draft",
                        ["draftRevisionStartedAt"] = Timestamp.GetCurrentTimestamp(),
                        ["updatedAt"] = Timestamp.GetCurrentTimestamp()
                    },
                    cancellationToken: cancellationToken
                );

                await WriteAuditLogAsync(
                    GetPublisherUid()!,
                    "publisher",
                    "company.revision_started",
                    companyDoc.Id,
                    "company",
                    companyDoc.Id,
                    cancellationToken,
                    "approved",
                    "draft"
                );
            }

            return null;
        }

        private IActionResult? ValidateUploadMetadata(
            string companyId,
            AuthorizeMediaUploadDto request,
            MediaDefinition definition)
        {
            var pathname = request.Pathname?.Trim() ?? string.Empty;
            var contentType = request.ContentType?.Trim().ToLowerInvariant() ?? string.Empty;

            if (request.Size <= 0)
                return BadRequest(new { message = "Uploaded file is empty." });

            var maxBytes = definition.MaxMb * 1024L * 1024L;
            if (request.Size > maxBytes)
                return BadRequest(new { message = $"File must be {definition.MaxMb} MB or smaller." });

            var allowed = definition.PdfOnly
                ? new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "application/pdf" }
                : new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                {
                    "image/jpeg", "image/png", "image/webp"
                };

            if (!allowed.Contains(contentType))
            {
                return BadRequest(new
                {
                    message = definition.PdfOnly
                        ? "Only PDF whitepapers are allowed."
                        : "Only JPG, PNG or WEBP images are allowed."
                });
            }

            var expectedPrefix = request.Scope.Equals("company", StringComparison.OrdinalIgnoreCase)
                ? $"providers/{companyId}/company/{definition.Slot}/"
                : $"providers/{companyId}/{request.ResourceType.Trim().ToLowerInvariant()}/{request.ResourceId.Trim()}/{definition.Slot}/";

            if (!pathname.StartsWith(expectedPrefix, StringComparison.Ordinal) ||
                pathname.Contains("..", StringComparison.Ordinal) ||
                pathname.Contains('\\'))
            {
                return BadRequest(new { message = "Invalid media pathname." });
            }

            var expectedExtension = contentType switch
            {
                "image/jpeg" => ".jpg",
                "image/png" => ".png",
                "image/webp" => ".webp",
                "application/pdf" => ".pdf",
                _ => string.Empty
            };

            if (!pathname.EndsWith(expectedExtension, StringComparison.OrdinalIgnoreCase))
                return BadRequest(new { message = "Media filename does not match its content type." });

            return null;
        }

        private static bool IsValidVercelBlobUrl(string value, string pathname)
        {
            if (!Uri.TryCreate(value?.Trim(), UriKind.Absolute, out var uri))
                return false;

            if (uri.Scheme != Uri.UriSchemeHttps)
                return false;

            if (!uri.Host.EndsWith(".blob.vercel-storage.com", StringComparison.OrdinalIgnoreCase))
                return false;

            var decodedPath = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/'));

            return string.Equals(decodedPath, pathname.TrimStart('/'), StringComparison.Ordinal);
        }

        private async Task<(string? ContentType, IActionResult? Error)> ValidateRemoteFileSignatureAsync(
            string url,
            MediaDefinition definition,
            CancellationToken cancellationToken)
        {
            try
            {
                var client = _httpClientFactory.CreateClient();
                using var request = new HttpRequestMessage(HttpMethod.Get, url);
                request.Headers.Range = new RangeHeaderValue(0, 15);

                using var response = await client.SendAsync(
                    request,
                    HttpCompletionOption.ResponseHeadersRead,
                    cancellationToken
                );

                if (response.StatusCode != HttpStatusCode.PartialContent &&
                    response.StatusCode != HttpStatusCode.OK)
                {
                    return (null, StatusCode(502, new { message = "Unable to verify the uploaded Vercel Blob." }));
                }

                await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
                var buffer = new byte[16];
                var read = await stream.ReadAsync(buffer.AsMemory(0, buffer.Length), cancellationToken);

                if (read < buffer.Length)
                    Array.Resize(ref buffer, read);

                var detected = DetectFile(buffer);

                if (definition.PdfOnly)
                {
                    if (detected.ContentType != "application/pdf")
                        return (null, BadRequest(new { message = "Uploaded whitepaper is not a valid PDF file." }));
                }
                else if (detected.ContentType is not ("image/jpeg" or "image/png" or "image/webp"))
                {
                    return (null, BadRequest(new { message = "Uploaded file is not a valid JPG, PNG or WEBP image." }));
                }

                return (detected.ContentType, null);
            }
            catch
            {
                return (null, StatusCode(502, new { message = "Unable to verify the uploaded Vercel Blob." }));
            }
        }

        private static (string ContentType, string Extension) DetectFile(byte[] bytes)
        {
            if (bytes.Length >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF)
                return ("image/jpeg", "jpg");

            if (bytes.Length >= 8 &&
                bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47 &&
                bytes[4] == 0x0D && bytes[5] == 0x0A && bytes[6] == 0x1A && bytes[7] == 0x0A)
                return ("image/png", "png");

            if (bytes.Length >= 12 &&
                bytes[0] == 0x52 && bytes[1] == 0x49 && bytes[2] == 0x46 && bytes[3] == 0x46 &&
                bytes[8] == 0x57 && bytes[9] == 0x45 && bytes[10] == 0x42 && bytes[11] == 0x50)
                return ("image/webp", "webp");

            if (bytes.Length >= 5 &&
                bytes[0] == 0x25 && bytes[1] == 0x50 && bytes[2] == 0x44 &&
                bytes[3] == 0x46 && bytes[4] == 0x2D)
                return ("application/pdf", "pdf");

            return ("application/octet-stream", "bin");
        }

        private async Task TryCleanupNewBlobAsync(
            string? pathname,
            CancellationToken cancellationToken)
        {
            if (!string.IsNullOrWhiteSpace(pathname))
                await _mediaStorage.DeleteIfExistsAsync(pathname, cancellationToken);
        }

        private MediaDefinition? GetCompanyDefinition(string slot)
        {
            return slot?.Trim().ToLowerInvariant() switch
            {
                "logo" => new MediaDefinition("logoUrl", "logoObjectPath", false, GetMaxMb("CompanyLogoMaxMb", 5), "company", "logo"),
                "banner" => new MediaDefinition("bannerUrl", "bannerObjectPath", false, GetMaxMb("CompanyBannerMaxMb", 5), "company", "banner"),
                _ => null
            };
        }

        private MediaDefinition? GetResourceDefinition(string resourceType)
        {
            return resourceType?.Trim().ToLowerInvariant() switch
            {
                "whitepapers" => new MediaDefinition("fileUrl", "fileObjectPath", true, GetMaxMb("WhitepaperMaxMb", 20), "whitepapers", "file"),
                "products" => new MediaDefinition("imageUrl", "imageObjectPath", false, GetMaxMb("ProductImageMaxMb", 8), "products", "image"),
                "contacts" => new MediaDefinition("photoUrl", "photoObjectPath", false, GetMaxMb("ContactPhotoMaxMb", 5), "contacts", "photo"),
                "webinars" => new MediaDefinition("thumbnailUrl", "thumbnailObjectPath", false, GetMaxMb("WebinarThumbnailMaxMb", 8), "webinars", "thumbnail"),
                "events" => new MediaDefinition("imageUrl", "imageObjectPath", false, GetMaxMb("EventImageMaxMb", 8), "events", "image"),
                _ => null
            };
        }

        private int GetMaxMb(string key, int fallback)
        {
            return int.TryParse(_configuration[$"Media:{key}"], out var configured) && configured > 0
                ? configured
                : fallback;
        }

        private string? GetPublisherUid() =>
            User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        private async Task WriteAuditLogAsync(
            string actorUid,
            string actorRole,
            string action,
            string companyId,
            string resourceType,
            string resourceId,
            CancellationToken cancellationToken,
            string? fromState = null,
            string? toState = null)
        {
            var auditData = new Dictionary<string, object>
            {
                { "actorUid", actorUid },
                { "actorRole", actorRole },
                { "action", action },
                { "companyId", companyId },
                { "resourceType", resourceType },
                { "resourceId", resourceId },
                { "createdAt", Timestamp.GetCurrentTimestamp() }
            };

            if (!string.IsNullOrWhiteSpace(fromState))
                auditData["fromState"] = fromState;
            if (!string.IsNullOrWhiteSpace(toState))
                auditData["toState"] = toState;

            await _firestore.Collection("auditLogs").Document().SetAsync(
                auditData,
                cancellationToken: cancellationToken
            );
        }

        private static string GetString(
            Dictionary<string, object> data,
            string key,
            string fallback = "")
        {
            return data.TryGetValue(key, out var value)
                ? value?.ToString() ?? fallback
                : fallback;
        }
    }
}
