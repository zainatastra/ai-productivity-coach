using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AiProductivityCoach.Api.AiPublishing.Booking;
using AiProductivityCoach.Api.AiPublishing.Content;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Review;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.Controllers
{
    /// <summary>Admin side of booking: the default prices, a price on a single piece, and the list of bookings.</summary>
    [ApiController]
    [Route("api/ai")]
    [Authorize(Policy = "AdminOnly")]
    public class AiBookingController : AiControllerBase
    {
        private readonly PricingStore _pricing;
        private readonly BookingStore _bookings;
        private readonly ContentStore _content;
        private readonly InvitationMailer _mailer;
        private readonly AiAuditService _audit;

        public AiBookingController(PricingStore pricing, BookingStore bookings, ContentStore content, InvitationMailer mailer, AiAuditService audit)
        {
            _pricing = pricing;
            _bookings = bookings;
            _content = content;
            _mailer = mailer;
            _audit = audit;
        }

        public class PricingDto
        {
            public string? WhitepaperBase { get; set; }
            public string? PricePerLead { get; set; }
            public string? WebinarBase { get; set; }
            public string? AdminEmail { get; set; }
        }

        public class PiecePricingDto
        {
            public string? Base { get; set; }
            public string? PerLead { get; set; }
        }

        [HttpGet("settings/pricing")]
        public async Task<IActionResult> GetPricing()
        {
            var settings = await _pricing.LoadAsync();

            return Ok(new
            {
                whitepaperBaseCents = settings.WhitepaperBaseCents,
                pricePerLeadCents = settings.PricePerLeadCents,
                webinarBaseCents = settings.WebinarBaseCents,
                adminEmail = settings.AdminEmail,
                emailConfigured = _mailer.IsConfigured
            });
        }

        /// <summary>Amounts arrive as typed euros ("49,90"); an empty field means "not set". Anything else that is not an amount is refused.</summary>
        private static bool TryAmount(string? text, out long cents)
        {
            cents = 0;
            if (string.IsNullOrWhiteSpace(text)) return true;

            var parsed = BookingPricing.ParseEuros(text);
            if (parsed == null) return false;

            cents = parsed.Value;
            return true;
        }

        [HttpPut("settings/pricing")]
        public async Task<IActionResult> SetPricing([FromBody] PricingDto? request)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            if (!TryAmount(request?.WhitepaperBase, out var whitepaperBase) ||
                !TryAmount(request?.PricePerLead, out var perLead) ||
                !TryAmount(request?.WebinarBase, out var webinarBase))
                return Error(400, "invalid_price", "Please enter valid amounts.");

            var email = string.Empty;
            if (!string.IsNullOrWhiteSpace(request?.AdminEmail))
            {
                email = InvitationTokens.NormalizeEmail(request.AdminEmail) ?? string.Empty;
                if (email.Length == 0) return Error(400, "invalid_email", "Please enter a valid email address.");
            }

            await _pricing.SaveAsync(new PricingSettings(whitepaperBase, perLead, webinarBase, email));

            await _audit.LogAsync(actor, AuditActions.PricingChanged, string.Empty, null, null,
                new Dictionary<string, object>
                {
                    ["whitepaperBaseCents"] = whitepaperBase, ["pricePerLeadCents"] = perLead, ["webinarBaseCents"] = webinarBase
                });

            return await GetPricing();
        }

        /// <summary>Sets the price of one piece (an empty field falls back to the global default); both empty removes it.</summary>
        [HttpPut("content/{contentId}/pricing")]
        public async Task<IActionResult> SetPiecePricing(string contentId, [FromBody] PiecePricingDto? request)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var doc = await _content.GetAsync(contentId);
            if (doc == null) return Error(404, "content_not_found", "Content not found.");

            var data = doc.ToDictionary();
            var type = FirestoreApi.GetString(data, "type");
            if (!BookingPricing.IsBookable(type)) return Error(400, "not_bookable", "This content cannot be booked.");

            if (!TryAmount(request?.Base, out var baseCents) || !TryAmount(request?.PerLead, out var perLead))
                return Error(400, "invalid_price", "Please enter valid amounts.");

            long? baseValue = string.IsNullOrWhiteSpace(request?.Base) ? null : baseCents;
            // A webinar has only a basic price.
            long? perLeadValue = type == ContentTypes.Webinar || string.IsNullOrWhiteSpace(request?.PerLead) ? null : perLead;

            await _pricing.SetPieceOverrideAsync(contentId, baseValue, perLeadValue);

            await _audit.LogAsync(actor, AuditActions.PricingChanged, FirestoreApi.GetString(data, "providerId"), contentId, null,
                new Dictionary<string, object> { ["baseCents"] = baseValue ?? -1, ["perLeadCents"] = perLeadValue ?? -1 });

            return NoContent();
        }

        [HttpGet("bookings")]
        public async Task<IActionResult> List() => Ok(await _bookings.ListAllAsync());
    }
}
