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
        IReadOnlyList<byte[]>? DiagramImages = null);

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

            var bytes = QuestPDF.Fluent.Document.Create(container =>
            {
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
                                row.ConstantItem(90).Height(32).Image(request.LogoBytes).FitArea();

                            row.RelativeItem().AlignRight().AlignMiddle()
                                .Text(request.CompanyName).FontSize(9).FontColor(Colors.Grey.Darken1);
                        });
                        column.Item().PaddingTop(10).LineHorizontal(0.75f).LineColor(Colors.Grey.Lighten2);
                    });

                    page.Content().PaddingTop(16).Column(column =>
                    {
                        column.Spacing(6);
                        column.Item().Text(request.WhitepaperTitle).FontSize(20).Bold().FontColor(Colors.Black);
                        column.Item().PaddingBottom(10);

                        for (var i = 0; i < blocks.Count; i++)
                        {
                            RenderBlock(column, blocks[i]);

                            if (diagramPositions.Contains(i) && diagramQueue.Count > 0)
                                column.Item().PaddingVertical(4).MaxHeight(220).Image(diagramQueue.Dequeue()).FitArea();
                        }
                    });

                    page.Footer().AlignCenter().Text(x =>
                    {
                        x.CurrentPageNumber();
                        x.Span(" / ");
                        x.TotalPages();
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

        private static void RenderBlock(ColumnDescriptor column, Block block)
        {
            switch (block.Tag)
            {
                case "h2":
                    column.Item().PaddingTop(8).Text(x =>
                    {
                        x.DefaultTextStyle(s => s.FontSize(15).Bold());
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
    }
}
