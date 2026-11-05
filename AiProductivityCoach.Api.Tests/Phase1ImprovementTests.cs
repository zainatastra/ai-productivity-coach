using AiProductivityCoach.Api.AiPublishing.Content;
using AiProductivityCoach.Api.AiPublishing.Review;
using Xunit;

namespace AiProductivityCoach.Api.Tests
{
    public class LengthPresetTests
    {
        [Fact]
        public void The_standard_ranges_are_the_ones_used_before_presets_existed()
        {
            Assert.Equal((450, 1200), LengthPresets.Accepted(ContentTypes.Article, null));
            Assert.Equal((1100, 3400), LengthPresets.Accepted(ContentTypes.Whitepaper, null));
            Assert.Equal((250, 1400), LengthPresets.Accepted(ContentTypes.Webinar, null));
            Assert.Equal((700, 900), LengthPresets.Target(ContentTypes.Article, "standard"));
            Assert.Equal((1800, 2500), LengthPresets.Target(ContentTypes.Whitepaper, "standard"));
        }

        [Theory]
        [InlineData(ContentTypes.Article, "extra")]
        [InlineData(ContentTypes.Webinar, "long")]
        [InlineData(ContentTypes.Whitepaper, "huge")]
        [InlineData(ContentTypes.Whitepaper, null)]
        public void Unknown_or_not_allowed_presets_fall_back_to_standard(string type, string? value)
        {
            Assert.Equal(LengthPresets.Standard, LengthPresets.Normalize(type, value));
        }

        [Fact]
        public void Each_type_offers_the_expected_presets()
        {
            Assert.Equal(new[] { "short", "standard", "long" }, LengthPresets.For(ContentTypes.Article));
            Assert.Equal(new[] { "short", "standard", "long", "extra" }, LengthPresets.For(ContentTypes.Whitepaper));
            Assert.Equal(new[] { "standard" }, LengthPresets.For(ContentTypes.Webinar));
        }

        [Fact]
        public void Targets_grow_with_the_preset_and_sit_inside_the_accepted_range()
        {
            foreach (var type in new[] { ContentTypes.Article, ContentTypes.Whitepaper })
            {
                var previousMax = 0;

                foreach (var preset in LengthPresets.For(type))
                {
                    var (tMin, tMax) = LengthPresets.Target(type, preset);
                    var (aMin, aMax) = LengthPresets.Accepted(type, preset);

                    Assert.True(tMin < tMax);
                    Assert.True(aMin < tMin && tMax < aMax, $"{type}/{preset}");
                    Assert.True(tMax > previousMax, $"{type}/{preset} should be longer than the previous preset");
                    previousMax = tMax;
                }
            }
        }

        [Fact]
        public void The_writer_prompt_names_the_chosen_range()
        {
            Assert.Contains("4.500 bis 6.000 Wörtern", ContentPrompts.WhitepaperTask("extra"));
            Assert.Contains("1.800 bis 2.500 Wörtern", ContentPrompts.WhitepaperTask());
            Assert.Contains("700 bis 900 Wörtern", ContentPrompts.ArticleTask());
            Assert.Contains("400 bis 600 Wörtern", ContentPrompts.ArticleTask("short"));
            Assert.Contains("4.500 bis 6.000", ContentPrompts.TaskFor(ContentTypes.Whitepaper, "extra"));
        }

        [Fact]
        public void Longer_documents_get_more_source_passages_and_shorter_ones_fewer()
        {
            var standard = ContentGenerationService.SettingsFor(ContentTypes.Whitepaper, "standard");

            Assert.True(ContentGenerationService.SettingsFor(ContentTypes.Whitepaper, "extra").Passages > standard.Passages);
            Assert.True(ContentGenerationService.SettingsFor(ContentTypes.Whitepaper, "long").CharLimit > standard.CharLimit);
            Assert.True(ContentGenerationService.SettingsFor(ContentTypes.Whitepaper, "short").Passages < standard.Passages);
        }

        [Fact]
        public void A_plan_item_without_a_length_uses_the_standard_length()
        {
            var item = new PlanItem("whitepaper", "Titel", "Blickwinkel", "Zielgruppe", new[] { "a", "b" }, "", PlanItemStatus.Proposed, null);

            Assert.Equal(LengthPresets.Standard, item.Length);
        }

        /// <summary>A whitepaper of about <paramref name="words"/> words, built from distinct tokens.</summary>
        private static GeneratedDocument Doc(int words)
        {
            var blocks = new List<ContentBlock>();
            var perParagraph = 100;

            for (var i = 0; i < words / perParagraph; i++)
            {
                if (i % 2 == 0) blocks.Add(ContentBlock.Heading(2, $"Abschnitt {i / 2 + 1} zur Praxis"));
                blocks.Add(ContentBlock.Paragraph(string.Join(" ", Enumerable.Range(0, perParagraph).Select(j => $"wort{i}x{j}"))));
            }

            return new GeneratedDocument(ContentTypes.Whitepaper, "Titel des Whitepapers", "Untertitel", "Kurzfassung des Whitepapers.", "SEO Titel", "Meta Beschreibung",
                blocks, new Dictionary<string, object>(), new[] { 1, 2 }, "");
        }

        [Fact]
        public void The_length_check_follows_the_chosen_preset()
        {
            var doc = Doc(1500);

            var asStandard = QualityChecker.Check(doc, Array.Empty<string>(), "de", 0, grounded: false, lengthPreset: "standard");
            var asExtra = QualityChecker.Check(doc, Array.Empty<string>(), "de", 0, grounded: false, lengthPreset: "extra");

            Assert.DoesNotContain(asStandard.Checks, c => c.Code == "too_short");
            Assert.Contains(asExtra.Checks, c => c.Code == "too_short");
        }

        [Fact]
        public void The_minimum_depends_on_the_preset()
        {
            Assert.Equal(2900, QualityChecker.MinimumWords(ContentTypes.Whitepaper, "extra"));
            Assert.Equal(1100, QualityChecker.MinimumWords(ContentTypes.Whitepaper));
            Assert.Equal(0, QualityChecker.MinimumWords(ContentTypes.Tutorial));
        }
    }
}
