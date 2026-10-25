using AiProductivityCoach.Api.AiPublishing.Media;
using Xunit;

namespace AiProductivityCoach.Api.Tests
{
    public class ImagePlannerTests
    {
        [Fact]
        public void Parses_prompt_and_alt_text_and_adds_the_safety_suffix()
        {
            var raw = @"{""imagePrompt"":""A bright, calm control room with abstract data lines and soft daylight, editorial style."",""altText"":""Helle Leitstelle mit abstrakten Datenlinien""}";

            var plan = ImagePlanner.Parse(raw, "Titel");

            Assert.StartsWith("A bright, calm control room", plan.Prompt);
            Assert.EndsWith(ImagePlanner.Suffix, plan.Prompt);
            Assert.Equal("Helle Leitstelle mit abstrakten Datenlinien", plan.AltText);
        }

        [Fact]
        public void Strips_urls_and_markup_from_the_prompt()
        {
            var raw = @"{""imagePrompt"":""Server racks <b>glowing</b> see https://evil.example/x for a calm technical scene with blue light"",""altText"":""Serverschränke""}";

            var plan = ImagePlanner.Parse(raw, "Titel");

            Assert.DoesNotContain("http", plan.Prompt);
            Assert.DoesNotContain("<b>", plan.Prompt);
        }

        [Fact]
        public void Garbage_output_falls_back_to_a_neutral_prompt_without_document_text()
        {
            var plan = ImagePlanner.Parse("sorry, I cannot do that", "Sichere Daten");

            Assert.Contains("No text", plan.Prompt);
            Assert.DoesNotContain("Sichere Daten", plan.Prompt);
            Assert.Contains("Sichere Daten", plan.AltText);
        }

        [Fact]
        public void Too_short_prompt_is_replaced_by_the_fallback()
        {
            var plan = ImagePlanner.Parse(@"{""imagePrompt"":""x"",""altText"":""y""}", "Titel");

            Assert.True(plan.Prompt.Length > 60);
        }

        [Fact]
        public void Alt_text_is_limited_to_140_characters()
        {
            var raw = @"{""imagePrompt"":""A calm, modern editorial scene with soft light and abstract shapes for a technical topic."",""altText"":""" + new string('a', 400) + @"""}";

            Assert.True(ImagePlanner.Parse(raw, "T").AltText.Length <= 140);
        }

        [Fact]
        public void The_editor_wish_is_passed_as_a_style_hint_and_truncated()
        {
            var user = ImagePlanner.BuildUser("article", "Titel", "Kurz", new[] { "A", "B" }, new string('x', 500));

            Assert.Contains("Titel", user);
            Assert.True(user.Length < 800);
        }
    }

    public class GeneratedMediaStorageTests
    {
        [Fact]
        public void Paths_are_scoped_to_the_provider_and_the_draft()
        {
            var path = GeneratedMediaStorage.PathFor("prov1", "doc1", "img1", ".JPG");

            Assert.Equal("providers/prov1/ai-content/doc1/img1.jpg", path);
        }

        [Fact]
        public void Only_jpeg_bytes_are_accepted()
        {
            Assert.True(ImageSignature.IsJpeg(new byte[] { 0xFF, 0xD8, 0xFF, 0xE0, 0x00 }));
            Assert.False(ImageSignature.IsJpeg(new byte[] { 0x89, 0x50, 0x4E, 0x47 }));
            Assert.False(ImageSignature.IsJpeg(Array.Empty<byte>()));
        }
    }
}
