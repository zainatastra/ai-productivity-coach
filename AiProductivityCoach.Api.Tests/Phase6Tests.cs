using System.Text.Json;
using AiProductivityCoach.Api.AiPublishing.Pdf;
using AiProductivityCoach.Api.AiPublishing.Review;
using Xunit;

namespace AiProductivityCoach.Api.Tests
{
    public class SenderResolutionTests
    {
        private static EmailSettings Settings(string name = "", string address = "", params (string Platform, string Name, string Address)[] platforms) =>
            new(name, address,
                platforms.ToDictionary(p => p.Platform, p => new SenderOverride(p.Name, p.Address)),
                new Dictionary<string, Dictionary<string, object>>());

        [Fact]
        public void NothingConfigured_UsesTheBuiltInSender()
        {
            var sender = EmailTemplateStore.ResolveSender(Settings(), "eyeric");

            Assert.Equal(EmailTemplateStore.DefaultSenderName, sender.Name);
            Assert.Equal(EmailTemplateStore.DefaultSenderAddress, sender.Address);
        }

        [Fact]
        public void SharedSender_AppliesToEveryPlatform()
        {
            var settings = Settings("Redaktion", "redaktion@firma.de");

            Assert.Equal("redaktion@firma.de", EmailTemplateStore.ResolveSender(settings, "eyeric").Address);
            Assert.Equal("redaktion@firma.de", EmailTemplateStore.ResolveSender(settings, "midrange").Address);
            Assert.Equal("Redaktion", EmailTemplateStore.ResolveSender(settings, null).Name);
        }

        [Fact]
        public void PlatformSender_WinsOverTheSharedOne_OnlyForThatPlatform()
        {
            var settings = Settings("Redaktion", "redaktion@firma.de", ("midrange", "MIDRANGE Team", "team@midrange.de"));

            var midrange = EmailTemplateStore.ResolveSender(settings, "midrange");
            Assert.Equal("MIDRANGE Team", midrange.Name);
            Assert.Equal("team@midrange.de", midrange.Address);

            var eyeric = EmailTemplateStore.ResolveSender(settings, "eyeric");
            Assert.Equal("Redaktion", eyeric.Name);
            Assert.Equal("redaktion@firma.de", eyeric.Address);
        }

        [Fact]
        public void PlatformSender_WithOnlyAName_KeepsTheSharedAddress()
        {
            var settings = Settings("Redaktion", "redaktion@firma.de", ("eyeric", "EY ERIC Team", ""));

            var sender = EmailTemplateStore.ResolveSender(settings, "eyeric");

            Assert.Equal("EY ERIC Team", sender.Name);
            Assert.Equal("redaktion@firma.de", sender.Address);
        }

        [Fact]
        public void UnknownPlatform_FallsBackToTheSharedSender()
        {
            var settings = Settings("Redaktion", "redaktion@firma.de", ("midrange", "X", "x@midrange.de"));
            Assert.Equal("redaktion@firma.de", EmailTemplateStore.ResolveSender(settings, "something").Address);
        }
    }

    public class PlatformAccessTests
    {
        [Fact]
        public void SentField_NamesTheFieldEachAdapterWrites()
        {
            Assert.Equal("eyEricCompanyId", PlatformAccess.SentField("eyeric"));
            Assert.Equal("midrangeCompanyId", PlatformAccess.SentField("MIDRANGE"));
            Assert.Equal("", PlatformAccess.SentField("other"));
        }

        [Fact]
        public void IsSentTo_OnlyWhenThatPlatformsIdExists()
        {
            var provider = new Dictionary<string, object> { ["midrangeCompanyId"] = "74581", ["eyEricCompanyId"] = "" };

            Assert.True(PlatformAccess.IsSentTo(provider, "midrange"));
            Assert.False(PlatformAccess.IsSentTo(provider, "eyeric"));
            Assert.False(PlatformAccess.IsSentTo(provider, "unknown"));
        }

        [Fact]
        public void SentToOnePlatform_NeverImpliesTheOther()
        {
            var provider = new Dictionary<string, object> { ["eyEricCompanyId"] = "abc" };

            var states = PlatformAccess.SentStates(provider);

            Assert.True(states["eyeric"]);
            Assert.False(states["midrange"]);
        }

        [Fact]
        public void NeverSent_MeansNoPlatformAtAll()
        {
            var states = PlatformAccess.SentStates(new Dictionary<string, object>());
            Assert.All(states.Values, sent => Assert.False(sent));
        }
    }

    public class SenderDomainTests
    {
        [Theory]
        [InlineData("mail.example.com", "mail.example.com")]
        [InlineData("  Mail.Example.COM. ", "mail.example.com")]
        [InlineData("astrasoftdigital.com", "astrasoftdigital.com")]
        public void NormalizeDomain_AcceptsHostnames(string input, string expected) =>
            Assert.Equal(expected, ResendDomainService.NormalizeDomain(input));

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("localhost")]
        [InlineData("https://example.com")]
        [InlineData("exa mple.com")]
        [InlineData("-bad.example.com")]
        [InlineData("a@b.com")]
        [InlineData("example.com/path")]
        public void NormalizeDomain_RejectsEverythingElse(string? input) =>
            Assert.Null(ResendDomainService.NormalizeDomain(input));

        [Fact]
        public void DomainOf_ReadsThePartAfterTheAt()
        {
            Assert.Equal("firma.de", ResendDomainService.DomainOf("Info@Firma.de"));
            Assert.Null(ResendDomainService.DomainOf("not-an-address"));
            Assert.Null(ResendDomainService.DomainOf(null));
        }

        private static SenderDomain Domain(string name, string status) => new("id-" + name, name, status, Array.Empty<DnsRecord>());

        [Fact]
        public void IsUsableSender_NeedsAVerifiedDomain()
        {
            var domains = new List<SenderDomain> { Domain("firma.de", "verified"), Domain("pending.de", "not_started") };

            Assert.True(ResendDomainService.IsUsableSender("info@firma.de", domains, "auth@astrasoftdigital.com"));
            Assert.False(ResendDomainService.IsUsableSender("info@pending.de", domains, "auth@astrasoftdigital.com"));
            Assert.False(ResendDomainService.IsUsableSender("info@other.de", domains, "auth@astrasoftdigital.com"));
        }

        [Fact]
        public void IsUsableSender_SubdomainOfAVerifiedDomain_IsNotAutomaticallyUsable()
        {
            var domains = new List<SenderDomain> { Domain("firma.de", "verified") };
            Assert.False(ResendDomainService.IsUsableSender("info@mail.firma.de", domains, "auth@astrasoftdigital.com"));
        }

        [Fact]
        public void IsUsableSender_WhenDomainsCannotBeRead_OnlyTheCurrentDomainIsAllowed()
        {
            Assert.True(ResendDomainService.IsUsableSender("other@astrasoftdigital.com", null, "auth@astrasoftdigital.com"));
            Assert.False(ResendDomainService.IsUsableSender("info@firma.de", null, "auth@astrasoftdigital.com"));
        }

        [Fact]
        public void IsUsableSender_RejectsAnythingThatIsNotAnAddress()
        {
            var domains = new List<SenderDomain> { Domain("firma.de", "verified") };

            Assert.False(ResendDomainService.IsUsableSender("Evil <a@firma.de>, b@x.de", domains, "auth@astrasoftdigital.com"));
            Assert.False(ResendDomainService.IsUsableSender("", domains, "auth@astrasoftdigital.com"));
        }

        [Fact]
        public void ParseDomain_ReadsAListEntryWithoutRecords()
        {
            using var doc = JsonDocument.Parse("""{"id":"abc","name":"astrasoftdigital.com","status":"verified","region":"eu-west-1"}""");

            var domain = ResendDomainService.ParseDomain(doc.RootElement);

            Assert.Equal("abc", domain.Id);
            Assert.Equal("astrasoftdigital.com", domain.Name);
            Assert.True(domain.IsVerified);
            Assert.Empty(domain.Records);
        }

        [Fact]
        public void ParseDomain_ReadsTheDnsRecordsTheAdminMustEnter()
        {
            using var doc = JsonDocument.Parse("""
            {"id":"d1","name":"mail.firma.de","status":"not_started","records":[
              {"record":"SPF","name":"send","type":"MX","ttl":"Auto","status":"not_started","value":"feedback-smtp.eu-west-1.amazonses.com","priority":10},
              {"record":"DKIM","name":"resend._domainkey","type":"CNAME","ttl":3600,"status":"pending","value":"resend.domainkey.example.net"}
            ]}
            """);

            var domain = ResendDomainService.ParseDomain(doc.RootElement);

            Assert.False(domain.IsVerified);
            Assert.Equal(2, domain.Records.Count);
            Assert.Equal("MX", domain.Records[0].Type);
            Assert.Equal(10, domain.Records[0].Priority);
            Assert.Equal("CNAME", domain.Records[1].Type);
            Assert.Equal("3600", domain.Records[1].Ttl);
            Assert.Null(domain.Records[1].Priority);
            Assert.Equal("resend._domainkey", domain.Records[1].Name);
        }

        [Fact]
        public void ParseDomain_ToleratesMissingFields()
        {
            using var doc = JsonDocument.Parse("{}");
            var domain = ResendDomainService.ParseDomain(doc.RootElement);

            Assert.Equal("", domain.Name);
            Assert.False(domain.IsVerified);
        }
    }

    public class PlatformEmailTests
    {
        [Theory]
        [InlineData("eyeric", "EY ERIC")]
        [InlineData("MIDRANGE", "MIDRANGE")]
        [InlineData("other", "")]
        [InlineData(null, "")]
        public void PlatformLabel_NamesThePlatform(string? platform, string expected) =>
            Assert.Equal(expected, InvitationMailer.PlatformLabel(platform));

        [Fact]
        public void InvitationEmail_NamesThePlatformTheCompanyIsInvitedTo()
        {
            var html = InvitationMailer.BuildInvitationHtml("Astra Soft Digital", "kontakt@firma.de", "https://x.de/i?token=1", "en", "midrange");

            Assert.Contains("MIDRANGE", html);
            Assert.DoesNotContain("{platform}", html);
        }

        [Fact]
        public void InvitationEmail_ForEyEric_SaysEyEric()
        {
            var html = InvitationMailer.BuildInvitationHtml("Astra", "a@b.co", "https://x.de/i?token=1", "de", "eyeric");
            Assert.Contains("EY ERIC", html);
        }

        [Fact]
        public void PlatformPlaceholder_IsOfferedAndHasASampleValue()
        {
            Assert.Contains("platform", EmailTemplates.Placeholders(EmailKinds.Invitation));
            Assert.Equal("EY ERIC", EmailTemplates.SampleValues(EmailKinds.Invitation, "de")["platform"]);
        }

        [Fact]
        public void DefaultInvitationTexts_UseOnlyKnownPlaceholders()
        {
            var allowed = EmailTemplates.Placeholders(EmailKinds.Invitation);

            foreach (var lang in new[] { "de", "en" })
            {
                var c = EmailTemplates.Default(EmailKinds.Invitation, lang);
                var texts = new[] { c.Subject, c.Heading, c.Intro, c.BulletsTitle, c.Button }.Concat(c.Bullets).Concat(c.Notes);
                var used = texts.SelectMany(t => System.Text.RegularExpressions.Regex.Matches(t, @"\{([a-zA-Z]+)\}").Select(m => m.Groups[1].Value));

                Assert.All(used, name => Assert.Contains(name, allowed));
            }
        }
    }

    public class ContentPdfTests
    {
        [Theory]
        [InlineData("article", "de", "ARTIKEL")]
        [InlineData("article", "en", "ARTICLE")]
        [InlineData("webinar", "de", "WEBINAR")]
        [InlineData("whitepaper", "en", "WHITEPAPER")]
        [InlineData("anything", "de", "WHITEPAPER")]
        public void DocumentLabel_NamesTheContentType(string type, string language, string expected) =>
            Assert.Equal(expected, ContentPdfBuilder.DocumentLabel(type, language));

        [Theory]
        [InlineData("Qualitätsgates in CI/CD: Welche Prüfungen zählen?", "Qualitätsgates-in-CI-CD-Welche-Prüfungen-zählen.pdf")]
        [InlineData("", "document.pdf")]
        [InlineData(null, "document.pdf")]
        [InlineData("///", "document.pdf")]
        public void FileName_IsASafeSlugOfTheTitle(string? title, string expected) =>
            Assert.Equal(expected, ContentPdfBuilder.FileName(title));

        [Fact]
        public void FileName_IsShortened()
        {
            var name = ContentPdfBuilder.FileName(new string('a', 300));
            Assert.True(name.Length <= 84);
            Assert.EndsWith(".pdf", name);
        }

        [Fact]
        public void Render_AnArticle_ProducesAValidPdf()
        {
            var prepared = new PreparedContentPdf(
                "Astra Soft Digital", "Ein Artikel", "<h2>Abschnitt</h2><p>Text mit <strong>Betonung</strong>.</p>",
                "ARTIKEL", null, "#6D28D9", Array.Empty<byte[]>());

            var bytes = ContentPdfBuilder.Render(prepared, "kontakt@firma.de • 2026-11-23 10:00 UTC");

            Assert.True(bytes.Length > 500);
            Assert.Equal("%PDF", System.Text.Encoding.ASCII.GetString(bytes, 0, 4));
        }

        [Fact]
        public void Render_IsRepeatablePerRecipient()
        {
            var prepared = new PreparedContentPdf(
                "Astra", "Titel", "<p>Text</p>", "WEBINAR", null, "#1F2937", Array.Empty<byte[]>());

            var first = ContentPdfBuilder.Render(prepared, "a@x.de");
            var second = ContentPdfBuilder.Render(prepared, "b@x.de");

            Assert.NotEmpty(first);
            Assert.NotEmpty(second);
        }
    }
}
