using System.Globalization;
using AiProductivityCoach.Api.AiPublishing.Content;
using AiProductivityCoach.Api.AiPublishing.Domain;

namespace AiProductivityCoach.Api.AiPublishing.Booking
{
    /// <summary>The global default prices, in cents. 0 means "not set".</summary>
    public sealed record PricingSettings(long WhitepaperBaseCents, long PricePerLeadCents, long WebinarBaseCents, string AdminEmail)
    {
        public static PricingSettings Empty { get; } = new(0, 0, 0, string.Empty);
    }

    /// <summary>The rates that apply to one piece: its own override if it has one, otherwise the global default.</summary>
    public sealed record PriceRates(long BaseCents, long PerLeadCents);

    public sealed record BookingRequest(string? ContentType, string? Date, string? TimePeriod, int Leads, string? TargetGroup);

    public sealed record BookingValidation(bool Ok, string? Code);

    /// <summary>
    /// Server-side price calculation and validation of a booking (the client's formula): a whitepaper costs
    /// the basic price plus the price per lead times the requested leads; a webinar costs its basic price.
    /// Money is always whole cents, so nothing is ever rounded or drifts. The server is the only authority:
    /// whatever price a browser shows, the booking stores what is calculated here.
    /// </summary>
    public static class BookingPricing
    {
        public const int MaxLeads = 100_000;
        public const int MaxTargetGroupLength = 1000;
        public const int MinTargetGroupLength = 3;
        public const long MaxCents = 1_000_000_00; // 1,000,000.00: refuses absurd settings and results

        public static readonly string[] TimePeriods = { "morning", "afternoon", "evening" };

        public static bool IsBookable(string? contentType) =>
            contentType == ContentTypes.Whitepaper || contentType == ContentTypes.Webinar;

        public static PriceRates Effective(string contentType, PricingSettings global, long? pieceBaseCents, long? piecePerLeadCents) =>
            contentType == ContentTypes.Whitepaper
                ? new PriceRates(pieceBaseCents ?? global.WhitepaperBaseCents, piecePerLeadCents ?? global.PricePerLeadCents)
                : new PriceRates(pieceBaseCents ?? global.WebinarBaseCents, 0);

        /// <summary>A price must be set before something can be booked, otherwise a booking would cost nothing by accident.</summary>
        public static bool IsPriced(string contentType, PriceRates rates) =>
            contentType == ContentTypes.Whitepaper ? rates.BaseCents > 0 || rates.PerLeadCents > 0 : rates.BaseCents > 0;

        public static long Calculate(string contentType, PriceRates rates, int leads)
        {
            if (contentType == ContentTypes.Webinar) return rates.BaseCents;

            return checked(rates.BaseCents + rates.PerLeadCents * Math.Max(0, leads));
        }

        public static BookingValidation Validate(BookingRequest request, DateOnly today)
        {
            if (!IsBookable(request.ContentType)) return new(false, "not_bookable");

            if (string.IsNullOrWhiteSpace(request.Date)) return new(false, "date_required");
            if (!DateOnly.TryParseExact(request.Date.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
                return new(false, "invalid_date");
            if (date < today) return new(false, "date_in_past");

            if (!TimePeriods.Contains(request.TimePeriod?.Trim().ToLowerInvariant())) return new(false, "invalid_time_period");

            if (request.Leads < 1 || request.Leads > MaxLeads) return new(false, "invalid_leads");

            var group = request.TargetGroup?.Trim() ?? string.Empty;
            if (group.Length < MinTargetGroupLength) return new(false, "target_group_required");
            if (group.Length > MaxTargetGroupLength) return new(false, "target_group_too_long");

            return new(true, null);
        }

        /// <summary>1234567 → "12.345,67 €" (German) or "€12,345.67" (English).</summary>
        public static string FormatMoney(long cents, bool english)
        {
            var amount = cents / 100m;

            return english
                ? "€" + amount.ToString("N2", CultureInfo.GetCultureInfo("en-GB"))
                : amount.ToString("N2", CultureInfo.GetCultureInfo("de-DE")) + " €";
        }

        /// <summary>Parses an amount typed in euros ("49,90" or "49.90") into cents; null when it is not a valid amount.</summary>
        public static long? ParseEuros(string? text)
        {
            if (string.IsNullOrWhiteSpace(text)) return null;

            var clean = text.Trim().Replace(" ", string.Empty);

            // Exactly one separator at the end followed by 1-2 digits is the decimal mark; everything else before it is grouping.
            var lastComma = clean.LastIndexOf(',');
            var lastDot = clean.LastIndexOf('.');
            var mark = Math.Max(lastComma, lastDot);

            // A single separator followed by exactly three digits ("12,345") could be a thousands mark or a decimal
            // mark with a digit too many. Guessing wrong would price something a thousand times off, so it is refused.
            var separators = clean.Count(c => c == ',' || c == '.');
            if (separators == 1 && mark >= 0 && clean.Length - mark - 1 == 3) return null;

            string whole = clean, fraction = string.Empty;
            if (mark >= 0 && clean.Length - mark - 1 is >= 1 and <= 2)
            {
                whole = clean[..mark];
                fraction = clean[(mark + 1)..];
            }

            whole = whole.Replace(".", string.Empty).Replace(",", string.Empty);
            if (whole.Length == 0 || !whole.All(char.IsDigit) || !fraction.All(char.IsDigit)) return null;
            if (!long.TryParse(whole, out var euros)) return null;

            var cents = euros * 100 + (fraction.Length == 0 ? 0 : long.Parse(fraction.PadRight(2, '0')));
            return cents is >= 0 and <= MaxCents ? cents : null;
        }
    }
}
