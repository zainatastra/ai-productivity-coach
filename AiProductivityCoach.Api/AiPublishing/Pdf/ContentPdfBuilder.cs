using AiProductivityCoach.Api.AiPublishing.Content;
using AiProductivityCoach.Api.AiPublishing.Media;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.AiPublishing.Pdf
{
    /// <summary>Everything about one piece that is the same for every recipient: fetched once, rendered per recipient.</summary>
    public sealed record PreparedContentPdf(
        string CompanyName, string Title, string BodyHtml, string DocumentLabel,
        byte[]? Logo, string Accent, IReadOnlyList<byte[]> Diagrams);

    /// <summary>
    /// Makes the PDF of any content piece (article, whitepaper or webinar) from the draft itself, in the
    /// provider's branding. The slow parts (logo, images) are fetched once in <see cref="PrepareAsync"/>;
    /// <see cref="Render"/> is then cheap enough to run once per recipient, each with its own watermark.
    /// </summary>
    public sealed class ContentPdfBuilder
    {
        private readonly IHttpClientFactory _http;
        private readonly WhitepaperDiagramService _diagrams;
        private readonly ILogger<ContentPdfBuilder> _logger;

        public ContentPdfBuilder(IHttpClientFactory http, WhitepaperDiagramService diagrams, ILogger<ContentPdfBuilder> logger)
        {
            _http = http;
            _diagrams = diagrams;
            _logger = logger;
        }

        public async Task<PreparedContentPdf> PrepareAsync(
            IDictionary<string, object> provider, string contentId, IDictionary<string, object> content, string language, CancellationToken ct)
        {
            byte[]? logo = null;
            var logoUrl = FirestoreApi.GetString(provider, "logoUrl");

            if (!string.IsNullOrWhiteSpace(logoUrl))
            {
                try
                {
                    var client = _http.CreateClient();
                    client.Timeout = TimeSpan.FromSeconds(25);
                    logo = await client.GetByteArrayAsync(logoUrl, ct);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    _logger.LogWarning(ex, "[ContentPdf] Could not fetch the provider logo; the PDF gets no logo.");
                }
            }

            // Existing images only: preparing a PDF as a side effect must never order a new AI image.
            var diagrams = await _diagrams.GetOrGenerateAsync(contentId, ct, generateIfMissing: false);

            return new PreparedContentPdf(
                FirestoreApi.GetString(provider, "name"),
                FirestoreApi.GetString(content, "title"),
                FirestoreApi.GetString(content, "bodyHtml"),
                DocumentLabel(FirestoreApi.GetString(content, "type"), language),
                logo,
                BrandColorExtractor.ExtractAccentColor(logo),
                diagrams);
        }

        public static byte[] Render(PreparedContentPdf prepared, string? watermark, ILogger? logger = null) =>
            WhitepaperPdfService.Generate(new WhitepaperPdfRequest(
                CompanyName: prepared.CompanyName,
                WhitepaperTitle: prepared.Title,
                BodyHtml: prepared.BodyHtml,
                LogoBytes: prepared.Logo,
                WatermarkText: watermark,
                Restricted: true,
                DiagramImages: prepared.Diagrams,
                AccentColor: prepared.Accent,
                DocumentLabel: prepared.DocumentLabel), logger);

        public static string DocumentLabel(string? type, string language)
        {
            var en = Review.InvitationMailer.IsEnglish(language);

            return type switch
            {
                ContentTypes.Article => en ? "ARTICLE" : "ARTIKEL",
                ContentTypes.Webinar => "WEBINAR",
                _ => "WHITEPAPER"
            };
        }

        /// <summary>A safe download name made from the title.</summary>
        public static string FileName(string? title)
        {
            var slug = new string((title ?? string.Empty).Select(c => char.IsLetterOrDigit(c) ? c : '-').ToArray());
            while (slug.Contains("--")) slug = slug.Replace("--", "-");
            slug = slug.Trim('-');
            if (slug.Length > 80) slug = slug[..80].Trim('-');
            return (slug.Length == 0 ? "document" : slug) + ".pdf";
        }
    }
}
