using Google.Cloud.Firestore;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AiProductivityCoach.Api.AiPublishing.Booking;
using AiProductivityCoach.Api.AiPublishing.Claims;
using AiProductivityCoach.Api.AiPublishing.Review;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.Controllers
{
    /// <summary>
    /// The public side of Claim: anybody can ask to take over an unclaimed, published profile. This only creates
    /// a request for the admin; it never gives access. Whether a profile can be claimed is already public (the
    /// button only appears then); the answer never reveals whether somebody asked before.
    /// </summary>
    [ApiController]
    [Route("api/providers/{slug}/claim")]
    [AllowAnonymous]
    public class CompanyClaimsController : AiControllerBase
    {
        private readonly FirestoreDb _firestore;
        private readonly ClaimStore _claims;
        private readonly PricingStore _pricing;
        private readonly InvitationMailer _mailer;
        private readonly AiNotificationService _notifications;
        private readonly ILogger<CompanyClaimsController> _logger;

        public CompanyClaimsController(
            FirestoreDb firestore, ClaimStore claims, PricingStore pricing, InvitationMailer mailer,
            AiNotificationService notifications, ILogger<CompanyClaimsController> logger)
        {
            _firestore = firestore;
            _claims = claims;
            _pricing = pricing;
            _mailer = mailer;
            _notifications = notifications;
            _logger = logger;
        }

        public class ClaimDto
        {
            public string? Name { get; set; }
            public string? Email { get; set; }
            public string? Position { get; set; }
            public string? Phone { get; set; }
            public string? Message { get; set; }

            /// <summary>A field people never see: only a bot fills it in.</summary>
            public string? Website { get; set; }
        }

        [HttpPost]
        public async Task<IActionResult> Submit(string slug, [FromBody] ClaimDto? request)
        {
            var caller = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
            if (!AttemptLimiter.Allow($"claim-ip:{caller}", 5, TimeSpan.FromHours(1)))
                return Error(429, "too_many_attempts", "Too many attempts. Please try again later.");

            // A bot gets the same friendly answer and nothing is stored.
            if (!string.IsNullOrWhiteSpace(request?.Website)) return Ok(new { ok = true });

            var input = ClaimRules.Validate(new ClaimInput(request?.Name, request?.Email, request?.Position, request?.Phone, request?.Message));
            if (!input.Ok) return Error(400, input.Code!, "Please check your details.");

            if (!AttemptLimiter.Allow($"claim-mail:{input.Email}", 3, TimeSpan.FromDays(1)))
                return Error(429, "too_many_attempts", "Too many attempts. Please try again later.");

            var normalizedSlug = slug?.Trim().ToLowerInvariant() ?? string.Empty;
            var snapshot = await _firestore.Collection("companies")
                .WhereEqualTo("status", "published")
                .WhereEqualTo("approvedSlug", normalizedSlug)
                .Limit(1)
                .GetSnapshotAsync();

            var company = snapshot.Documents.FirstOrDefault();
            if (company == null || !ClaimRules.IsClaimable(company.ToDictionary()))
                return Error(404, "not_claimable", "This profile cannot be claimed.");

            var companyName = FirestoreApi.GetString(company.ToDictionary(), "name");

            // The same person asking twice changes nothing and is not told so.
            if (!await _claims.HasPendingAsync(company.Id, input.Email))
            {
                await _claims.CreateAsync(new Dictionary<string, object>
                {
                    ["companyId"] = company.Id, ["companyName"] = companyName, ["slug"] = normalizedSlug,
                    ["name"] = input.Name, ["email"] = input.Email, ["position"] = input.Position,
                    ["phone"] = input.Phone, ["message"] = input.Message
                });

                await _notifications.NotifyAdminsAsync("eyeric", string.Empty, null, "claim", "info",
                    $"Neue Claim-Anfrage: {companyName}", $"New claim request: {companyName}");

                var notify = (await _pricing.LoadAsync()).AdminEmail;
                if (!string.IsNullOrWhiteSpace(notify))
                {
                    var mail = await _mailer.SendClaimNotificationAsync(notify,
                        new InvitationMailer.ClaimNotice(companyName, input.Name, input.Email, input.Position, input.Phone, input.Message));
                    if (!mail.Sent) _logger.LogWarning("[Claim] Admin email could not be sent: {Error}", mail.Error);
                }
            }

            return Ok(new { ok = true });
        }
    }
}
