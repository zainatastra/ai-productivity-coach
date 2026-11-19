using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace AiProductivityCoach.Api.AiPublishing.Pdf
{
    /// <summary>What one whitepaper PDF needs, independent of who is downloading it or why.</summary>
    public sealed record WhitepaperPdfRequest(
        string CompanyName,
        string WhitepaperTitle,
        string BodyHtml,
        byte[]? LogoBytes,
        string? WatermarkText,
        bool Restricted,
        IReadOnlyList<byte[]>? DiagramImages = null,
        /// <summary>
        /// Hex color (e.g. "#1F2937") used for headings and the header rule, so the document
        /// carries this provider's own branding. Pass <see cref="BrandColorExtractor.ExtractAccentColor"/>
        /// on the same logo bytes, or omit to use the service's own neutral default.
        /// </summary>
        string? AccentColor = null);

    /// <summary>
    /// Renders a whitepaper's already-generated HTML (from <see cref="AiPublishing.Content.HtmlRenderer"/>,
    /// so only the fixed, whitelisted tag set below ever appears - h2/h3/p/ul/ol/li/blockquote/strong/a)
    /// into a branded, downloadable PDF. Diagrams and per-download watermark text are both optional and
    /// layered on top of the same base document, not separate pipelines.
    /// </summary>
    public static class WhitepaperPdfService
    {
        private static readonly Regex BlockPattern = new(
            @"<(h2|h3|p|ul|ol|blockquote)(?:\s+[^>]*)?>(.*?)</\1>",
            RegexOptions.Singleline | RegexOptions.Compiled);

        private static readonly Regex ListItemPattern = new(
            @"<li(?:\s+[^>]*)?>(.*?)</li>", RegexOptions.Singleline | RegexOptions.Compiled);

        private static readonly Regex InnerPPattern = new(
            @"<p(?:\s+[^>]*)?>(.*?)</p>", RegexOptions.Singleline | RegexOptions.Compiled);

        private static readonly Regex InlinePattern = new(
            @"<strong>(.*?)</strong>|<a\s+href=""(.*?)""[^>]*>(.*?)</a>",
            RegexOptions.Singleline | RegexOptions.Compiled);

        static WhitepaperPdfService()
        {
            QuestPDF.Settings.License = LicenseType.Community;
        }

        public static byte[] Generate(WhitepaperPdfRequest request, ILogger? logger = null)
        {
            var blocks = ParseBlocks(request.BodyHtml);
            var diagramPositions = PlanDiagramPositions(blocks, request.DiagramImages?.Count ?? 0);
            var diagramQueue = new Queue<byte[]>(request.DiagramImages ?? Array.Empty<byte[]>());
            string accent = IsValidHexColor(request.AccentColor) ? request.AccentColor! : Colors.Blue.Medium;

            var bytes = QuestPDF.Fluent.Document.Create(container =>
            {
                // Cover page - its own design (colored band, large title), no running header/footer.
                container.Page(cover =>
                {
                    cover.Size(PageSizes.A4);
                    cover.Margin(0);

                    cover.Content().Column(column =>
                    {
                        column.Item().Height(220).Background(accent).Padding(36).Column(band =>
                        {
                            if (request.LogoBytes is { Length: > 0 })
                                band.Item().Height(40).AlignLeft().Image(request.LogoBytes).FitHeight();

                            band.Item().PaddingTop(request.LogoBytes is { Length: > 0 } ? 16 : 0)
                                .Text(request.CompanyName).FontSize(13).FontColor(Colors.White).Bold();
                        });

                        column.Item().PaddingHorizontal(40).PaddingTop(60).Column(body =>
                        {
                            body.Item().Text("WHITEPAPER").FontSize(11).Bold().FontColor(accent)
                                .LetterSpacing(0.15f);
                            body.Item().PaddingTop(10)
                                .Text(request.WhitepaperTitle).FontSize(27).Bold().FontColor(Colors.Black).LineHeight(1.25f);
                            body.Item().PaddingTop(22).Width(70).LineHorizontal(2.5f).LineColor(accent);
                        });
                    });

                    if (!string.IsNullOrWhiteSpace(request.WatermarkText))
                    {
                        cover.Background().AlignCenter().AlignMiddle().Rotate(-40)
                            .Text(request.WatermarkText).FontSize(22).FontColor(Colors.Grey.Lighten3).Bold();
                    }

                    cover.Footer().Padding(24).AlignCenter()
                        .Text($"{request.CompanyName} · {DateTime.UtcNow:MMMM yyyy}").FontSize(9).FontColor(Colors.Grey.Darken1);
                });

                // Body - flows across as many pages as the content needs, with a running header/footer.
                container.Page(page =>
                {
                    page.Size(PageSizes.A4);
                    page.Margin(2.2f, Unit.Centimetre);
                    page.DefaultTextStyle(x => x.FontSize(10.5f).FontFamily("Lato"));

                    if (!string.IsNullOrWhiteSpace(request.WatermarkText))
                    {
                        page.Background().AlignCenter().AlignMiddle().Rotate(-40)
                            .Text(request.WatermarkText).FontSize(22).FontColor(Colors.Grey.Lighten3).Bold();
                    }

                    page.Header().Column(column =>
                    {
                        column.Item().Row(row =>
                        {
                            if (request.LogoBytes is { Length: > 0 })
                                row.ConstantItem(90).Height(28).Image(request.LogoBytes).FitArea();

                            row.RelativeItem().AlignRight().AlignMiddle()
                                .Text(request.WhitepaperTitle).FontSize(8.5f).FontColor(Colors.Grey.Darken1);
                        });
                        column.Item().PaddingTop(8).LineHorizontal(1.5f).LineColor(accent);
                    });

                    page.Content().PaddingTop(18).Column(column =>
                    {
                        column.Spacing(7);

                        for (var i = 0; i < blocks.Count; i++)
                        {
                            RenderBlock(column, blocks[i], accent);

                            if (diagramPositions.Contains(i) && diagramQueue.Count > 0)
                            {
                                column.Item().PaddingVertical(6).MaxHeight(220)
                                    .Border(0.75f).BorderColor(Colors.Grey.Lighten2)
                                    .Image(diagramQueue.Dequeue()).FitArea();
                            }
                        }
                    });

                    page.Footer().Row(row =>
                    {
                        row.RelativeItem().Text(request.CompanyName).FontSize(8).FontColor(Colors.Grey.Medium);
                        row.RelativeItem().AlignRight().Text(x =>
                        {
                            x.DefaultTextStyle(s => s.FontSize(8).FontColor(Colors.Grey.Medium));
                            x.CurrentPageNumber();
                            x.Span(" / ");
                            x.TotalPages();
                        });
                    });
                });
            }).GeneratePdf();

            return request.Restricted ? PdfEncryption.Restrict(bytes, logger) : bytes;
        }

        private sealed record Block(string Tag, string Html);

        private static List<Block> ParseBlocks(string html) =>
            BlockPattern.Matches(html ?? string.Empty)
                .Select(m => new Block(m.Groups[1].Value, m.Groups[2].Value))
                .ToList();

        /// <summary>
        /// Spreads the available diagrams evenly across the whitepaper's section headings, each
        /// placed right under the heading it illustrates - never under the final heading, which is
        /// always the sources/citations section (<see cref="AiPublishing.Content.HtmlRenderer.RenderReferences"/>),
        /// not a place for an illustration.
        /// </summary>
        private static HashSet<int> PlanDiagramPositions(List<Block> blocks, int diagramCount)
        {
            var positions = new HashSet<int>();
            if (diagramCount == 0) return positions;

            var headingIndices = blocks
                .Select((b, i) => (b, i))
                .Where(t => t.b.Tag == "h2")
                .Select(t => t.i)
                .ToList();

            if (headingIndices.Count > 1) headingIndices.RemoveAt(headingIndices.Count - 1);
            if (headingIndices.Count == 0) return positions;

            for (var d = 0; d < Math.Min(diagramCount, headingIndices.Count); d++)
            {
                var slot = (int)((d + 1) * (double)headingIndices.Count / (diagramCount + 1));
                slot = Math.Clamp(slot, 0, headingIndices.Count - 1);
                positions.Add(headingIndices[slot]);
            }

            return positions;
        }

        private static void RenderBlock(ColumnDescriptor column, Block block, string accent)
        {
            switch (block.Tag)
            {
                case "h2":
                    column.Item().PaddingTop(14).Width(28).LineHorizontal(2.5f).LineColor(accent);
                    column.Item().PaddingTop(4).Text(x =>
                    {
                        x.DefaultTextStyle(s => s.FontSize(15).Bold().FontColor(Colors.Black));
                        RenderInline(x, block.Html);
                    });
                    break;

                case "h3":
                    column.Item().PaddingTop(4).Text(x =>
                    {
                        x.DefaultTextStyle(s => s.FontSize(12.5f).Bold());
                        RenderInline(x, block.Html);
                    });
                    break;

                case "p":
                    column.Item().Text(x => RenderInline(x, block.Html));
                    break;

                case "blockquote":
                    var quoteText = InnerPPattern.Match(block.Html) is { Success: true } m ? m.Groups[1].Value : block.Html;
                    column.Item().BorderLeft(2).BorderColor(Colors.Grey.Lighten1).PaddingLeft(10).Text(x =>
                    {
                        x.DefaultTextStyle(s => s.Italic().FontColor(Colors.Grey.Darken2));
                        RenderInline(x, quoteText);
                    });
                    break;

                case "ul":
                case "ol":
                    var ordered = block.Tag == "ol";
                    var number = 1;
                    foreach (Match li in ListItemPattern.Matches(block.Html))
                    {
                        var marker = ordered ? $"{number}." : "•";
                        column.Item().Row(row =>
                        {
                            row.ConstantItem(18).Text(marker);
                            row.RelativeItem().Text(x => RenderInline(x, li.Groups[1].Value));
                        });
                        number++;
                    }
                    break;
            }
        }

        /// <summary>Only &lt;strong&gt; and &lt;a href&gt; ever appear inline - the fixed set HtmlRenderer produces.</summary>
        private static void RenderInline(TextDescriptor text, string html)
        {
            var pos = 0;
            foreach (Match m in InlinePattern.Matches(html ?? string.Empty))
            {
                if (m.Index > pos) AppendPlain(text, html![pos..m.Index]);

                if (m.Groups[1].Success)
                    text.Span(Decode(m.Groups[1].Value)).Bold();
                else
                    text.Hyperlink(Decode(m.Groups[3].Value), m.Groups[2].Value);

                pos = m.Index + m.Length;
            }

            if (pos < (html?.Length ?? 0)) AppendPlain(text, html![pos..]);
        }

        private static void AppendPlain(TextDescriptor text, string segment)
        {
            var decoded = Decode(segment);
            if (decoded.Length > 0) text.Span(decoded);
        }

        private static string Decode(string value) =>
            System.Net.WebUtility.HtmlDecode(value ?? string.Empty);

        private static readonly Regex HexColorPattern = new(@"^#[0-9A-Fa-f]{6}$", RegexOptions.Compiled);

        private static bool IsValidHexColor(string? value) =>
            !string.IsNullOrWhiteSpace(value) && HexColorPattern.IsMatch(value);
    }
}
