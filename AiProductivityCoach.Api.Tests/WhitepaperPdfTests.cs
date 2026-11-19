using AiProductivityCoach.Api.AiPublishing.Pdf;
using Xunit;

namespace AiProductivityCoach.Api.Tests
{
    public class WhitepaperPdfTests
    {
        private const string SampleHtml =
            "<h2>Zusammenfassung</h2><p>Ein <strong>wichtiger</strong> Absatz mit Text.</p>" +
            "<ul><li>Erster Punkt</li><li>Zweiter Punkt</li></ul>" +
            "<blockquote><p>Ein Zitat.</p></blockquote>" +
            "<h2>Quellen</h2><ol class=\"sources\"><li value=\"1\">[S1] <a href=\"https://example.com\">Beispiel</a></li></ol>";

        [Fact]
        public void Generate_ProducesAValidPdf()
        {
            var request = new WhitepaperPdfRequest(
                CompanyName: "Astra Soft Digital",
                WhitepaperTitle: "Test Whitepaper",
                BodyHtml: SampleHtml,
                LogoBytes: null,
                WatermarkText: null,
                Restricted: false);

            var bytes = WhitepaperPdfService.Generate(request);

            Assert.True(bytes.Length > 500);
            Assert.Equal("%PDF", System.Text.Encoding.ASCII.GetString(bytes, 0, 4));
        }

        [Fact]
        public void Generate_WithWatermark_StillProducesAValidPdf()
        {
            var request = new WhitepaperPdfRequest(
                CompanyName: "Astra Soft Digital",
                WhitepaperTitle: "Test Whitepaper",
                BodyHtml: SampleHtml,
                LogoBytes: null,
                WatermarkText: "lead@example.com • 2026-11-19 12:00 UTC",
                Restricted: false);

            var bytes = WhitepaperPdfService.Generate(request);

            Assert.True(bytes.Length > 500);
            Assert.Equal("%PDF", System.Text.Encoding.ASCII.GetString(bytes, 0, 4));
        }

        [Fact]
        public void Generate_WithDiagrams_EmbedsThemAndStillProducesAValidPdf()
        {
            var onePixelPng = Convert.FromBase64String(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");

            var request = new WhitepaperPdfRequest(
                CompanyName: "Astra Soft Digital",
                WhitepaperTitle: "Test Whitepaper",
                BodyHtml: SampleHtml,
                LogoBytes: null,
                WatermarkText: null,
                Restricted: false,
                DiagramImages: new[] { onePixelPng, onePixelPng });

            var bytes = WhitepaperPdfService.Generate(request);

            Assert.True(bytes.Length > 500);
            Assert.Equal("%PDF", System.Text.Encoding.ASCII.GetString(bytes, 0, 4));
        }

        [Fact]
        public void Generate_WithAccentColor_StillProducesAValidPdf()
        {
            var request = new WhitepaperPdfRequest(
                CompanyName: "Astra Soft Digital",
                WhitepaperTitle: "Test Whitepaper",
                BodyHtml: SampleHtml,
                LogoBytes: null,
                WatermarkText: null,
                Restricted: false,
                AccentColor: "#A020F0");

            var bytes = WhitepaperPdfService.Generate(request);

            Assert.True(bytes.Length > 500);
            Assert.Equal("%PDF", System.Text.Encoding.ASCII.GetString(bytes, 0, 4));
        }

        [Fact]
        public void Generate_WithInvalidAccentColor_FallsBackWithoutThrowing()
        {
            var request = new WhitepaperPdfRequest(
                CompanyName: "Astra Soft Digital",
                WhitepaperTitle: "Test Whitepaper",
                BodyHtml: SampleHtml,
                LogoBytes: null,
                WatermarkText: null,
                Restricted: false,
                AccentColor: "not-a-color");

            var bytes = WhitepaperPdfService.Generate(request);

            Assert.True(bytes.Length > 500);
        }

        [Fact]
        public void BrandColorExtractor_NullBytes_ReturnsFallback()
        {
            var color = BrandColorExtractor.ExtractAccentColor(null);
            Assert.Matches("^#[0-9A-Fa-f]{6}$", color);
        }

        [Fact]
        public void BrandColorExtractor_GarbageBytes_ReturnsFallbackWithoutThrowing()
        {
            var color = BrandColorExtractor.ExtractAccentColor(new byte[] { 1, 2, 3, 4, 5 });
            Assert.Matches("^#[0-9A-Fa-f]{6}$", color);
        }

        [Fact]
        public void BrandColorExtractor_SolidRedPng_ExtractsRed()
        {
            // A small solid-red 4x4 PNG - the extractor should pick a color close to pure red.
            var redPng = Convert.FromBase64String(
                "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGP4z8AARwzEcQCukw/x0F8jngAAAABJRU5ErkJggg==");

            var color = BrandColorExtractor.ExtractAccentColor(redPng);

            Assert.Matches("^#[0-9A-Fa-f]{6}$", color);
            var r = Convert.ToInt32(color.Substring(1, 2), 16);
            var g = Convert.ToInt32(color.Substring(3, 2), 16);
            var b = Convert.ToInt32(color.Substring(5, 2), 16);
            Assert.True(r > g && r > b, $"Expected a red-dominant color, got {color}");
        }

        [Fact]
        public void Generate_Restricted_StillProducesAValidPdf()
        {
            var request = new WhitepaperPdfRequest(
                CompanyName: "Astra Soft Digital",
                WhitepaperTitle: "Test Whitepaper",
                BodyHtml: SampleHtml,
                LogoBytes: null,
                WatermarkText: "lead@example.com",
                Restricted: true);

            var bytes = WhitepaperPdfService.Generate(request);

            Assert.True(bytes.Length > 500);
            Assert.Equal("%PDF", System.Text.Encoding.ASCII.GetString(bytes, 0, 4));
        }
    }
}
