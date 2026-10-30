using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Review;
using Xunit;

namespace AiProductivityCoach.Api.Tests
{
    public class InvitationTokenTests
    {
        [Fact]
        public void Tokens_are_long_random_and_url_safe()
        {
            var a = InvitationTokens.Generate();
            var b = InvitationTokens.Generate();

            Assert.NotEqual(a, b);
            Assert.True(a.Length >= 43);
            Assert.True(InvitationTokens.LooksValid(a));
            Assert.DoesNotContain("+", a);
            Assert.DoesNotContain("/", a);
            Assert.DoesNotContain("=", a);
        }

        [Fact]
        public void The_hash_is_stable_and_does_not_contain_the_token()
        {
            var token = InvitationTokens.Generate();
            var hash = InvitationTokens.Hash(token);

            Assert.Equal(hash, InvitationTokens.Hash(token));
            Assert.Equal(64, hash.Length);
            Assert.DoesNotContain(token, hash);
            Assert.NotEqual(hash, InvitationTokens.Hash(token + "x"));
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("short")]
        [InlineData("has spaces and is long enough to pass the length check 1234567890")]
        [InlineData("../../etc/passwd-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")]
        public void Malformed_tokens_are_rejected_before_any_lookup(string? token)
        {
            Assert.False(InvitationTokens.LooksValid(token));
        }

        [Theory]
        [InlineData(" Max.Muster@Firma.DE ", "max.muster@firma.de")]
        [InlineData("a@b.co", "a@b.co")]
        public void Emails_are_normalised(string input, string expected)
        {
            Assert.Equal(expected, InvitationTokens.NormalizeEmail(input));
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("no-at-sign")]
        [InlineData("two@@signs.de")]
        [InlineData("a@b")]
        [InlineData("white space@x.de")]
        public void Invalid_emails_are_rejected(string? input)
        {
            Assert.Null(InvitationTokens.NormalizeEmail(input));
        }

        [Theory]
        [InlineData("abcdefghij1", true)]
        [InlineData("short1a", false)]
        [InlineData("onlyletterslong", false)]
        [InlineData("1234567890123", false)]
        [InlineData(null, false)]
        public void Passwords_need_length_letters_and_digits(string? password, bool expected)
        {
            Assert.Equal(expected, InvitationTokens.IsAcceptablePassword(password));
        }
    }

    public class AttemptLimiterTests
    {
        [Fact]
        public void Allows_up_to_the_maximum_then_blocks()
        {
            var key = "test-" + Guid.NewGuid();

            Assert.True(AttemptLimiter.Allow(key, 3, TimeSpan.FromMinutes(5)));
            Assert.True(AttemptLimiter.Allow(key, 3, TimeSpan.FromMinutes(5)));
            Assert.True(AttemptLimiter.Allow(key, 3, TimeSpan.FromMinutes(5)));
            Assert.False(AttemptLimiter.Allow(key, 3, TimeSpan.FromMinutes(5)));
        }

        [Fact]
        public void Different_callers_do_not_affect_each_other()
        {
            var a = "a-" + Guid.NewGuid();
            var b = "b-" + Guid.NewGuid();

            AttemptLimiter.Allow(a, 1, TimeSpan.FromMinutes(5));
            Assert.False(AttemptLimiter.Allow(a, 1, TimeSpan.FromMinutes(5)));
            Assert.True(AttemptLimiter.Allow(b, 1, TimeSpan.FromMinutes(5)));
        }
    }

    public class ReviewWorkflowRulesTests
    {
        [Fact]
        public void A_company_can_submit_but_never_approve_or_publish()
        {
            var company = AiRoles.CompanyPublisher;

            Assert.True(ContentWorkflow.CanTransition(ContentStatus.CompanyReview, ContentStatus.PendingAdminReview, company));
            Assert.False(ContentWorkflow.CanTransition(ContentStatus.PendingAdminReview, ContentStatus.Approved, company));
            Assert.False(ContentWorkflow.CanTransition(ContentStatus.Approved, ContentStatus.Published, company));
            Assert.False(ContentWorkflow.CanTransition(ContentStatus.Draft, ContentStatus.Approved, company));
            Assert.False(ContentWorkflow.CanTransition(ContentStatus.Draft, ContentStatus.CompanyReview, company));
        }

        [Fact]
        public void Only_the_admin_hands_over_decides_and_reopens()
        {
            var admin = AiRoles.Admin;

            Assert.True(ContentWorkflow.CanTransition(ContentStatus.Draft, ContentStatus.CompanyReview, admin));
            Assert.True(ContentWorkflow.CanTransition(ContentStatus.ChangesRequested, ContentStatus.CompanyReview, admin));
            Assert.True(ContentWorkflow.CanTransition(ContentStatus.PendingAdminReview, ContentStatus.Approved, admin));
            Assert.True(ContentWorkflow.CanTransition(ContentStatus.PendingAdminReview, ContentStatus.ChangesRequested, admin));
            Assert.True(ContentWorkflow.CanTransition(ContentStatus.PendingAdminReview, ContentStatus.Rejected, admin));
            Assert.True(ContentWorkflow.CanTransition(ContentStatus.Rejected, ContentStatus.Draft, admin));
        }

        [Fact]
        public void Skipping_steps_is_not_possible()
        {
            Assert.False(ContentWorkflow.CanTransition(ContentStatus.Draft, ContentStatus.PendingAdminReview, AiRoles.Admin));
            Assert.False(ContentWorkflow.CanTransition(ContentStatus.CompanyReview, ContentStatus.Approved, AiRoles.Admin));
            Assert.False(ContentWorkflow.CanTransition(ContentStatus.Draft, ContentStatus.Published, AiRoles.Admin));
        }

        [Fact]
        public void The_revision_limit_per_round_is_set()
        {
            Assert.InRange(ReviewStore.MaxCompanyRevisionsPerRound, 1, 20);
        }
    }
}

namespace AiProductivityCoach.Api.Tests
{
    public class InvitationEmailTests
    {
        private const string Link = "https://example.test/publisher/invite?token=abc";

        [Fact]
        public void The_german_invitation_names_the_company_once_in_german_only()
        {
            var html = InvitationMailer.BuildInvitationHtml("Astra Soft Digital", "kontakt@firma.de", Link, "de");

            Assert.Contains("Einladung annehmen", html);
            Assert.Contains("Astra Soft Digital", html);
            Assert.Contains("kontakt@firma.de", html);
            Assert.DoesNotContain("Accept invitation", html);
            Assert.DoesNotContain("You have been invited", html);
        }

        [Fact]
        public void The_english_invitation_is_english_only()
        {
            var html = InvitationMailer.BuildInvitationHtml("Astra Soft Digital", "a@b.co", Link, "en");

            Assert.Contains("Accept invitation", html);
            Assert.DoesNotContain("Einladung annehmen", html);
        }

        [Fact]
        public void The_link_appears_as_button_and_as_plain_fallback_text()
        {
            var html = InvitationMailer.BuildInvitationHtml("X", "a@b.co", Link, "de");

            Assert.Equal(2, System.Text.RegularExpressions.Regex.Matches(html, "href='" + System.Text.RegularExpressions.Regex.Escape(Link) + "'").Count);
            Assert.Contains(">" + Link + "</a>", html);
        }

        [Fact]
        public void A_company_name_cannot_inject_html()
        {
            var html = InvitationMailer.BuildInvitationHtml("<script>alert(1)</script>", "a@b.co", Link, "de");

            Assert.DoesNotContain("<script>", html);
            Assert.Contains("&lt;script&gt;", html);
        }

        [Fact]
        public void The_review_request_names_the_draft_and_its_type()
        {
            var html = InvitationMailer.BuildReviewRequestHtml("Astra", "Digitale Instandhaltung", "whitepaper", Link, "de");

            Assert.Contains("Digitale Instandhaltung", html);
            Assert.Contains("Whitepaper", html);
            Assert.Contains("Inhalt prüfen", html);
        }

        [Fact]
        public void Subjects_are_single_line_and_in_one_language()
        {
            var subject = InvitationMailer.InvitationSubject("Astra\r\nSoft", "de");

            Assert.DoesNotContain("\n", subject);
            Assert.StartsWith("Einladung:", subject);
            Assert.StartsWith("Invitation:", InvitationMailer.InvitationSubject("Astra", "en"));
        }
    }
}

namespace AiProductivityCoach.Api.Tests
{
    public class InvitationLinkTests
    {
        [Fact]
        public void The_configured_https_address_is_used_without_a_trailing_slash()
        {
            Assert.Equal("https://example.vercel.app", InvitationMailer.ResolveBaseUrl(null, "https://example.vercel.app/"));
        }

        [Fact]
        public void The_environment_setting_wins_over_the_configuration()
        {
            Assert.Equal("https://own-domain.de", InvitationMailer.ResolveBaseUrl("https://own-domain.de", "https://example.vercel.app"));
        }

        [Theory]
        [InlineData(null, null)]
        [InlineData("", "")]
        [InlineData("http://localhost:3000", null)]
        [InlineData(null, "http://localhost:3000")]
        [InlineData("not a url", "ftp://x.de")]
        public void Anything_that_is_not_a_https_address_falls_back_to_the_live_site(string? env, string? config)
        {
            Assert.Equal(InvitationMailer.DefaultPublicUrl, InvitationMailer.ResolveBaseUrl(env, config));
        }

        [Fact]
        public void The_default_is_the_live_vercel_address()
        {
            Assert.Equal("https://ai-productivity-coach-zeta.vercel.app", InvitationMailer.DefaultPublicUrl);
        }
    }
}
