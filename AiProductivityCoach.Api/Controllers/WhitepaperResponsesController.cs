using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Google.Cloud.Firestore;
using System.Net.Mail;
using System.Security.Claims;
using AiProductivityCoach.Api.AiPublishing.Pdf;
using AiProductivityCoach.Api.AiPublishing.Review;

namespace AiProductivityCoach.Api.Controllers
{
    [ApiController]
    [Route("api/providers/{slug}/whitepapers/{whitepaperId}/responses")]
    public class WhitepaperResponsesController : ControllerBase
    {
        // The Render backend's own public address - the PDF download link has to point back at
        // this API, never at the Vercel frontend (which has no route for it).
        private const string DefaultApiBaseUrl = "https://ai-productivity-coach-mlnn.onrender.com";

        private readonly FirestoreDb _firestore;
        private readonly IHttpClientFactory _http;
        private readonly InvitationMailer _mailer;
        private readonly IConfiguration _configuration;
        private readonly ILogger<WhitepaperResponsesController> _logger;

        public WhitepaperResponsesController(
            FirestoreDb firestore,
            IHttpClientFactory http,
            InvitationMailer mailer,
            IConfiguration configuration,
            ILogger<WhitepaperResponsesController> logger)
        {
            _firestore = firestore;
            _http = http;
            _mailer = mailer;
            _configuration = configuration;
            _logger = logger;
        }

        private string ApiBaseUrl
        {
            get
            {
                foreach (var candidate in new[] { Environment.GetEnvironmentVariable("API_BASE_URL"), _configuration["Api:PublicUrl"] })
                {
                    var value = candidate?.Trim().TrimEnd('/');
                    if (!string.IsNullOrEmpty(value) && Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeHttps)
                        return value;
                }

                return DefaultApiBaseUrl;
            }
        }

        public class SubmitWhitepaperResponseDto
        {
            public string FirstName { get; set; } = string.Empty;
            public string LastName { get; set; } = string.Empty;
            public string Email { get; set; } = string.Empty;
            public string Phone { get; set; } = string.Empty;
            public string Company { get; set; } = string.Empty;
            public string Address { get; set; } = string.Empty;
            public string Message { get; set; } = string.Empty;
            public bool ConsentAccepted { get; set; }
            public string Website { get; set; } = string.Empty; // honeypot
        }

        [HttpGet]
        [Authorize(Policy = "PublisherOnly")]
        public async Task<IActionResult> GetResponses(
            string slug,
            string whitepaperId,
            CancellationToken cancellationToken)
        {
            var publisherUid =
                User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

            if (string.IsNullOrWhiteSpace(publisherUid))
                return Unauthorized();

            var normalizedSlug = Clean(slug).ToLowerInvariant();
            var requestedWhitepaperId = Clean(whitepaperId);

            if (string.IsNullOrWhiteSpace(normalizedSlug) ||
                string.IsNullOrWhiteSpace(requestedWhitepaperId))
            {
                return BadRequest(new
                {
                    message = "Provider and whitepaper are required."
                });
            }

            var ownedCompanies = await _firestore
                .Collection("companies")
                .WhereEqualTo("ownerUid", publisherUid)
                .GetSnapshotAsync(cancellationToken);

            DocumentSnapshot? ownedCompany = null;

            foreach (var candidate in ownedCompanies.Documents)
            {
                var companyData = candidate.ToDictionary();
                var currentSlug = GetString(companyData, "slug");

                var approvedSlug = string.Empty;
                if (companyData.TryGetValue("approvedSnapshot", out var rawApproved) &&
                    rawApproved is Dictionary<string, object> approved &&
                    approved.TryGetValue("company", out var rawApprovedCompany) &&
                    rawApprovedCompany is Dictionary<string, object> approvedCompany)
                {
                    approvedSlug = GetString(approvedCompany, "slug");
                }

                if (string.Equals(
                        currentSlug,
                        normalizedSlug,
                        StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(
                        approvedSlug,
                        normalizedSlug,
                        StringComparison.OrdinalIgnoreCase))
                {
                    ownedCompany = candidate;
                    break;
                }
            }

            if (ownedCompany == null)
                return NotFound(new { message = "Provider profile not found." });

            var whitepaperRef = ownedCompany.Reference
                .Collection("whitepapers")
                .Document(requestedWhitepaperId);

            var whitepaperDoc =
                await whitepaperRef.GetSnapshotAsync(cancellationToken);

            if (!whitepaperDoc.Exists)
                return NotFound(new { message = "Whitepaper not found." });

            var snapshot = await whitepaperRef
                .Collection("responses")
                .GetSnapshotAsync(cancellationToken);

            var result = snapshot.Documents
                .Select(doc =>
                {
                    var data = doc.ToDictionary();

                    return new
                    {
                        id = doc.Id,
                        whitepaperId = GetString(data, "whitepaperId"),
                        whitepaperTitle = GetString(data, "whitepaperTitle"),
                        providerSlug = GetString(data, "providerSlug"),
                        firstName = GetString(data, "firstName"),
                        lastName = GetString(data, "lastName"),
                        email = GetString(data, "email"),
                        phone = GetString(data, "phone"),
                        company = GetString(data, "company"),
                        address = GetString(data, "address"),
                        message = GetString(data, "message"),
                        consentAccepted =
                            data.TryGetValue("consentAccepted", out var rawConsent) &&
                            rawConsent is bool consent &&
                            consent,
                        submittedAt =
                            data.TryGetValue("submittedAt", out var rawSubmittedAt) &&
                            rawSubmittedAt is Timestamp submittedAt
                                ? submittedAt.ToDateTime().ToString("O")
                                : string.Empty
                    };
                })
                .OrderByDescending(item => item.submittedAt)
                .ToList();

            return Ok(result);
        }

        [HttpPost]
        [AllowAnonymous]
        public async Task<IActionResult> SubmitResponse(
            string slug,
            string whitepaperId,
            [FromBody] SubmitWhitepaperResponseDto request,
            CancellationToken cancellationToken)
        {
            var normalizedSlug = Clean(slug).ToLowerInvariant();
            var requestedWhitepaperId = Clean(whitepaperId);

            if (string.IsNullOrWhiteSpace(normalizedSlug) ||
                string.IsNullOrWhiteSpace(requestedWhitepaperId))
            {
                return BadRequest(new { message = "Provider and whitepaper are required." });
            }

            // Quietly accept obvious bot submissions without persisting them.
            if (!string.IsNullOrWhiteSpace(request.Website))
                return Ok(new { success = true });

            var firstName = Clean(request.FirstName);
            var lastName = Clean(request.LastName);
            var email = Clean(request.Email).ToLowerInvariant();
            var phone = Clean(request.Phone);
            var companyName = Clean(request.Company);
            var address = Clean(request.Address);
            var message = Clean(request.Message);

            if (string.IsNullOrWhiteSpace(firstName) || firstName.Length > 100)
                return BadRequest(new { message = "First name is required and must be 100 characters or fewer." });

            if (string.IsNullOrWhiteSpace(lastName) || lastName.Length > 100)
                return BadRequest(new { message = "Last name is required and must be 100 characters or fewer." });

            if (string.IsNullOrWhiteSpace(email) || email.Length > 254 || !IsValidEmail(email))
                return BadRequest(new { message = "Enter a valid email address." });

            if (string.IsNullOrWhiteSpace(phone) || phone.Length > 60)
                return BadRequest(new { message = "Phone number is required and must be 60 characters or fewer." });

            if (companyName.Length > 180)
                return BadRequest(new { message = "Company name must be 180 characters or fewer." });

            if (address.Length > 500)
                return BadRequest(new { message = "Address must be 500 characters or fewer." });

            if (message.Length > 4000)
                return BadRequest(new { message = "Message must be 4000 characters or fewer." });

            if (!request.ConsentAccepted)
                return BadRequest(new { message = "Consent is required before submitting the form." });

            var lookup = await FindApprovedWhitepaperAsync(normalizedSlug, requestedWhitepaperId, cancellationToken);
            if (lookup.SlugMatchedButWhitepaperMissing)
                return NotFound(new { message = "Whitepaper not found." });

            var (companyDoc, approvedCompany, approvedWhitepaper) = (lookup.CompanyDoc, lookup.Company, lookup.Whitepaper);
            if (companyDoc == null || approvedCompany == null || approvedWhitepaper == null)
                return NotFound(new { message = "Provider profile not found." });

            var responseRef = companyDoc.Reference
                .Collection("whitepapers")
                .Document(requestedWhitepaperId)
                .Collection("responses")
                .Document();

            var now = Timestamp.GetCurrentTimestamp();

            await responseRef.SetAsync(
                new Dictionary<string, object>
                {
                    ["whitepaperId"] = requestedWhitepaperId,
                    ["whitepaperTitle"] = GetString(approvedWhitepaper, "title"),
                    ["providerSlug"] = normalizedSlug,
                    ["firstName"] = firstName,
                    ["lastName"] = lastName,
                    ["email"] = email,
                    ["phone"] = phone,
                    ["company"] = companyName,
                    ["address"] = address,
                    ["message"] = message,
                    ["consentAccepted"] = true,
                    ["submittedAt"] = now
                },
                cancellationToken: cancellationToken
            );

            var downloadUrl = $"{ApiBaseUrl}/api/providers/{normalizedSlug}/whitepapers/{requestedWhitepaperId}/responses/{responseRef.Id}/download";
            var emailSent = false;

            try
            {
                var pdfBytes = await BuildPdfAsync(approvedCompany, approvedWhitepaper, email, now.ToDateTime(), cancellationToken);
                var fileName = $"{SlugifyFileName(GetString(approvedWhitepaper, "title"))}.pdf";
                var mailResult = await _mailer.SendWhitepaperPdfAsync(
                    email, GetString(approvedCompany, "name"), GetString(approvedWhitepaper, "title"), downloadUrl, "en", pdfBytes, fileName);
                emailSent = mailResult.Sent;
            }
            catch (Exception ex)
            {
                // The lead's submission is already saved and the download link still works on its
                // own (it regenerates the PDF itself) - a PDF/email failure here must never turn a
                // successful submission into an error response for the visitor.
                _logger.LogWarning(ex, "[WhitepaperDownload] Could not build/send the PDF for {ResponseId}.", responseRef.Id);
            }

            return StatusCode(StatusCodes.Status201Created, new
            {
                success = true,
                responseId = responseRef.Id,
                downloadUrl,
                emailSent,
                message = "Thank you. Your response has been submitted."
            });
        }

        /// <summary>
        /// Re-downloads the same whitepaper for a lead who already submitted the gated form -
        /// regenerated fresh each time (never stored) so it always carries that lead's own
        /// watermark and always reflects the provider's current content.
        /// </summary>
        [HttpGet("{responseId}/download")]
        [AllowAnonymous]
        public async Task<IActionResult> Download(
            string slug, string whitepaperId, string responseId, CancellationToken cancellationToken)
        {
            var normalizedSlug = Clean(slug).ToLowerInvariant();
            var requestedWhitepaperId = Clean(whitepaperId);

            var lookup = await FindApprovedWhitepaperAsync(normalizedSlug, requestedWhitepaperId, cancellationToken);
            var (companyDoc, approvedCompany, approvedWhitepaper) = (lookup.CompanyDoc, lookup.Company, lookup.Whitepaper);
            if (companyDoc == null || approvedCompany == null || approvedWhitepaper == null)
                return NotFound(new { message = "Whitepaper not found." });

            var responseDoc = await companyDoc.Reference
                .Collection("whitepapers").Document(requestedWhitepaperId)
                .Collection("responses").Document(Clean(responseId))
                .GetSnapshotAsync(cancellationToken);

            if (!responseDoc.Exists)
                return NotFound(new { message = "This download link is no longer valid." });

            var responseData = responseDoc.ToDictionary();
            var email = GetString(responseData, "email");
            var submittedAt = responseData.TryGetValue("submittedAt", out var raw) && raw is Timestamp ts
                ? ts.ToDateTime()
                : DateTime.UtcNow;

            var pdfBytes = await BuildPdfAsync(approvedCompany, approvedWhitepaper, email, submittedAt, cancellationToken);
            var fileName = $"{SlugifyFileName(GetString(approvedWhitepaper, "title"))}.pdf";

            return File(pdfBytes, "application/pdf", fileName);
        }

        private sealed record WhitepaperLookupResult(
            DocumentSnapshot? CompanyDoc,
            Dictionary<string, object>? Company,
            Dictionary<string, object>? Whitepaper,
            bool SlugMatchedButWhitepaperMissing);

        private async Task<WhitepaperLookupResult> FindApprovedWhitepaperAsync(
            string normalizedSlug, string requestedWhitepaperId, CancellationToken cancellationToken)
        {
            var companies = await _firestore
                .Collection("companies")
                .WhereEqualTo("status", "published")
                .GetSnapshotAsync(cancellationToken);

            foreach (var candidate in companies.Documents)
            {
                var companyData = candidate.ToDictionary();

                if (GetLong(companyData, "approvedVersion") <= 0 ||
                    !companyData.TryGetValue("approvedSnapshot", out var rawApproved) ||
                    rawApproved is not Dictionary<string, object> approved)
                {
                    continue;
                }

                if (!approved.TryGetValue("company", out var rawCompany) ||
                    rawCompany is not Dictionary<string, object> approvedCompany)
                {
                    continue;
                }

                if (!string.Equals(GetString(approvedCompany, "slug"), normalizedSlug, StringComparison.OrdinalIgnoreCase))
                    continue;

                var whitepapers = GetListOfMaps(approved, "whitepapers");
                var whitepaper = whitepapers.FirstOrDefault(item =>
                    string.Equals(GetString(item, "id"), requestedWhitepaperId, StringComparison.Ordinal));

                return whitepaper == null
                    ? new WhitepaperLookupResult(null, null, null, SlugMatchedButWhitepaperMissing: true)
                    : new WhitepaperLookupResult(candidate, approvedCompany, whitepaper, SlugMatchedButWhitepaperMissing: false);
            }

            return new WhitepaperLookupResult(null, null, null, SlugMatchedButWhitepaperMissing: false);
        }

        private async Task<byte[]> BuildPdfAsync(
            Dictionary<string, object> approvedCompany, Dictionary<string, object> approvedWhitepaper,
            string recipientEmail, DateTime submittedAtUtc, CancellationToken cancellationToken)
        {
            var logoUrl = GetString(approvedCompany, "logoUrl");
            byte[]? logoBytes = null;

            if (!string.IsNullOrWhiteSpace(logoUrl))
            {
                try
                {
                    var client = _http.CreateClient();
                    client.Timeout = TimeSpan.FromSeconds(10);
                    logoBytes = await client.GetByteArrayAsync(logoUrl, cancellationToken);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "[WhitepaperDownload] Could not fetch the provider logo for the PDF header.");
                }
            }

            var request = new WhitepaperPdfRequest(
                CompanyName: GetString(approvedCompany, "name"),
                WhitepaperTitle: GetString(approvedWhitepaper, "title"),
                BodyHtml: GetString(approvedWhitepaper, "content"),
                LogoBytes: logoBytes,
                WatermarkText: $"{recipientEmail} • {submittedAtUtc:yyyy-MM-dd HH:mm} UTC",
                Restricted: true);

            return WhitepaperPdfService.Generate(request, _logger);
        }

        private static string SlugifyFileName(string title)
        {
            var slug = new string((title ?? string.Empty).Select(c => char.IsLetterOrDigit(c) ? c : '-').ToArray());
            while (slug.Contains("--")) slug = slug.Replace("--", "-");
            slug = slug.Trim('-');
            return string.IsNullOrEmpty(slug) ? "whitepaper" : slug;
        }

        private static string Clean(string? value) =>
            value?.Trim() ?? string.Empty;

        private static bool IsValidEmail(string value)
        {
            try
            {
                var address = new MailAddress(value);
                return string.Equals(
                    address.Address,
                    value,
                    StringComparison.OrdinalIgnoreCase);
            }
            catch
            {
                return false;
            }
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

        private static long GetLong(
            Dictionary<string, object> data,
            string key)
        {
            if (!data.TryGetValue(key, out var value))
                return 0;

            if (value is long longValue)
                return longValue;

            return long.TryParse(value?.ToString(), out var parsed)
                ? parsed
                : 0;
        }

        private static List<Dictionary<string, object>> GetListOfMaps(
            Dictionary<string, object> snapshot,
            string key)
        {
            if (!snapshot.TryGetValue(key, out var raw) ||
                raw is not IEnumerable<object> items)
            {
                return new List<Dictionary<string, object>>();
            }

            return items
                .OfType<Dictionary<string, object>>()
                .ToList();
        }
    }
}
