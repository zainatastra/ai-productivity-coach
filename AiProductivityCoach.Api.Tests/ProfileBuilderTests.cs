using AiProductivityCoach.Api.AiPublishing.Acquisition;
using AiProductivityCoach.Api.AiPublishing.Content;
using AiProductivityCoach.Api.AiPublishing.Jobs;
using AiProductivityCoach.Api.AiPublishing.Media;
using AiProductivityCoach.Api.AiPublishing.Profile;
using Xunit;

namespace AiProductivityCoach.Api.Tests
{
    public class ResearchProfileFieldsTests
    {
        private const string Excerpts =
            "[Quelle: https://x.de/]\nPROFI Engineering Systems AG wurde 1999 gegruendet und beschaeftigt 50-99 Mitarbeitende. " +
            "Hauptsitz ist Stuttgart, Deutschland. Slogan: Ihre IT, unsere Leidenschaft. " +
            "Kontakt: info@profi-ag.de, Telefon +49 711 123456, Hauptstrasse 5, 70173 Stuttgart.";

        private static string Json(string extra) => @"{
          ""companyDescription"": ""Beschreibung."", ""products"": [], ""topics"": [], ""industries"": [],
          ""contact"": {}, ""hasSoftwareProduct"": false" + (extra.Length > 0 ? ", " + extra : "") + "}";

        [Fact]
        public void Headquarters_is_kept_only_when_it_appears_in_the_sources()
        {
            var real = ResearchJobHandler.ParseProfile(Json(@"""headquarters"":""Stuttgart, Deutschland"""), Excerpts, "m")!;
            var fake = ResearchJobHandler.ParseProfile(Json(@"""headquarters"":""Erfunden, Nirgendwo"""), Excerpts, "m")!;

            Assert.Equal("Stuttgart, Deutschland", real.Headquarters);
            Assert.Equal(string.Empty, fake.Headquarters);
        }

        [Fact]
        public void Founded_year_must_be_a_plausible_four_digit_year_present_in_the_sources()
        {
            var real = ResearchJobHandler.ParseProfile(Json(@"""foundedYear"":""1999"""), Excerpts, "m")!;
            var fake = ResearchJobHandler.ParseProfile(Json(@"""foundedYear"":""1875"""), Excerpts, "m")!;
            var junk = ResearchJobHandler.ParseProfile(Json(@"""foundedYear"":""not a year"""), Excerpts, "m")!;

            Assert.Equal("1999", real.FoundedYear);
            Assert.Equal(string.Empty, fake.FoundedYear);
            Assert.Equal(string.Empty, junk.FoundedYear);
        }

        [Fact]
        public void Employee_range_needs_a_matching_digit_sequence_in_the_sources()
        {
            var real = ResearchJobHandler.ParseProfile(Json(@"""employeeRange"":""50-99 Mitarbeitende"""), Excerpts, "m")!;
            var fake = ResearchJobHandler.ParseProfile(Json(@"""employeeRange"":""500-999 Mitarbeitende"""), Excerpts, "m")!;

            Assert.Equal("50-99 Mitarbeitende", real.EmployeeRange);
            Assert.Equal(string.Empty, fake.EmployeeRange);
        }

        [Fact]
        public void Short_description_and_headline_are_trusted_summary_text_like_the_existing_description_field()
        {
            // Paraphrased summary text (like companyDescription already was) is not required to be a verbatim quote.
            var profile = ResearchJobHandler.ParseProfile(
                Json(@"""shortDescription"":""Kurzer Claim, nicht wortwoertlich."",""headline"":""Auch nicht wortwoertlich."""),
                Excerpts, "m")!;

            Assert.Equal("Kurzer Claim, nicht wortwoertlich.", profile.ShortDescription);
            Assert.Equal("Auch nicht wortwoertlich.", profile.Headline);
        }

        [Fact]
        public void Specialties_and_categories_are_capped_like_topics_and_industries()
        {
            var many = string.Join(",", Enumerable.Range(1, 30).Select(i => $"\"S{i}\""));
            var profile = ResearchJobHandler.ParseProfile(Json($@"""specialties"":[{many}],""categories"":[{many}]"), Excerpts, "m")!;

            Assert.Equal(20, profile.Specialties.Count);
            Assert.Equal(10, profile.Categories.Count);
        }
    }

    public class ProfileFieldsMergeTests
    {
        private static ProfileFields F(string shortDescription = "", string headline = "", string overview = "",
            string headquarters = "", string foundedYear = "", string employeeRange = "",
            string[]? specialties = null, string[]? categories = null) =>
            new(shortDescription, headline, overview, headquarters, foundedYear, employeeRange,
                specialties ?? Array.Empty<string>(), categories ?? Array.Empty<string>(), "", "", "");

        [Fact]
        public void An_override_field_wins_over_the_ai_value()
        {
            var ai = F(headline: "AI Claim");
            var merged = ai.MergedWith(F(headline: "Admin Claim"));

            Assert.Equal("Admin Claim", merged.Headline);
        }

        [Fact]
        public void A_blank_override_field_defers_back_to_the_ai_value()
        {
            var ai = F(headline: "AI Claim", headquarters: "Stuttgart");
            var merged = ai.MergedWith(F(headline: "", headquarters: "   "));

            Assert.Equal("AI Claim", merged.Headline);
            Assert.Equal("Stuttgart", merged.Headquarters);
        }

        [Fact]
        public void An_empty_override_list_defers_to_the_ai_list_but_a_non_empty_one_replaces_it()
        {
            var ai = F(specialties: new[] { "A", "B" });

            Assert.Equal(new[] { "A", "B" }, ai.MergedWith(F()).Specialties);
            Assert.Equal(new[] { "C" }, ai.MergedWith(F(specialties: new[] { "C" })).Specialties);
        }

        [Fact]
        public void Reresearch_after_an_override_keeps_the_admin_correction()
        {
            // Simulates: admin corrects headline -> later re-research changes the AI's raw value ->
            // the admin's correction must still win.
            var original = F(headline: "Erste KI-Version");
            var corrected = original.MergedWith(F(headline: "Admin-Korrektur"));

            var reResearched = F(headline: "Zweite KI-Version"); // a fresh research run overwrote the AI value
            var afterReResearch = reResearched.MergedWith(F(headline: "Admin-Korrektur")); // override map unchanged

            Assert.Equal("Admin-Korrektur", corrected.Headline);
            Assert.Equal("Admin-Korrektur", afterReResearch.Headline);
        }
    }

    public class ProfileFieldsMapperTests
    {
        [Fact]
        public void Round_trips_through_the_stored_map_shape()
        {
            var fields = new ProfileFields("Short", "Headline", "Overview", "HQ", "2001", "10-49",
                new[] { "Spec1", "Spec2" }, new[] { "Cat1" }, "a@b.de", "+49 1", "Street 1");

            var stored = ProfileFieldsMapper.ToOverrideMap(fields);
            var providerData = new Dictionary<string, object> { ["profileEdits"] = stored };

            var roundTripped = ProfileFieldsMapper.FromOverrides(providerData);

            Assert.Equal(fields.ShortDescription, roundTripped.ShortDescription);
            Assert.Equal(fields.Headline, roundTripped.Headline);
            Assert.Equal(fields.Overview, roundTripped.Overview);
            Assert.Equal(fields.Headquarters, roundTripped.Headquarters);
            Assert.Equal(fields.FoundedYear, roundTripped.FoundedYear);
            Assert.Equal(fields.EmployeeRange, roundTripped.EmployeeRange);
            Assert.Equal(fields.Specialties, roundTripped.Specialties);
            Assert.Equal(fields.Categories, roundTripped.Categories);
            Assert.Equal(fields.Email, roundTripped.Email);
            Assert.Equal(fields.Phone, roundTripped.Phone);
            Assert.Equal(fields.Address, roundTripped.Address);
        }

        [Fact]
        public void Missing_knowledge_profile_and_missing_overrides_both_yield_empty_fields()
        {
            var data = new Dictionary<string, object>();

            Assert.Equal(ProfileFields.Empty, ProfileFieldsMapper.FromAi(data));
            Assert.Equal(ProfileFields.Empty, ProfileFieldsMapper.FromOverrides(data));
            Assert.Equal(ProfileFields.Empty, ProfileFieldsMapper.Effective(data));
        }
    }

    public class LogoFinderTests
    {
        private static readonly Uri Base = new("https://acme.example/");

        [Fact]
        public void Finds_apple_touch_icon_and_ranks_it_above_favicon()
        {
            var html = "<html><head><link rel=\"apple-touch-icon\" href=\"/apple-touch-icon.png\">" +
                       "<link rel=\"icon\" href=\"/favicon-32.png\"></head></html>";

            var candidates = LogoFinder.Find(html, Base);

            Assert.Contains(candidates, c => c.Url == "https://acme.example/apple-touch-icon.png" && c.Kind == "apple-touch-icon");
            var appleIndex = candidates.ToList().FindIndex(c => c.Kind == "apple-touch-icon");
            var iconIndex = candidates.ToList().FindIndex(c => c.Kind == "icon");
            Assert.True(appleIndex < iconIndex);
        }

        [Fact]
        public void Finds_an_img_tag_whose_class_mentions_logo()
        {
            var html = "<div><img class=\"site-logo\" src=\"/img/brand.svg\" alt=\"ACME\"></div>";

            var candidates = LogoFinder.Find(html, Base);

            Assert.Contains(candidates, c => c.Url == "https://acme.example/img/brand.svg" && c.Kind == "img-logo");
        }

        [Fact]
        public void Resolves_relative_urls_against_the_homepage()
        {
            var html = "<link rel=\"icon\" href=\"icons/favicon.png\">";

            var candidates = LogoFinder.Find(html, Base);

            Assert.Contains(candidates, c => c.Url == "https://acme.example/icons/favicon.png");
        }

        [Fact]
        public void Always_offers_the_conventional_favicon_path_as_a_fallback()
        {
            var candidates = LogoFinder.Find("<html></html>", Base);

            Assert.Contains(candidates, c => c.Url == "https://acme.example/favicon.ico" && c.Kind == "favicon");
        }

        [Fact]
        public void Ignores_data_uris_and_deduplicates()
        {
            var html = "<link rel=\"icon\" href=\"data:image/png;base64,AAAA\">" +
                       "<link rel=\"icon\" href=\"/favicon.ico\"><link rel=\"icon\" href=\"/favicon.ico\">";

            var candidates = LogoFinder.Find(html, Base);

            Assert.DoesNotContain(candidates, c => c.Url.StartsWith("data:"));
            Assert.Single(candidates.Where(c => c.Url == "https://acme.example/favicon.ico"));
        }

        [Fact]
        public void Caps_the_number_of_candidates()
        {
            var links = string.Concat(Enumerable.Range(0, 20).Select(i => $"<link rel=\"icon\" href=\"/icon{i}.png\">"));

            Assert.True(LogoFinder.Find(links, Base).Count <= 8);
        }
    }

    public class ImageSignatureFormatTests
    {
        [Fact]
        public void Detects_each_supported_format_from_its_real_bytes()
        {
            Assert.Equal("image/png", ImageSignature.Detect(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0, 0, 0, 0, 0 }));
            Assert.Equal("image/jpeg", ImageSignature.Detect(new byte[] { 0xFF, 0xD8, 0xFF, 0xE0 }));
            Assert.Equal("image/x-icon", ImageSignature.Detect(new byte[] { 0x00, 0x00, 0x01, 0x00, 1 }));

            var webp = new byte[] { 0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50 };
            Assert.Equal("image/webp", ImageSignature.Detect(webp));
        }

        [Fact]
        public void A_renamed_html_file_pretending_to_be_an_image_is_rejected()
        {
            var html = System.Text.Encoding.UTF8.GetBytes("<html><script>evil()</script></html>");

            Assert.Null(ImageSignature.Detect(html));
        }

        [Fact]
        public void Extension_matches_the_detected_type()
        {
            Assert.Equal("png", ImageSignature.ExtensionFor("image/png"));
            Assert.Equal("ico", ImageSignature.ExtensionFor("image/x-icon"));
            Assert.Equal("webp", ImageSignature.ExtensionFor("image/webp"));
            Assert.Equal("jpg", ImageSignature.ExtensionFor("image/jpeg"));
        }
    }

    public class ProfileHeaderPlannerTests
    {
        [Fact]
        public void Never_claims_text_logos_or_real_people_should_appear()
        {
            var prompt = ProfileHeaderPlanner.Build("ACME", Array.Empty<string>(), Array.Empty<string>());

            Assert.Contains("No text", prompt);
            Assert.Contains("no logos", prompt);
            Assert.Contains("no recognizable real people", prompt);
        }

        [Fact]
        public void Picks_a_scene_matching_the_researched_industry()
        {
            var tech = ProfileHeaderPlanner.Build("ACME", new[] { "Software" }, Array.Empty<string>());
            var construction = ProfileHeaderPlanner.Build("ACME", new[] { "Bauwesen" }, Array.Empty<string>());

            Assert.NotEqual(tech, construction);
            Assert.Contains("technology", tech);
            Assert.Contains("architectural", construction);
        }

        [Fact]
        public void An_unknown_industry_still_produces_a_safe_default_prompt()
        {
            var prompt = ProfileHeaderPlanner.Build("ACME", new[] { "Voellig Unbekannt" }, Array.Empty<string>());

            Assert.False(string.IsNullOrWhiteSpace(prompt));
            Assert.Contains("No text", prompt);
        }

        [Fact]
        public void The_providers_own_name_is_never_baked_into_the_image_prompt_as_renderable_text()
        {
            // The AI image model cannot render text reliably; the prompt must never ask it to spell out the company name.
            var prompt = ProfileHeaderPlanner.Build("Very Unique Company Name Ltd", new[] { "Software" }, Array.Empty<string>());

            Assert.DoesNotContain("Very Unique Company Name Ltd", prompt);
        }
    }

    public class EyEricCompanyAdapterTests
    {
        [Theory]
        [InlineData("Astra Soft Digital", "astra-soft-digital")]
        [InlineData("Müller & Co. GmbH", "muller-co-gmbh")]
        [InlineData("  Leading   Spaces  ", "leading-spaces")]
        [InlineData("!!!", "company-")] // falls back to a generated id when nothing slug-able remains
        public void Slugify_matches_the_real_company_system_style(string input, string expectedPrefix)
        {
            var slug = EyEricCompanyAdapter.Slugify(input);

            Assert.StartsWith(expectedPrefix, slug);
            Assert.DoesNotContain(" ", slug);
            Assert.DoesNotContain("--", slug);
        }

        [Theory]
        [InlineData(ContentTypes.Article, "posts")]
        [InlineData(ContentTypes.Whitepaper, "whitepapers")]
        [InlineData(ContentTypes.Webinar, "webinars")]
        public void CollectionFor_maps_every_generatable_type(string type, string expectedCollection)
        {
            Assert.Equal(expectedCollection, EyEricCompanyAdapter.CollectionFor(type));
        }

        [Fact]
        public void CollectionFor_rejects_a_type_the_real_company_system_has_no_place_for()
        {
            Assert.Null(EyEricCompanyAdapter.CollectionFor(ContentTypes.Tutorial));
            Assert.Null(EyEricCompanyAdapter.CollectionFor("unknown"));
        }
    }

    public class MidrangeCompanyAdapterTests
    {
        [Theory]
        [InlineData(ContentTypes.Article, "posts", "post")]
        [InlineData(ContentTypes.Whitepaper, "aipc-whitepapers", "aipc_whitepaper")]
        [InlineData(ContentTypes.Webinar, "aipc-webinars", "aipc_webinar")]
        public void Maps_every_generatable_type_to_its_wordpress_post_type(string type, string expectedRestBase, string expectedPostType)
        {
            Assert.Equal(expectedRestBase, MidrangeCompanyAdapter.RestBaseFor(type));
            Assert.Equal(expectedPostType, MidrangeCompanyAdapter.PostTypeFor(type));
        }

        [Fact]
        public void RestBaseFor_rejects_a_type_wordpress_has_no_place_for()
        {
            Assert.Null(MidrangeCompanyAdapter.RestBaseFor(ContentTypes.Tutorial));
            Assert.Null(MidrangeCompanyAdapter.RestBaseFor("unknown"));
        }

        [Fact]
        public void Options_are_not_configured_until_every_required_value_is_present()
        {
            Assert.False(new MidrangeOptions().IsConfigured);
            Assert.False(new MidrangeOptions { SiteUrl = "https://example.com" }.IsConfigured);

            Assert.True(new MidrangeOptions
            {
                SiteUrl = "https://example.com",
                BasicAuthUsername = "user",
                ApiKey = "key"
            }.IsConfigured);
        }
    }
}
