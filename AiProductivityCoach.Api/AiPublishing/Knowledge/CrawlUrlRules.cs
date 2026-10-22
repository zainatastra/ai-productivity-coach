using AiProductivityCoach.Api.AiPublishing.Security;

namespace AiProductivityCoach.Api.AiPublishing.Knowledge
{
    /// <summary>Which URLs the crawler follows and in which order.</summary>
    public static class CrawlUrlRules
    {
        private static readonly HashSet<string> SkippedExtensions = new(StringComparer.OrdinalIgnoreCase)
        {
            ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".ico", ".bmp", ".zip", ".rar", ".7z",
            ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".mp3", ".mp4", ".avi", ".mov", ".css", ".js",
            ".json", ".xml", ".txt", ".woff", ".woff2", ".ttf", ".eot", ".exe", ".dmg", ".apk", ".csv", ".rss"
        };

        // Pages without value for knowledge building (legal boilerplate, shops, technical endpoints).
        private static readonly string[] ExcludedPathParts =
        {
            "/wp-admin", "/wp-login", "/wp-json", "/wp-content", "/feed", "/login", "/logout", "/cart",
            "/warenkorb", "/checkout", "/kasse", "/search", "/suche", "/datenschutz", "/privacy", "/agb",
            "/terms", "/cookie", "/barrierefreiheit", "/accessibility", "/sitemap", "/tag/", "/author/",
            "/category/", "/kategorie/", "/cdn-cgi/", "/admin"
        };

        private static readonly string[] OtherLanguagePrefixes =
        {
            "/en/", "/fr/", "/es/", "/it/", "/nl/", "/pl/", "/pt/", "/cs/", "/tr/", "/ru/", "/zh/", "/ja/"
        };

        // Path keywords that point to useful knowledge, with a priority bonus.
        private static readonly (string Keyword, int Bonus)[] Priorities =
        {
            ("produkt", 30), ("product", 30), ("loesung", 28), ("lösung", 28), ("solution", 28), ("software", 26),
            ("leistung", 26), ("service", 24), ("dienstleistung", 26), ("angebot", 22), ("portfolio", 22),
            ("ueber-uns", 24), ("über-uns", 24), ("about", 24), ("unternehmen", 24), ("company", 22),
            ("referenz", 20), ("case", 20), ("kunden", 18), ("success", 18), ("fallstudie", 20),
            ("dokumentation", 26), ("documentation", 26), ("docs", 24), ("support", 20), ("hilfe", 18), ("faq", 16),
            ("handbuch", 22), ("manual", 22), ("anleitung", 22), ("tutorial", 22), ("technolog", 18),
            ("integration", 16), ("security", 16), ("sicherheit", 16), ("branche", 16), ("industr", 16),
            ("kontakt", 14), ("contact", 14), ("impressum", 12), ("blog", 12), ("news", 10), ("aktuell", 10),
            ("whitepaper", 18), ("webinar", 14), ("event", 10), ("presse", 10)
        };

        // Form landing / confirmation pages carry no knowledge.
        private static readonly HashSet<string> NoiseTokens = new(StringComparer.Ordinal)
        {
            "danke", "thank", "thanks", "kontaktformular", "terminanfrage", "bestaetigung", "formular", "anmeldung"
        };

        private static readonly string[] TrackingParams = { "utm_", "fbclid", "gclid", "mc_", "ref" };

        public static string BareHost(string host) =>
            host.StartsWith("www.", StringComparison.OrdinalIgnoreCase) ? host[4..] : host;

        public static bool IsSameSite(string host, string seedHost) =>
            string.Equals(BareHost(host), BareHost(seedHost), StringComparison.OrdinalIgnoreCase);

        /// <summary>
        /// Normalises a discovered link and decides whether it may be crawled.
        /// Returns null for off-site, non-HTML, excluded or unsafe URLs. Query strings are dropped.
        /// </summary>
        public static string? NormalizeCandidate(string url, string seedHost)
        {
            if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return null;

            var bare = uri.GetLeftPart(UriPartial.Path);
            var check = UrlSafety.Normalize(bare);
            if (!check.Ok || check.Host == null) return null;

            if (!IsSameSite(check.Host, seedHost)) return null;

            var path = new Uri(check.Normalized!).AbsolutePath;
            var extension = Path.GetExtension(path);

            if (!string.IsNullOrEmpty(extension) && SkippedExtensions.Contains(extension)) return null;

            var lower = path.ToLowerInvariant() + "/";
            if (ExcludedPathParts.Any(part => lower.Contains(part))) return null;
            if (PageClassifier.Tokens(path).Any(NoiseTokens.Contains)) return null;

            return check.Normalized;
        }


        // Order in which categories are served in each selection round: the rarely linked
        // but essential ones first, the abundant product pages last.
        private static readonly string[] SelectionOrder =
        {
            KnowledgeCategories.Contact, KnowledgeCategories.Description, KnowledgeCategories.Documentation,
            KnowledgeCategories.CaseStudies, KnowledgeCategories.Market, KnowledgeCategories.Technical,
            KnowledgeCategories.Products, KnowledgeCategories.ExistingContent
        };

        /// <summary>
        /// Picks up to <paramref name="budget"/> URLs so that EVERY knowledge category is
        /// represented (round-robin by category, best-scored first), then fills the rest by score.
        /// Without this, hundreds of product or blog pages would crowd out contact, references
        /// and documentation pages.
        /// </summary>
        public static List<string> SelectDiverse(IEnumerable<string> normalizedUrls, int budget, string? homepageLanguage)
        {
            var candidates = normalizedUrls
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Where(url => !IsOtherLanguage(url, homepageLanguage))
                .Select(url => (Url: url, Score: Score(url, homepageLanguage), Cats: PageClassifier.Classify(url, string.Empty, string.Empty)))
                .Where(c => c.Score > 0 || c.Cats.Count > 0)
                .OrderByDescending(c => c.Score)
                .ThenBy(c => c.Url.Length)
                .ToList();

            var selected = new List<string>();
            var taken = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            // No category may take more than its share, so one abundant kind (e.g. FAQ entries)
            // cannot crowd out the others.
            var quota = Math.Max(3, budget / 6);
            var perCategory = SelectionOrder.ToDictionary(c => c, _ => 0);

            bool progress;
            do
            {
                progress = false;

                foreach (var category in SelectionOrder)
                {
                    if (selected.Count >= budget) break;

                    if (perCategory[category] >= quota) continue;

                    var next = candidates.FirstOrDefault(c => !taken.Contains(c.Url) && c.Cats.Contains(category));
                    if (next.Url == null) continue;

                    taken.Add(next.Url);
                    selected.Add(next.Url);
                    perCategory[category]++;
                    progress = true;
                }
            }
            while (progress && selected.Count < budget);

            // Remaining budget: best-scored pages that no category round picked up.
            foreach (var candidate in candidates)
            {
                if (selected.Count >= budget) break;
                if (taken.Add(candidate.Url)) selected.Add(candidate.Url);
            }

            return selected;
        }

        public static bool HasTrackingParameter(string query) =>
            TrackingParams.Any(p => query.Contains(p, StringComparison.OrdinalIgnoreCase));

        public static bool IsOtherLanguage(string normalizedUrl, string? homepageLanguage)
        {
            if (homepageLanguage == null || !homepageLanguage.StartsWith("de", StringComparison.Ordinal)) return false;

            var path = new Uri(normalizedUrl).AbsolutePath.ToLowerInvariant();
            return OtherLanguagePrefixes.Any(prefix => path.StartsWith(prefix, StringComparison.Ordinal));
        }

        /// <summary>Higher is better. Used to pick the most valuable pages within the crawl budget.</summary>
        public static int Score(string normalizedUrl, string? homepageLanguage)
        {
            var path = new Uri(normalizedUrl).AbsolutePath.ToLowerInvariant();

            if (path is "" or "/") return 100;

            var score = 0;

            foreach (var (keyword, bonus) in Priorities)
            {
                if (path.Contains(keyword, StringComparison.Ordinal))
                    score = Math.Max(score, bonus);
            }

            // Shallow pages usually describe the company/product; deep ones are details.
            var depth = path.Count(c => c == '/');
            score -= Math.Max(0, depth - 1) * 4;

            // Prefer the site's main language: skip translated duplicates when the site is German.
            if (homepageLanguage != null && homepageLanguage.StartsWith("de", StringComparison.Ordinal) &&
                OtherLanguagePrefixes.Any(prefix => path.StartsWith(prefix, StringComparison.Ordinal)))
            {
                score -= 40;
            }

            return score;
        }
    }
}
