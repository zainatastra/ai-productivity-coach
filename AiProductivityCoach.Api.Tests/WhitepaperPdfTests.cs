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
