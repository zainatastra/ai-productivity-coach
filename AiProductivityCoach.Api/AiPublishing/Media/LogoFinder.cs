using System.Net;
using System.Text.RegularExpressions;

namespace AiProductivityCoach.Api.AiPublishing.Media
{
    public sealed record LogoCandidate(string Url, string Kind, int Rank);

    /// <summary>
    /// Finds likely logo images on a provider's own homepage (spec section 6: "the logo is supposed
    /// to be caught from the website"). Regex-based on purpose, consistent with the rest of the
    /// crawler (<see cref="Security.SafeHttpFetcher"/> extracts title/language the same way) - this
    /// is a best-effort finder, not a full HTML parser, and the result is always a short list the
    /// admin reviews and picks from (or replaces), never an automatic silent swap of the real logo.
    /// </summary>
    public static class LogoFinder
    {
        private const int MaxCandidates = 8;

        // Lower rank = shown first. Apple touch icons are usually a clean square raster logo;
        // og:image is often a marketing banner/photo rather than the logo, so it ranks lower.
        private static readonly (string Pattern, string Kind, int Rank)[] LinkIconPatterns =
        {
            (@"rel\s*=\s*[""']apple-touch-icon(?:-precomposed)?[""'][^>]*href\s*=\s*[""']([^""']+)[""']", "apple-touch-icon", 1),
            (@"href\s*=\s*[""']([^""']+)[""'][^>]*rel\s*=\s*[""']apple-touch-icon(?:-precomposed)?[""']", "apple-touch-icon", 1),
            (@"rel\s*=\s*[""'](?:shortcut )?icon[""'][^>]*href\s*=\s*[""']([^""']+)[""']", "icon", 3),
            (@"href\s*=\s*[""']([^""']+)[""'][^>]*rel\s*=\s*[""'](?:shortcut )?icon[""']", "icon", 3),
        };

        public static IReadOnlyList<LogoCandidate> Find(string html, Uri baseUri)
        {
            var found = new List<LogoCandidate>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            void Add(string? rawUrl, string kind, int rank)
            {
                var absolute = Resolve(rawUrl, baseUri);
                if (absolute == null || !seen.Add(absolute)) return;
                found.Add(new LogoCandidate(absolute, kind, rank));
            }

            foreach (var (pattern, kind, rank) in LinkIconPatterns)
            {
                foreach (Match m in Regex.Matches(html, pattern, RegexOptions.IgnoreCase))
                    Add(WebUtility.HtmlDecode(m.Groups[1].Value), kind, rank);
            }

            // <img> tags that look like a logo by src, class, id or alt text.
            foreach (Match m in Regex.Matches(html, @"<img\b[^>]*>", RegexOptions.IgnoreCase))
            {
                var tag = m.Value;
                if (!Regex.IsMatch(tag, @"(?:class|id|alt|src)\s*=\s*[""'][^""']*logo[^""']*[""']", RegexOptions.IgnoreCase))
                    continue;

                var src = Regex.Match(tag, @"src\s*=\s*[""']([^""']+)[""']", RegexOptions.IgnoreCase);
                if (src.Success) Add(WebUtility.HtmlDecode(src.Groups[1].Value), "img-logo", 2);
            }

            foreach (Match m in Regex.Matches(html,
                @"<meta\b[^>]*property\s*=\s*[""']og:image[""'][^>]*content\s*=\s*[""']([^""']+)[""']",
                RegexOptions.IgnoreCase))
            {
                Add(WebUtility.HtmlDecode(m.Groups[1].Value), "og-image", 4);
            }

            // Last resort: the conventional favicon path always exists on most sites.
            Add(new Uri(baseUri, "/favicon.ico").AbsoluteUri, "favicon", 5);

            return found
                .OrderBy(c => c.Rank)
                .Take(MaxCandidates)
                .ToList();
        }

        private static string? Resolve(string? rawUrl, Uri baseUri)
        {
            if (string.IsNullOrWhiteSpace(rawUrl)) return null;
            if (rawUrl.StartsWith("data:", StringComparison.OrdinalIgnoreCase)) return null;

            try
            {
                // Resolving against the base (rather than first trying UriKind.Absolute on its own)
                // matters here: on some platforms Uri.TryCreate("/path", UriKind.Absolute, ...)
                // misparses a root-relative path as a Unix "file://" URI. Uri(baseUri, rawUrl)
                // handles a root-relative path, a relative path, a protocol-relative "//host/x",
                // and an already-absolute http(s) URL (which simply overrides the base) correctly.
                var resolved = new Uri(baseUri, rawUrl);
                return resolved.Scheme is "http" or "https" ? resolved.AbsoluteUri : null;
            }
            catch (UriFormatException)
            {
                return null;
            }
        }
    }
}
