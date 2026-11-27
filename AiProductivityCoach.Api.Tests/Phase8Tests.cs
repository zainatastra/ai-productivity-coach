using AiProductivityCoach.Api.AiPublishing.Booking;
using Xunit;

namespace AiProductivityCoach.Api.Tests
{
    public class BookingPriceTests
    {
        private static readonly PricingSettings Global = new(250_00, 12_50, 400_00, "admin@example.com");

        [Fact]
        public void Whitepaper_IsBasePlusPricePerLeadTimesLeads()
        {
            var rates = BookingPricing.Effective("whitepaper", Global, null, null);

            // 250.00 + 12.50 * 40 = 750.00
            Assert.Equal(750_00, BookingPricing.Calculate("whitepaper", rates, 40));
        }

        [Fact]
        public void Webinar_IsTheBasicPriceOnly_WhateverTheLeads()
        {
            var rates = BookingPricing.Effective("webinar", Global, null, null);

            Assert.Equal(400_00, BookingPricing.Calculate("webinar", rates, 1));
            Assert.Equal(400_00, BookingPricing.Calculate("webinar", rates, 5000));
        }

        [Fact]
        public void APieceOwnPrice_WinsOverTheGlobalDefault_FieldByField()
        {
            var both = BookingPricing.Effective("whitepaper", Global, 100_00, 5_00);
            var onlyBase = BookingPricing.Effective("whitepaper", Global, 100_00, null);

            Assert.Equal(new PriceRates(100_00, 5_00), both);
            Assert.Equal(new PriceRates(100_00, 12_50), onlyBase);
            Assert.Equal(new PriceRates(300_00, 0), BookingPricing.Effective("webinar", Global, 300_00, 99));
        }

        [Fact]
        public void MoneyStaysExact_NoRoundingDrift() =>
            Assert.Equal(10_00 + 33 * 3, BookingPricing.Calculate("whitepaper", new PriceRates(10_00, 33), 3));

        [Fact]
        public void AbsurdlyLargeResult_IsRefusedInsteadOfWrappingAround() =>
            Assert.Throws<OverflowException>(() => BookingPricing.Calculate("whitepaper", new PriceRates(0, long.MaxValue / 2), 5));

        [Theory]
        [InlineData("whitepaper", 0, 0, false)]
        [InlineData("whitepaper", 100, 0, true)]
        [InlineData("whitepaper", 0, 100, true)]
        [InlineData("webinar", 0, 0, false)]
        [InlineData("webinar", 100, 0, true)]
        public void NothingCanBeBookedUntilAPriceIsSet(string type, long baseCents, long perLead, bool priced) =>
            Assert.Equal(priced, BookingPricing.IsPriced(type, new PriceRates(baseCents, perLead)));
    }

    public class BookingValidationTests
    {
        private static readonly DateOnly Today = new(2026, 11, 27);

        private static BookingRequest Valid(string type = "whitepaper") =>
            new(type, "2026-12-01", "morning", 50, "CIOs of mid-sized manufacturers");

        [Fact]
        public void AValidRequest_IsAccepted() => Assert.True(BookingPricing.Validate(Valid(), Today).Ok);

        [Theory]
        [InlineData("article")]
        [InlineData("tutorial")]
        [InlineData("")]
        [InlineData(null)]
        public void OnlyWhitepapersAndWebinarsCanBeBooked(string? type) =>
            Assert.Equal("not_bookable", BookingPricing.Validate(Valid() with { ContentType = type }, Today).Code);

        [Theory]
        [InlineData(null, "date_required")]
        [InlineData("", "date_required")]
        [InlineData("01.12.2026", "invalid_date")]
        [InlineData("2026-13-40", "invalid_date")]
        [InlineData("2026-11-26", "date_in_past")]
        public void TheDateMustBeAValidDayThatIsNotInThePast(string? date, string code) =>
            Assert.Equal(code, BookingPricing.Validate(Valid() with { Date = date }, Today).Code);

        [Fact]
        public void Today_IsStillAllowed() =>
            Assert.True(BookingPricing.Validate(Valid() with { Date = "2026-11-27" }, Today).Ok);

        [Theory]
        [InlineData("morning", true)]
        [InlineData("AFTERNOON", true)]
        [InlineData("evening", true)]
        [InlineData("night", false)]
        [InlineData("", false)]
        [InlineData(null, false)]
        public void TheTimePeriodMustBeOneOfTheOffered(string? period, bool ok) =>
            Assert.Equal(ok, BookingPricing.Validate(Valid() with { TimePeriod = period }, Today).Ok);

        [Theory]
        [InlineData(0, false)]
        [InlineData(-5, false)]
        [InlineData(1, true)]
        [InlineData(100_000, true)]
        [InlineData(100_001, false)]
        public void LeadsMustBeBetweenOneAndTheLimit(int leads, bool ok) =>
            Assert.Equal(ok, BookingPricing.Validate(Valid() with { Leads = leads }, Today).Ok);

        [Fact]
        public void TheTargetGroupIsRequiredAndBounded()
        {
            Assert.Equal("target_group_required", BookingPricing.Validate(Valid() with { TargetGroup = "  " }, Today).Code);
            Assert.Equal("target_group_required", BookingPricing.Validate(Valid() with { TargetGroup = "ab" }, Today).Code);
            Assert.Equal("target_group_too_long", BookingPricing.Validate(Valid() with { TargetGroup = new string('x', 1001) }, Today).Code);
            Assert.True(BookingPricing.Validate(Valid() with { TargetGroup = new string('x', 1000) }, Today).Ok);
        }
    }

    public class MoneyFormatTests
    {
        [Fact]
        public void FormatsGermanAndEnglish()
        {
            Assert.Equal("1.234,50 €", BookingPricing.FormatMoney(123_450, false));
            Assert.Equal("€1,234.50", BookingPricing.FormatMoney(123_450, true));
            Assert.Equal("0,00 €", BookingPricing.FormatMoney(0, false));
        }

        [Theory]
        [InlineData("49,90", 4990)]
        [InlineData("49.90", 4990)]
        [InlineData("50", 5000)]
        [InlineData("1.234,5", 123450)]
        [InlineData("1,234.50", 123450)]
        [InlineData(" 12 ", 1200)]
        [InlineData("0", 0)]
        public void ParsesEurosIntoCents(string text, long cents) =>
            Assert.Equal(cents, BookingPricing.ParseEuros(text));

        [Theory]
        [InlineData("")]
        [InlineData("abc")]
        [InlineData("-5")]
        [InlineData("12,345")]
        [InlineData("1000001")]
        [InlineData(null)]
        public void RejectsInvalidAmounts(string? text) => Assert.Null(BookingPricing.ParseEuros(text));
    }
}
