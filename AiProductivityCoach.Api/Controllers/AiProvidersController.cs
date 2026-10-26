using System.Text.RegularExpressions;
using Google.Cloud.Firestore;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Jobs;
using AiProductivityCoach.Api.AiPublishing.Knowledge;
using AiProductivityCoach.Api.AiPublishing.Security;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.Controllers
{
    /// <summary>
    /// Admin-side provider onboarding for the shared AI Publishing Engine:
    /// providers, their source links and source-check jobs.
    /// </summary>
    [ApiController]
    [Route("api/ai/providers")]
    [Authorize(Policy = "AdminOnly")]
    public class AiProvidersController : AiControllerBase
    {
        private const int MaxSourcesPerProvider = 50;

        private readonly FirestoreDb _firestore;
        private readonly AiAuditService _audit;
        private readonly AiJobService _jobs;
        private readonly KnowledgeStore _knowledge;
        private readonly ProviderPurgeService _purge;

        public AiProvidersController(FirestoreDb firestore, AiAuditService audit, AiJobService jobs, KnowledgeStore knowledge, ProviderPurgeService purge)
        {
            _firestore = firestore;
            _audit = audit;
            _jobs = jobs;
            _knowledge = knowledge;
            _purge = purge;
        }

        public class CreateProviderDto
        {
            public string Name { get; set; } = string.Empty;
            public string Website { get; set; } = string.Empty;
        }

        public class UpdateProviderDto
        {
            public string? Name { get; set; }
            public string? Website { get; set; }
        }

        public class AddSourceDto
        {
            public string Url { get; set; } = string.Empty;
            public string? Type { get; set; }
        }

        public class CheckSourcesDto
        {
            public List<string>? SourceIds { get; set; }
        }

        private CollectionReference Providers => _firestore.Collection(AiCollections.Providers);

        // ───────────── PROVIDERS ─────────────

        [HttpPost]
        public async Task<IActionResult> CreateProvider([FromBody] CreateProviderDto request)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var name = CleanName(request.Name);

            if (name.Length < 2)
                return Error(400, "provider_name_required", "Provider name is required.");
            if (name.Length > 160)
                return Error(400, "provider_name_too_long", "Provider name must be 160 characters or fewer.");

            var website = UrlSafety.Normalize(request.Website);
            if (!website.Ok)
                return Error(400, website.Error!, "The website URL is not valid.");

            if (await WebsiteInUseAsync(website.Host!, null))
                return Error(409, "provider_website_exists", "A provider with this website already exists.");

            var slug = await UniqueSlugAsync(SlugHelper.Create(name));
            var now = Timestamp.GetCurrentTimestamp();
            var providerRef = Providers.Document();

            await providerRef.SetAsync(new Dictionary<string, object>
            {
                ["name"] = name,
                ["slug"] = slug,
                ["website"] = website.Normalized!,
                ["websiteHost"] = website.Host!,
                ["status"] = ProviderStatus.Created,
                ["publisherType"] = "company",
                ["defaultLanguage"] = "de",
                ["createdBy"] = actor.UserId,
                ["createdOnPlatform"] = actor.Platform,
                ["sourceCount"] = 1,
                ["sourceSummary"] = new Dictionary<string, object>
                {
                    ["total"] = 1, ["available"] = 0, ["unavailable"] = 0
                },
                ["createdAt"] = now,
                ["updatedAt"] = now
            });

            // The website itself is the first (primary) source.
            await providerRef.Collection(AiCollections.Sources).Document().SetAsync(
                NewSource(website.Normalized!, SourceTypes.Homepage, actor.UserId, isPrimary: true));

            await _audit.LogAsync(actor, AuditActions.ProviderCreated, providerRef.Id, null, null,
                new Dictionary<string, object> { ["name"] = name, ["website"] = website.Normalized! });

            var created = await providerRef.GetSnapshotAsync();
            return StatusCode(201, FirestoreApi.ToApi(created));
        }

        [HttpGet]
        public async Task<IActionResult> ListProviders([FromQuery] string? status = null)
        {
            var snapshot = await Providers.GetSnapshotAsync();
            var wanted = string.IsNullOrWhiteSpace(status) ? ProviderStatus.Created : status.Trim().ToLowerInvariant();

            var rows = snapshot.Documents
                .Where(doc => wanted == "all" ||
                              FirestoreApi.GetString(doc.ToDictionary(), "status", ProviderStatus.Created) == wanted)
                .Select(doc => FirestoreApi.ToApi(doc))
                .OrderByDescending(row => row.TryGetValue("createdAt", out var v) ? v?.ToString() : "")
                .ToList();

            return Ok(rows);
        }

        [HttpGet("{providerId}")]
        public async Task<IActionResult> GetProvider(string providerId)
        {
            var provider = await GetProviderAsync(providerId);
            if (provider == null) return ProviderNotFound();

            return Ok(FirestoreApi.ToApi(provider));
        }

        [HttpPatch("{providerId}")]
        public async Task<IActionResult> UpdateProvider(string providerId, [FromBody] UpdateProviderDto request)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var provider = await GetProviderAsync(providerId);
            if (provider == null) return ProviderNotFound();

            var data = provider.ToDictionary();
            if (FirestoreApi.GetString(data, "status") == ProviderStatus.Archived)
                return Error(409, "provider_archived", "Archived providers cannot be edited.");

            var updates = new Dictionary<string, object>();

            if (request.Name != null)
            {
                var name = CleanName(request.Name);
                if (name.Length < 2) return Error(400, "provider_name_required", "Provider name is required.");
                if (name.Length > 160) return Error(400, "provider_name_too_long", "Provider name must be 160 characters or fewer.");
                updates["name"] = name;
            }

            string? newWebsite = null;

            if (request.Website != null)
            {
                var website = UrlSafety.Normalize(request.Website);
                if (!website.Ok) return Error(400, website.Error!, "The website URL is not valid.");

                if (website.Normalized != FirestoreApi.GetString(data, "website"))
                {
                    if (await WebsiteInUseAsync(website.Host!, providerId))
                        return Error(409, "provider_website_exists", "A provider with this website already exists.");

                    updates["website"] = website.Normalized!;
                    updates["websiteHost"] = website.Host!;
                    newWebsite = website.Normalized;
                }
            }

            if (updates.Count == 0)
                return Error(400, "nothing_to_update", "No changes supplied.");

            updates["updatedAt"] = Timestamp.GetCurrentTimestamp();
            await provider.Reference.UpdateAsync(updates);

            if (newWebsite != null)
            {
                // Keep the primary source in sync; it must be re-checked.
                var primary = (await provider.Reference.Collection(AiCollections.Sources).GetSnapshotAsync())
                    .Documents.FirstOrDefault(doc => doc.TryGetValue<bool>("isPrimary", out var p) && p);

                if (primary != null)
                {
                    var clash = await SourceExistsAsync(provider.Reference, newWebsite, primary.Id);

                    if (!clash)
                    {
                        await primary.Reference.UpdateAsync(new Dictionary<string, object>
                        {
                            ["url"] = newWebsite,
                            ["normalizedUrl"] = newWebsite,
                            ["status"] = SourceStatus.Pending,
                            ["errorCode"] = string.Empty,
                            ["updatedAt"] = Timestamp.GetCurrentTimestamp()
                        });
                    }
                }

                await RecomputeSummaryAsync(provider.Reference);
            }

            await _audit.LogAsync(actor, AuditActions.ProviderUpdated, providerId, null, null,
                new Dictionary<string, object> { ["fields"] = updates.Keys.Where(k => k != "updatedAt").ToList() });

            return Ok(FirestoreApi.ToApi(await provider.Reference.GetSnapshotAsync()));
        }

        [HttpPost("{providerId}/archive")]
        public Task<IActionResult> Archive(string providerId) =>
            SetStatusAsync(providerId, ProviderStatus.Archived, AuditActions.ProviderArchived);

        [HttpPost("{providerId}/restore")]
        public Task<IActionResult> Restore(string providerId) =>
            SetStatusAsync(providerId, ProviderStatus.Created, AuditActions.ProviderRestored);

        public class DeleteProviderDto
        {
            public string? Name { get; set; }
        }

        /// <summary>
        /// Permanently deletes a provider and all of its data. The caller must repeat the exact
        /// provider name, so a stray request can never delete a profile by accident.
        /// </summary>
        [HttpDelete("{providerId}")]
        public async Task<IActionResult> Delete(string providerId, [FromBody] DeleteProviderDto? request, CancellationToken ct)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var provider = await GetProviderAsync(providerId);
            if (provider == null) return ProviderNotFound();

            var data = provider.ToDictionary();
            var name = FirestoreApi.GetString(data, "name");

            if (!string.Equals(request?.Name?.Trim(), name.Trim(), StringComparison.Ordinal))
                return Error(400, "provider_name_mismatch", "The provider name does not match.");

            // A running job would write into the data while it is being removed.
            var jobs = await _jobs.ListForProviderAsync(providerId, 100);
            if (jobs.Any(job => JobStatus.IsActive(job.GetValueOrDefault("status")?.ToString() ?? string.Empty) ||
                                job.GetValueOrDefault("status")?.ToString() == JobStatus.Queued))
                return Error(409, "provider_busy", "A job is still running for this provider. Wait for it or cancel it first.");

            await _audit.LogAsync(actor, AuditActions.ProviderDeleted, providerId, null, null,
                new Dictionary<string, object> { ["name"] = name, ["website"] = FirestoreApi.GetString(data, "website") });

            var summary = await _purge.PurgeAsync(providerId, ct);

            return Ok(new { deleted = true, summary.Documents, summary.Images });
        }

        private async Task<IActionResult> SetStatusAsync(string providerId, string status, string auditAction)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var provider = await GetProviderAsync(providerId);
            if (provider == null) return ProviderNotFound();

            if (FirestoreApi.GetString(provider.ToDictionary(), "status", ProviderStatus.Created) == status)
                return Ok(FirestoreApi.ToApi(provider));

            if (status == ProviderStatus.Created)
            {
                var host = FirestoreApi.GetString(provider.ToDictionary(), "websiteHost");
                if (await WebsiteInUseAsync(host, providerId))
                    return Error(409, "provider_website_exists", "A provider with this website already exists.");
            }

            await provider.Reference.UpdateAsync(new Dictionary<string, object>
            {
                ["status"] = status,
                ["updatedAt"] = Timestamp.GetCurrentTimestamp()
            });

            await _audit.LogAsync(actor, auditAction, providerId);

            return Ok(FirestoreApi.ToApi(await provider.Reference.GetSnapshotAsync()));
        }

        // ───────────── SOURCES ─────────────

        [HttpGet("{providerId}/sources")]
        public async Task<IActionResult> ListSources(string providerId)
        {
            var provider = await GetProviderAsync(providerId);
            if (provider == null) return ProviderNotFound();

            var snapshot = await provider.Reference.Collection(AiCollections.Sources).GetSnapshotAsync();

            var rows = snapshot.Documents
                .Select(doc => FirestoreApi.ToApi(doc))
                .OrderByDescending(row => row.TryGetValue("isPrimary", out var p) && p is true)
                .ThenBy(row => row.TryGetValue("createdAt", out var v) ? v?.ToString() : "")
                .ToList();

            return Ok(rows);
        }

        [HttpPost("{providerId}/sources")]
        public async Task<IActionResult> AddSource(string providerId, [FromBody] AddSourceDto request)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var provider = await GetProviderAsync(providerId);
            if (provider == null) return ProviderNotFound();

            if (FirestoreApi.GetString(provider.ToDictionary(), "status") == ProviderStatus.Archived)
                return Error(409, "provider_archived", "Archived providers cannot be edited.");

            var url = UrlSafety.Normalize(request.Url);
            if (!url.Ok) return Error(400, url.Error!, "The source URL is not valid.");

            var count = (await provider.Reference.Collection(AiCollections.Sources).GetSnapshotAsync()).Count;
            if (count >= MaxSourcesPerProvider)
                return Error(409, "source_limit", $"A provider can have at most {MaxSourcesPerProvider} sources.");

            if (await SourceExistsAsync(provider.Reference, url.Normalized!, null))
                return Error(409, "source_exists", "This source was already added.");

            var type = SourceTypes.Normalize(request.Type);
            var sourceRef = provider.Reference.Collection(AiCollections.Sources).Document();

            await sourceRef.SetAsync(NewSource(url.Normalized!, type, actor.UserId, isPrimary: false));
            await RecomputeSummaryAsync(provider.Reference);
            await provider.Reference.UpdateAsync("knowledgeStale", true);

            await _audit.LogAsync(actor, AuditActions.SourceAdded, providerId, null, null,
                new Dictionary<string, object> { ["url"] = url.Normalized!, ["type"] = type });

            return StatusCode(201, FirestoreApi.ToApi(await sourceRef.GetSnapshotAsync()));
        }

        [HttpDelete("{providerId}/sources/{sourceId}")]
        public async Task<IActionResult> RemoveSource(string providerId, string sourceId)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var provider = await GetProviderAsync(providerId);
            if (provider == null) return ProviderNotFound();

            var sourceRef = provider.Reference.Collection(AiCollections.Sources).Document(sourceId);
            var source = await sourceRef.GetSnapshotAsync();

            if (!source.Exists)
                return Error(404, "source_not_found", "Source not found.");

            if (source.TryGetValue<bool>("isPrimary", out var primary) && primary)
                return Error(409, "source_primary", "The provider website cannot be removed.");

            // Everything learned from this source leaves the knowledge base with it.
            await _knowledge.DeleteBySourceAsync(providerId, sourceId);
            await sourceRef.DeleteAsync();
            await RecomputeSummaryAsync(provider.Reference);
            await provider.Reference.UpdateAsync("knowledgeStale", true);

            await _audit.LogAsync(actor, AuditActions.SourceRemoved, providerId, null, null,
                new Dictionary<string, object> { ["url"] = FirestoreApi.GetString(source.ToDictionary(), "url") });

            return NoContent();
        }

        // ───────────── SOURCE CHECK JOBS ─────────────

        [HttpPost("{providerId}/sources/check")]
        public async Task<IActionResult> CheckSources(
            string providerId,
            [FromBody] CheckSourcesDto? request)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var provider = await GetProviderAsync(providerId);
            if (provider == null) return ProviderNotFound();

            if (FirestoreApi.GetString(provider.ToDictionary(), "status") == ProviderStatus.Archived)
                return Error(409, "provider_archived", "Archived providers cannot be edited.");

            var payload = new Dictionary<string, object>();

            if (request?.SourceIds is { Count: > 0 })
                payload["sourceIds"] = request.SourceIds.Take(MaxSourcesPerProvider).Cast<object>().ToList();

            var (jobId, alreadyActive) = await _jobs.CreateAsync(
                JobTypes.SourceCheck, providerId, actor.Platform, actor.UserId, payload,
                SourceCheckJobHandler.InitialSteps());

            if (!alreadyActive)
            {
                await _audit.LogAsync(actor, AuditActions.JobCreated, providerId, null, null,
                    new Dictionary<string, object> { ["jobId"] = jobId, ["type"] = JobTypes.SourceCheck });
            }

            return Accepted(new { jobId, alreadyActive });
        }

        [HttpGet("{providerId}/jobs")]
        public async Task<IActionResult> ListJobs(string providerId)
        {
            var provider = await GetProviderAsync(providerId);
            if (provider == null) return ProviderNotFound();

            return Ok(await _jobs.ListForProviderAsync(providerId, 20));
        }

        // ───────────── helpers ─────────────

        private async Task<DocumentSnapshot?> GetProviderAsync(string providerId)
        {
            if (string.IsNullOrWhiteSpace(providerId)) return null;

            var doc = await Providers.Document(providerId).GetSnapshotAsync();
            return doc.Exists ? doc : null;
        }

        private IActionResult ProviderNotFound() =>
            Error(404, "provider_not_found", "Provider not found.");

        private static string CleanName(string? value) =>
            Regex.Replace(value ?? string.Empty, @"\s+", " ").Trim();

        private static Dictionary<string, object> NewSource(string url, string type, string userId, bool isPrimary)
        {
            var now = Timestamp.GetCurrentTimestamp();

            return new Dictionary<string, object>
            {
                ["url"] = url,
                ["normalizedUrl"] = url,
                ["type"] = type,
                ["isPrimary"] = isPrimary,
                ["status"] = SourceStatus.Pending,
                ["title"] = string.Empty,
                ["httpStatus"] = 0,
                ["errorCode"] = string.Empty,
                ["language"] = string.Empty,
                ["addedBy"] = userId,
                ["createdAt"] = now,
                ["updatedAt"] = now
            };
        }

        private async Task<bool> WebsiteInUseAsync(string host, string? excludeProviderId)
        {
            // "www.example.com" and "example.com" are the same website.
            var bare = host.StartsWith("www.", StringComparison.Ordinal) ? host[4..] : host;
            var variants = new[] { bare, "www." + bare };

            var snapshot = await Providers.WhereIn("websiteHost", variants).GetSnapshotAsync();

            return snapshot.Documents.Any(doc =>
                doc.Id != excludeProviderId &&
                FirestoreApi.GetString(doc.ToDictionary(), "status") != ProviderStatus.Archived);
        }

        private static async Task<bool> SourceExistsAsync(
            DocumentReference providerRef,
            string normalizedUrl,
            string? excludeSourceId)
        {
            var snapshot = await providerRef.Collection(AiCollections.Sources)
                .WhereEqualTo("normalizedUrl", normalizedUrl)
                .GetSnapshotAsync();

            return snapshot.Documents.Any(doc => doc.Id != excludeSourceId);
        }

        private async Task<string> UniqueSlugAsync(string baseSlug)
        {
            if (string.IsNullOrWhiteSpace(baseSlug))
                baseSlug = "provider";

            var candidate = baseSlug;
            var suffix = 2;

            while ((await Providers.WhereEqualTo("slug", candidate).Limit(1).GetSnapshotAsync()).Count > 0)
            {
                candidate = $"{baseSlug}-{suffix}";
                suffix++;
            }

            return candidate;
        }

        private static async Task RecomputeSummaryAsync(DocumentReference providerRef)
        {
            var sources = await providerRef.Collection(AiCollections.Sources).GetSnapshotAsync();

            int Count(string status) =>
                sources.Documents.Count(doc => doc.GetValue<string>("status") == status);

            await providerRef.UpdateAsync(new Dictionary<string, object>
            {
                ["sourceCount"] = sources.Count,
                ["sourceSummary"] = new Dictionary<string, object>
                {
                    ["total"] = sources.Count,
                    ["available"] = Count(SourceStatus.Available),
                    ["unavailable"] = Count(SourceStatus.Unavailable)
                },
                ["updatedAt"] = Timestamp.GetCurrentTimestamp()
            });
        }
    }
}
