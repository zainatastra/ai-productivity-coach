using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using HtmlAgilityPack;

namespace AiProductivityCoach.Api.AiPublishing.Knowledge
{
    public sealed record ExtractedPage(
        string Title,
        string? Description,
        string? Language,
        string Text,
        string Hash,
        IReadOnlyList<string> Links);

    /// <summary>
    /// Turns a raw HTML page into clean, structured main-content text
    /// (headings as "#", list items as "-") and collects outgoing links.
    /// Menus, footers, cookie banners, scripts and forms are removed.
    /// </summary>
    public static class HtmlTextExtractor
    {
        public const int MaxTextLength = 60_000;

        private static readonly HashSet<string> DropTags = new(StringComparer.OrdinalIgnoreCase)
        {
            "script", "style", "noscript", "svg", "iframe", "canvas", "template", "form",
            "nav", "footer", "aside", "button", "select", "input", "textarea", "object", "embed"
        };

        private static readonly string[] DropRoles = { "navigation", "banner", "contentinfo", "dialog", "search" };

        // Class/id TOKENS (whole token or prefix) that mark boilerplate overlays and widgets.
        private static readonly string[] BoilerplatePrefixes =
        {
            "cookie", "consent", "gdpr", "cmplz", "borlabs", "breadcrumb", "newsletter", "popup",
            "modal", "social", "share", "skip", "sidebar", "widget-area", "back-to-top", "lang-switch"
        };

        private static readonly HashSet<string> BlockTags = new(StringComparer.OrdinalIgnoreCase)
        {
            "p", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "tr", "dt", "dd", "figcaption", "summary"
        };

        public static ExtractedPage Extract(string html, Uri baseUri)
        {
            var doc = new HtmlDocument { OptionMaxNestedChildNodes = 300 };
            doc.LoadHtml(html ?? string.Empty);

            var title = Clean(doc.DocumentNode.SelectSingleNode("//title")?.InnerText);
            var description = Clean(
                doc.DocumentNode.SelectSingleNode("//meta[@name='description']")?.GetAttributeValue("content", null) ??
                doc.DocumentNode.SelectSingleNode("//meta[@property='og:description']")?.GetAttributeValue("content", null));

            var language = doc.DocumentNode.SelectSingleNode("//html")?.GetAttributeValue("lang", null)?.Trim().ToLowerInvariant();

            // Links are collected BEFORE boilerplate removal: menus are the best source of site structure.
            var links = CollectLinks(doc, baseUri);

            RemoveBoilerplate(doc);

            if (string.IsNullOrWhiteSpace(title))
                title = Clean(doc.DocumentNode.SelectSingleNode("//h1")?.InnerText);

            var root = PickContentRoot(doc);
            var blocks = new List<string>();
            Walk(root, blocks);

            var text = string.Join("\n\n", Dedupe(blocks));
            if (text.Length > MaxTextLength)
                text = text[..MaxTextLength];

            var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text))).ToLowerInvariant();

            return new ExtractedPage(title, string.IsNullOrWhiteSpace(description) ? null : description,
                string.IsNullOrWhiteSpace(language) ? null : language, text, hash, links);
        }

        // ───────────── links ─────────────

        private static List<string> CollectLinks(HtmlDocument doc, Uri baseUri)
        {
            var result = new List<string>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            var baseHref = doc.DocumentNode.SelectSingleNode("//base[@href]")?.GetAttributeValue("href", null);
            var effectiveBase = baseUri;

            if (!string.IsNullOrWhiteSpace(baseHref) &&
                Uri.TryCreate(baseUri, baseHref, out var resolvedBase))
            {
                effectiveBase = resolvedBase;
            }

            var anchors = doc.DocumentNode.SelectNodes("//a[@href]");
            if (anchors == null) return result;

            foreach (var anchor in anchors)
            {
                var href = WebUtility.HtmlDecode(anchor.GetAttributeValue("href", string.Empty)).Trim();

                if (href.Length == 0 || href.StartsWith('#') ||
                    href.StartsWith("mailto:", StringComparison.OrdinalIgnoreCase) ||
                    href.StartsWith("tel:", StringComparison.OrdinalIgnoreCase) ||
                    href.StartsWith("javascript:", StringComparison.OrdinalIgnoreCase))
                    continue;

                if (!Uri.TryCreate(effectiveBase, href, out var absolute)) continue;
                if (absolute.Scheme != Uri.UriSchemeHttp && absolute.Scheme != Uri.UriSchemeHttps) continue;

                var url = absolute.GetLeftPart(UriPartial.Path) + absolute.Query;
                if (seen.Add(url)) result.Add(url);
            }

            return result;
        }

        // ───────────── boilerplate removal ─────────────

        private static void RemoveBoilerplate(HtmlDocument doc)
        {
            var toRemove = new List<HtmlNode>();

            foreach (var node in doc.DocumentNode.Descendants().Where(n => n.NodeType == HtmlNodeType.Element))
            {
                if (node.Name.Equals("html", StringComparison.OrdinalIgnoreCase) ||
                    node.Name.Equals("body", StringComparison.OrdinalIgnoreCase) ||
                    node.Name.Equals("head", StringComparison.OrdinalIgnoreCase))
                    continue;

                if (DropTags.Contains(node.Name))
                {
                    // A <nav>/<aside>/<form> wrapper that holds the real <main>/<article> is kept.
                    if (!ContainsContentLandmark(node)) toRemove.Add(node);
                    continue;
                }

                var role = node.GetAttributeValue("role", string.Empty).ToLowerInvariant();
                if (DropRoles.Contains(role) && !ContainsContentLandmark(node))
                {
                    toRemove.Add(node);
                    continue;
                }

                if (node.GetAttributeValue("hidden", null) != null ||
                    node.GetAttributeValue("aria-hidden", string.Empty) == "true")
                {
                    toRemove.Add(node);
                    continue;
                }

                if (HasBoilerplateToken(node) && !ContainsContentLandmark(node))
                    toRemove.Add(node);
            }

            foreach (var node in toRemove)
                node.Remove();

            // <header> elements: remove only the site header (outside main/article), keep article headers.
            foreach (var header in doc.DocumentNode.Descendants("header").ToList())
            {
                if (!header.Ancestors().Any(a =>
                        a.Name.Equals("article", StringComparison.OrdinalIgnoreCase) ||
                        a.Name.Equals("main", StringComparison.OrdinalIgnoreCase) ||
                        a.Name.Equals("section", StringComparison.OrdinalIgnoreCase)) &&
                    !ContainsContentLandmark(header) &&
                    header.Descendants("h1").FirstOrDefault() == null)
                {
                    header.Remove();
                }
            }
        }

        private static bool ContainsContentLandmark(HtmlNode node) =>
            node.Descendants().Any(d =>
                d.NodeType == HtmlNodeType.Element &&
                (d.Name.Equals("main", StringComparison.OrdinalIgnoreCase) ||
                 d.Name.Equals("article", StringComparison.OrdinalIgnoreCase) ||
                 d.Name.Equals("h1", StringComparison.OrdinalIgnoreCase) ||
                 d.GetAttributeValue("role", string.Empty).Equals("main", StringComparison.OrdinalIgnoreCase)));

        private static bool HasBoilerplateToken(HtmlNode node)
        {
            var tokens = (node.GetAttributeValue("class", string.Empty) + " " + node.GetAttributeValue("id", string.Empty))
                .ToLowerInvariant()
                .Split(new[] { ' ', '\t', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);

            foreach (var token in tokens)
            {
                foreach (var prefix in BoilerplatePrefixes)
                {
                    if (token == prefix || token.StartsWith(prefix + "-", StringComparison.Ordinal) ||
                        token.StartsWith(prefix + "_", StringComparison.Ordinal))
                        return true;
                }
            }

            return false;
        }

        private static HtmlNode PickContentRoot(HtmlDocument doc)
        {
            var body = doc.DocumentNode.SelectSingleNode("//body") ?? doc.DocumentNode;

            var candidates = new[]
            {
                "//main", "//*[@role='main']", "//article", "//*[@id='content']", "//*[@id='main']",
                "//*[contains(concat(' ', normalize-space(@class), ' '), ' content ')]"
            };

            var bodyLength = TextLength(body);

            foreach (var xpath in candidates)
            {
                var found = doc.DocumentNode.SelectSingleNode(xpath);
                if (found == null) continue;

                var length = TextLength(found);

                // A landmark that holds almost nothing (e.g. one small <article> teaser) is not the page.
                if (length >= 200 && length >= bodyLength * 0.35)
                    return found;
            }

            return body;
        }

        private static int TextLength(HtmlNode node) =>
            Regex.Replace(WebUtility.HtmlDecode(node.InnerText), @"\s+", " ").Trim().Length;

        // ───────────── block walking ─────────────

        private static void Walk(HtmlNode node, List<string> blocks)
        {
            foreach (var child in node.ChildNodes)
            {
                if (child.NodeType == HtmlNodeType.Text)
                {
                    // Loose text directly inside a container (not inside a block tag).
                    var loose = Clean(child.InnerText);
                    if (loose.Length >= 40) blocks.Add(loose);
                    continue;
                }

                if (child.NodeType != HtmlNodeType.Element) continue;

                var name = child.Name.ToLowerInvariant();

                if (name.Length == 2 && name[0] == 'h' && char.IsDigit(name[1]))
                {
                    var heading = Clean(child.InnerText);
                    if (heading.Length >= 2)
                    {
                        var level = Math.Min(3, name[1] - '0');
                        blocks.Add(new string('#', level) + " " + heading);
                    }
                    continue;
                }

                if (name == "table")
                {
                    foreach (var row in child.Descendants("tr"))
                    {
                        var cells = row.ChildNodes
                            .Where(c => c.Name is "td" or "th")
                            .Select(c => Clean(c.InnerText))
                            .Where(c => c.Length > 0);

                        var line = string.Join(" | ", cells);
                        if (line.Length >= 3) blocks.Add(line);
                    }
                    continue;
                }

                if (BlockTags.Contains(name))
                {
                    var text = Clean(child.InnerText);

                    if (name == "li") text = "- " + text;

                    // Link-only fragments are menu-like noise.
                    if (text.Length < 3 || IsLinkOnlyNoise(child, text)) continue;

                    blocks.Add(text);
                    continue;
                }

                Walk(child, blocks);
            }
        }

        private static bool IsLinkOnlyNoise(HtmlNode block, string text)
        {
            if (block.Name.StartsWith('h')) return false;
            if (text.Length >= 60) return false;

            var anchors = block.Descendants("a").ToList();
            if (anchors.Count == 0) return false;

            var linkText = Clean(string.Join(" ", anchors.Select(a => a.InnerText)));
            return linkText.Length >= text.TrimStart('-', ' ').Length - 2;
        }

        private static IEnumerable<string> Dedupe(IEnumerable<string> blocks)
        {
            string? previous = null;
            var seen = new HashSet<string>(StringComparer.Ordinal);

            foreach (var block in blocks)
            {
                if (block == previous) continue;
                previous = block;

                // Repeated short blocks (e.g. "Mehr erfahren") are removed; long ones can legitimately repeat once.
                if (block.Length < 80 && !seen.Add(block)) continue;

                yield return block;
            }
        }

        private static string Clean(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return string.Empty;
            var decoded = WebUtility.HtmlDecode(value).Replace(' ', ' ');
            return Regex.Replace(decoded, @"\s+", " ").Trim();
        }
    }
}
