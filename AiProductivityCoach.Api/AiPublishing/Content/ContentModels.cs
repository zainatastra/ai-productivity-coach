using System.Net;
using System.Text;
using System.Text.RegularExpressions;

namespace AiProductivityCoach.Api.AiPublishing.Content
{
    public static class ContentTypes
    {
        public const string Article = "article";
        public const string Whitepaper = "whitepaper";
        public const string Webinar = "webinar";
        public const string Tutorial = "tutorial";   // reserved: "coming soon", never generated

        /// <summary>Types the engine can generate today.</summary>
        public static readonly string[] Generatable = { Article, Whitepaper, Webinar };

        public static readonly string[] All = { Article, Whitepaper, Webinar, Tutorial };

        public static bool IsGeneratable(string? type) => type != null && Generatable.Contains(type);
    }

    /// <summary>One structural element of a document. Rendered to HTML by us - never by the AI.</summary>
    public sealed record ContentBlock(
        string Type,                 // heading | paragraph | list | quote
        int Level,                   // heading level 2-3
        string Text,                 // heading / paragraph / quote text
        bool Ordered,                // list
        IReadOnlyList<string> Items) // list items
    {
        public static ContentBlock Heading(int level, string text) => new("heading", level, text, false, Array.Empty<string>());
        public static ContentBlock Paragraph(string text) => new("paragraph", 0, text, false, Array.Empty<string>());
        public static ContentBlock Quote(string text) => new("quote", 0, text, false, Array.Empty<string>());
        public static ContentBlock List(bool ordered, IReadOnlyList<string> items) => new("list", 0, string.Empty, ordered, items);
    }

    public sealed record GeneratedDocument(
        string Type,
        string Title,
        string Subtitle,
        string Excerpt,
        string SeoTitle,
        string MetaDescription,
        IReadOnlyList<ContentBlock> Blocks,
        IReadOnlyDictionary<string, object> Data,
        IReadOnlyList<int> UsedSources,
        string Notes);

    /// <summary>
    /// Turns blocks into safe HTML. Every character of text is encoded; the only markup that can
    /// appear is the fixed set of tags below (and &lt;strong&gt; from **bold**). This is the
    /// "sanitize generated HTML" rule of the specification, enforced by construction.
    /// </summary>
    public static class HtmlRenderer
    {
        private static readonly Regex Bold = new(@"\*\*(.+?)\*\*", RegexOptions.Compiled | RegexOptions.Singleline);

        public static string Render(IEnumerable<ContentBlock> blocks)
        {
            var html = new StringBuilder();

            foreach (var block in blocks)
            {
                switch (block.Type)
                {
                    case "heading":
                        var level = Math.Clamp(block.Level, 2, 3);
                        html.Append($"<h{level}>{Inline(block.Text)}</h{level}>");
                        break;

                    case "paragraph":
                        html.Append($"<p>{Inline(block.Text)}</p>");
                        break;

                    case "quote":
                        html.Append($"<blockquote><p>{Inline(block.Text)}</p></blockquote>");
                        break;

                    case "list":
                        var tag = block.Ordered ? "ol" : "ul";
                        html.Append($"<{tag}>");
                        foreach (var item in block.Items)
                            html.Append($"<li>{Inline(item)}</li>");
                        html.Append($"</{tag}>");
                        break;
                }
            }

            return html.ToString();
        }

        /// <summary>Encodes text and turns **bold** into &lt;strong&gt;.</summary>
        public static string Inline(string text)
        {
            // Escape only what is dangerous in HTML; keep umlauts and other letters readable.
            var encoded = (text ?? string.Empty)
                .Replace("&", "&amp;")
                .Replace("<", "&lt;")
                .Replace(">", "&gt;")
                .Replace("\"", "&quot;")
                .Replace("'", "&#39;");

            return Bold.Replace(encoded, "<strong>$1</strong>");
        }

        public static string PlainText(IEnumerable<ContentBlock> blocks)
        {
            var text = new StringBuilder();

            foreach (var block in blocks)
            {
                if (block.Type == "list")
                {
                    foreach (var item in block.Items) text.AppendLine(Strip(item));
                }
                else
                {
                    text.AppendLine(Strip(block.Text));
                }
            }

            return text.ToString();
        }

        public static string Strip(string text) => text.Replace("**", string.Empty);

        public static int WordCount(string text) =>
            Regex.Matches(text ?? string.Empty, @"[\p{L}\p{N}][\p{L}\p{N}\-\.']*").Count;
    }
}
