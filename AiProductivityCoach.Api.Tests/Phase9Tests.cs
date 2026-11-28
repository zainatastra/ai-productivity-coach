using AiProductivityCoach.Api.AiPublishing.Claims;
using AiProductivityCoach.Api.AiPublishing.Import;
using Xunit;

namespace AiProductivityCoach.Api.Tests
{
    public class ProviderCsvParseTests
    {
        [Fact]
        public void ReadsNameAndWebsite_WithLineNumbersThatMatchTheFile()
        {
            var result = ProviderCsv.Parse("company_name,website\nAcme GmbH,acme.de\nBeta AG,https://beta.com\n");

            Assert.True(result.Ok);
            Assert.Equal(2, result.Rows.Count);
            Assert.Equal(new CsvRow(2, "Acme GmbH", "acme.de"), result.Rows[0]);
            Assert.Equal(3, result.Rows[1].Line);
        }

        [Theory]
        [InlineData("name;website\nAcme;acme.de", ';')]
        [InlineData("name\twebsite\nAcme\tacme.de", '\t')]
        [InlineData("name,website\nAcme,acme.de", ',')]
        public void DetectsTheDelimiter(string csv, char expected)
        {
            Assert.Equal(expected, ProviderCsv.DetectDelimiter(csv.Split('\n')[0]));
            Assert.Single(ProviderCsv.Parse(csv).Rows);
        }

        [Fact]
        public void QuotedFields_MayContainDelimitersQuotesAndLineBreaks()
        {
            var result = ProviderCsv.Parse("name,website\n\"Müller, \"\"Söhne\"\" & Co\nKG\",müller.de\n");

            Assert.True(result.Ok);
            Assert.Equal("Müller, \"Söhne\" & Co\nKG", result.Rows[0].Name);
            Assert.Equal("müller.de", result.Rows[0].Website);
        }

        [Fact]
        public void HandlesWindowsLineEndingsAndAByteOrderMark()
        {
            var result = ProviderCsv.Parse("﻿name,website\r\nAcme,acme.de\r\nBeta,beta.de\r\n");

            Assert.True(result.Ok);
            Assert.Equal(2, result.Rows.Count);
        }

        [Theory]
        [InlineData("Firma,Webseite\nAcme,acme.de")]
        [InlineData("Company Name,URL\nAcme,acme.de")]
        [InlineData("Lösungsanbieter,Homepage\nAcme,acme.de")]
        [InlineData("NAME , Website \nAcme,acme.de")]
        public void UnderstandsCommonHeaderNames(string csv) => Assert.True(ProviderCsv.Parse(csv).Ok);

        [Theory]
        [InlineData("name,email\nAcme,a@b.de")]
        [InlineData("website,email\nacme.de,a@b.de")]
        [InlineData("a,b\n1,2")]
        public void ARequiredColumnMissing_IsRefused(string csv) =>
            Assert.Equal("csv_missing_columns", ProviderCsv.Parse(csv).Error);

        [Fact]
        public void OtherColumns_AreReportedAndIgnored()
        {
            var result = ProviderCsv.Parse("name,website,country,contact\nAcme,acme.de,DE,Max");

            Assert.True(result.Ok);
            Assert.Equal(new[] { "country", "contact" }, result.IgnoredColumns);
        }

        [Fact]
        public void BlankRows_AreSkipped_ButShortRowsAreKept()
        {
            var result = ProviderCsv.Parse("name,website\n\nAcme,acme.de\n,\nBeta\n");

            Assert.Equal(2, result.Rows.Count);
            Assert.Equal("Beta", result.Rows[1].Name);
            Assert.Equal(string.Empty, result.Rows[1].Website);
        }

        [Theory]
        [InlineData(null, "csv_empty")]
        [InlineData("", "csv_empty")]
        [InlineData("   \n  ", "csv_empty")]
        [InlineData("name,website\n", "csv_no_rows")]
        public void EmptyInput_IsRefusedWithAReason(string? csv, string code) =>
            Assert.Equal(code, ProviderCsv.Parse(csv).Error);

        [Fact]
        public void TooManyRows_AreRefused()
        {
            var lines = string.Join("\n", Enumerable.Range(0, ProviderCsv.MaxRows + 1).Select(i => $"Firma {i},firma{i}.de"));

            Assert.Equal("csv_too_many_rows", ProviderCsv.Parse("name,website\n" + lines).Error);
            Assert.True(ProviderCsv.Parse("name,website\n" + string.Join("\n", Enumerable.Range(0, ProviderCsv.MaxRows).Select(i => $"Firma {i},firma{i}.de"))).Ok);
        }

        [Fact]
        public void AFileThatIsTooLarge_IsRefused() =>
            Assert.Equal("csv_too_large", ProviderCsv.Parse("name,website\n" + new string('x', ProviderCsv.MaxChars)).Error);

        [Fact]
        public void BrokenEncoding_IsFlagged_ButStillRead()
        {
            var result = ProviderCsv.Parse("name,website\nM�ller,mueller.de");

            Assert.True(result.Ok);
            Assert.True(result.EncodingIssue);
        }

        [Fact]
        public void AnUnclosedQuote_DoesNotCrashAndSwallowsOnlyTheRest()
        {
            var result = ProviderCsv.Parse("name,website\nAcme,acme.de\n\"Broken,broken.de\nMore,more.de");

            Assert.True(result.Ok);
            Assert.Equal("Acme", result.Rows[0].Name);
        }
    }

    public class ProviderCsvCheckTests
    {
        private static RowCheck One(string name, string website) => ProviderCsv.Check(new[] { new CsvRow(2, name, website) })[0];

        [Fact]
        public void AGoodRow_IsOk_WithANormalizedAddress()
        {
            var check = One("  Acme   GmbH ", "acme.de");

            Assert.Equal("ok", check.Status);
            Assert.Equal("Acme GmbH", check.Name);
            Assert.Equal("https://acme.de", check.Website);
            Assert.Equal("acme.de", check.Host);
        }

        [Theory]
        [InlineData("", "acme.de", "provider_name_required")]
        [InlineData("A", "acme.de", "provider_name_required")]
        public void ANameThatIsMissingOrTooShort_IsInvalid(string name, string website, string error)
        {
            var check = One(name, website);

            Assert.Equal("invalid", check.Status);
            Assert.Equal(error, check.Error);
        }

        [Fact]
        public void ANameThatIsTooLong_IsInvalid() =>
            Assert.Equal("provider_name_too_long", One(new string('x', 161), "acme.de").Error);

        [Theory]
        [InlineData("")]
        [InlineData("not a url")]
        [InlineData("ftp://acme.de")]
        [InlineData("http://localhost")]
        [InlineData("http://user:pw@acme.de")]
        [InlineData("http://192.168.0.1")]
        public void AnUnusableWebsite_IsInvalid(string website) => Assert.Equal("invalid", One("Acme", website).Status);

        [Fact]
        public void TheSameWebsiteTwice_FlagsTheLaterRow_EvenWithWwwOrOtherCase()
        {
            var checks = ProviderCsv.Check(new[]
            {
                new CsvRow(2, "Acme", "acme.de"),
                new CsvRow(3, "Acme Kopie", "https://WWW.Acme.de/kontakt"),
                new CsvRow(4, "Beta", "beta.de")
            });

            Assert.Equal(new[] { "ok", "duplicate_in_file", "ok" }, checks.Select(c => c.Status));
        }

        [Fact]
        public void OneBadRow_DoesNotAffectTheOthers()
        {
            var checks = ProviderCsv.Check(new[]
            {
                new CsvRow(2, "Acme", "acme.de"),
                new CsvRow(3, "", "bad"),
                new CsvRow(4, "Beta", "beta.de")
            });

            Assert.Equal(2, checks.Count(c => c.Status == "ok"));
            Assert.Equal(1, checks.Count(c => c.Status == "invalid"));
        }
    }

    public class ClaimRulesTests
    {
        private static Dictionary<string, object> Company(string status = "published", long approved = 1, string? owner = null)
        {
            var data = new Dictionary<string, object> { ["status"] = status, ["approvedVersion"] = approved };
            if (owner != null) data["ownerUid"] = owner;
            return data;
        }

        [Fact]
        public void APublishedProfileWithoutAnOwner_CanBeClaimed() => Assert.True(ClaimRules.IsClaimable(Company()));

        [Fact]
        public void AnEmptyOwner_CountsAsNoOwner() => Assert.True(ClaimRules.IsClaimable(Company(owner: "  ")));

        [Theory]
        [InlineData("draft", 1, null)]
        [InlineData("published", 0, null)]
        [InlineData("published", 1, "uid-123")]
        [InlineData("unpublished", 1, null)]
        public void OnlyALiveUnownedProfileCanBeClaimed(string status, long approved, string? owner) =>
            Assert.False(ClaimRules.IsClaimable(Company(status, approved, owner)));

        private static ClaimInput Valid() => new("Max Muster", "Max.Muster@Firma.de ", "Geschäftsführer", "+49 30 123456", "Das ist unser Profil.");

        [Fact]
        public void AValidClaim_IsAccepted_WithCleanedValues()
        {
            var result = ClaimRules.Validate(Valid() with { Name = "  Max   Muster " });

            Assert.True(result.Ok);
            Assert.Equal("Max Muster", result.Name);
            Assert.Equal("max.muster@firma.de", result.Email);
        }

        [Theory]
        [InlineData(null, "claim_name_required")]
        [InlineData("M", "claim_name_required")]
        public void TheNameIsRequired(string? name, string code) =>
            Assert.Equal(code, ClaimRules.Validate(Valid() with { Name = name }).Code);

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("not-an-email")]
        [InlineData("a@")]
        public void ARealEmailIsRequired(string? email) =>
            Assert.Equal("claim_email_invalid", ClaimRules.Validate(Valid() with { Email = email }).Code);

        [Fact]
        public void ThePositionIsRequired() =>
            Assert.Equal("claim_position_required", ClaimRules.Validate(Valid() with { Position = " " }).Code);

        [Fact]
        public void PhoneAndMessageAreOptional_ButBounded()
        {
            Assert.True(ClaimRules.Validate(Valid() with { Phone = null, Message = null }).Ok);
            Assert.Equal("claim_phone_too_long", ClaimRules.Validate(Valid() with { Phone = new string('1', 41) }).Code);
            Assert.Equal("claim_message_too_long", ClaimRules.Validate(Valid() with { Message = new string('x', 1001) }).Code);
            Assert.Equal("claim_name_too_long", ClaimRules.Validate(Valid() with { Name = new string('x', 121) }).Code);
        }

        [Theory]
        [InlineData("approve", true)]
        [InlineData("reject", true)]
        [InlineData("grant", false)]
        [InlineData("", false)]
        [InlineData(null, false)]
        public void OnlyApproveAndRejectAreDecisions(string? decision, bool valid) =>
            Assert.Equal(valid, ClaimRules.IsValidDecision(decision));

        [Theory]
        [InlineData("pending", true)]
        [InlineData("approved", false)]
        [InlineData("rejected", false)]
        [InlineData(null, false)]
        public void OnlyAWaitingRequestCanBeDecided(string? state, bool can) =>
            Assert.Equal(can, ClaimRules.CanDecide(state));
    }
}
