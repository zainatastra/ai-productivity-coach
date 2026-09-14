using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Google.Cloud.Firestore;
using System.Net.Mail;
using System.Security.Claims;

namespace AiProductivityCoach.Api.Controllers
{
    [ApiController]
    [Route("api/providers/{slug}/webinars/{webinarId}/responses")]
    public class WebinarResponsesController : ControllerBase
    {
        private readonly FirestoreDb _firestore;

        private static readonly HashSet<string> AllowedCountries =
            new(StringComparer.OrdinalIgnoreCase)
            {
                "Germany",
                "Austria",
                "Switzerland"
            };

        public WebinarResponsesController(FirestoreDb firestore)
        {
            _firestore = firestore;
        }

        public class SubmitWebinarResponseDto
        {
            public string FirstName { get; set; } = string.Empty;
            public string LastName { get; set; } = string.Empty;
            public string Email { get; set; } = string.Empty;
            public string Country { get; set; } = string.Empty;
            public string Company { get; set; } = string.Empty;
            public string Message { get; set; } = string.Empty;
            public bool ConsentAccepted { get; set; }
            public string Website { get; set; } = string.Empty; // honeypot
        }

        [HttpGet]
        [Authorize(Policy = "PublisherOnly")]
        public async Task<IActionResult> GetResponses(
            string slug,
            string webinarId,
            CancellationToken cancellationToken)
        {
            var publisherUid =
                User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

            if (string.IsNullOrWhiteSpace(publisherUid))
                return Unauthorized();

            var normalizedSlug = Clean(slug).ToLowerInvariant();
            var requestedWebinarId = Clean(webinarId);

            if (string.IsNullOrWhiteSpace(normalizedSlug) ||
                string.IsNullOrWhiteSpace(requestedWebinarId))
            {
                return BadRequest(new
                {
                    message = "Provider and webinar are required."
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

            var webinarRef = ownedCompany.Reference
                .Collection("webinars")
                .Document(requestedWebinarId);

            var webinarDoc =
                await webinarRef.GetSnapshotAsync(cancellationToken);

            if (!webinarDoc.Exists)
                return NotFound(new { message = "Webinar not found." });

            var snapshot = await webinarRef
                .Collection("responses")
                .GetSnapshotAsync(cancellationToken);

            var result = snapshot.Documents
                .Select(doc =>
                {
                    var data = doc.ToDictionary();

                    return new
                    {
                        id = doc.Id,
                        webinarId = GetString(data, "webinarId"),
                        webinarTitle = GetString(data, "webinarTitle"),
                        providerSlug = GetString(data, "providerSlug"),
                        firstName = GetString(data, "firstName"),
                        lastName = GetString(data, "lastName"),
                        email = GetString(data, "email"),
                        country = GetString(data, "country"),
                        company = GetString(data, "company"),
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
            string webinarId,
            [FromBody] SubmitWebinarResponseDto request,
            CancellationToken cancellationToken)
        {
            var normalizedSlug = Clean(slug).ToLowerInvariant();
            var requestedWebinarId = Clean(webinarId);

            if (string.IsNullOrWhiteSpace(normalizedSlug) ||
                string.IsNullOrWhiteSpace(requestedWebinarId))
            {
                return BadRequest(new { message = "Provider and webinar are required." });
            }

            // Quietly accept obvious bot submissions without persisting.
            if (!string.IsNullOrWhiteSpace(request.Website))
                return Ok(new { success = true });

            var firstName = Clean(request.FirstName);
            var lastName = Clean(request.LastName);
            var email = Clean(request.Email).ToLowerInvariant();
            var country = Clean(request.Country);
            var companyName = Clean(request.Company);
            var message = Clean(request.Message);

            if (string.IsNullOrWhiteSpace(firstName) || firstName.Length > 100)
                return BadRequest(new { message = "First name is required and must be 100 characters or fewer." });

            if (string.IsNullOrWhiteSpace(lastName) || lastName.Length > 100)
                return BadRequest(new { message = "Last name is required and must be 100 characters or fewer." });

            if (string.IsNullOrWhiteSpace(email) || email.Length > 254 || !IsValidEmail(email))
                return BadRequest(new { message = "Enter a valid email address." });

            if (!AllowedCountries.Contains(country))
            {
                return BadRequest(new
                {
                    message = "Country must be Germany, Austria or Switzerland."
                });
            }

            if (companyName.Length > 180)
                return BadRequest(new { message = "Company name must be 180 characters or fewer." });

            if (message.Length > 4000)
                return BadRequest(new { message = "Message must be 4000 characters or fewer." });

            if (!request.ConsentAccepted)
                return BadRequest(new { message = "Consent is required before submitting the form." });

            var companies = await _firestore
                .Collection("companies")
                .WhereEqualTo("status", "published")
                .GetSnapshotAsync(cancellationToken);

            DocumentSnapshot? companyDoc = null;
            Dictionary<string, object>? approvedWebinar = null;

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

                if (!string.Equals(
                        GetString(approvedCompany, "slug"),
                        normalizedSlug,
                        StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var webinars = GetListOfMaps(approved, "webinars");
                var webinar = webinars.FirstOrDefault(item =>
                    string.Equals(
                        GetString(item, "id"),
                        requestedWebinarId,
                        StringComparison.Ordinal));

                if (webinar == null)
                    return NotFound(new { message = "Webinar not found." });

                companyDoc = candidate;
                approvedWebinar = webinar;
                break;
            }

            if (companyDoc == null || approvedWebinar == null)
                return NotFound(new { message = "Provider profile not found." });

            var responseRef = companyDoc.Reference
                .Collection("webinars")
                .Document(requestedWebinarId)
                .Collection("responses")
                .Document();

            await responseRef.SetAsync(
                new Dictionary<string, object>
                {
                    ["webinarId"] = requestedWebinarId,
                    ["webinarTitle"] = GetString(approvedWebinar, "title"),
                    ["providerSlug"] = normalizedSlug,
                    ["firstName"] = firstName,
                    ["lastName"] = lastName,
                    ["email"] = email,
                    ["country"] = country,
                    ["company"] = companyName,
                    ["message"] = message,
                    ["consentAccepted"] = true,
                    ["submittedAt"] = Timestamp.GetCurrentTimestamp()
                },
                cancellationToken: cancellationToken
            );

            return StatusCode(StatusCodes.Status201Created, new
            {
                success = true,
                responseId = responseRef.Id,
                message = "Thank you. Your webinar registration has been submitted."
            });
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
