using System.Text.RegularExpressions;

namespace AiProductivityCoach.Api.AiPublishing.Knowledge
{
    public static class KnowledgeCategories
    {
        public const string Identity = "identity";
        public const string Description = "description";
        public const string Products = "products";
        public const string Documentation = "documentation";
        public const string Technical = "technical";
        public const string CaseStudies = "case_studies";
        public const string ExistingContent = "existing_content";
        public const string Contact = "contact";
        public const string Market = "market";

        public static readonly string[] All =
        {
            Identity, Description, Products, Documentation, Technical,
            CaseStudies, ExistingContent, Contact, Market
        };
    }

    /// <summary>Evidence that one crawled page contributes to the knowledge base.</summary>
    public sealed record PageEvidence(string Url, IReadOnlySet<string> Categories, int TextLength);

    public sealed record CategoryReadiness(string Key, string Status, int Evidence, int Needed, int Weight);

    public sealed record Recommendation(string Code, string Category);

    public sealed record GateResult(string State, IReadOnlyList<string> Reasons);

    public sealed record ReadinessResult(
        int Score,
        IReadOnlyList<CategoryReadiness> Categories,
        IReadOnlyList<Recommendation> Recommendations,
        IReadOnlyDictionary<string, GateResult> Gates);

    /// <summary>
    /// Assigns crawled pages to the knowledge categories of the specification (section 10)
    /// with transparent keyword rules, and scores how ready a provider is for generation.
    /// Deterministic and explainable on purpose.
    /// </summary>
    public static class PageClassifier
    {
        private static readonly Regex Email = new(@"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}", RegexOptions.Compiled);
        private static readonly Regex Phone = new(@"(\+\d{1,3}[\s\-/]?)?(\(?\d{2,5}\)?[\s\-/]?)\d{3,}[\s\-/]?\d{2,}", RegexOptions.Compiled);
        private static readonly Regex Splitter = new(@"[^a-z0-9]+", RegexOptions.Compiled);

        // Keywords are matched against WHOLE WORDS of the URL path and page title (never substrings),
        // so "unternehmen" inside a long slug or "api" inside "kapital" cannot misclassify a page.
        private sealed record Rule(string Category, string[] Exact, string[] Prefix, bool UseTitle = true);

        private static readonly Rule[] Rules =
        {
            new(KnowledgeCategories.Products,
                new[] { "software", "services", "service" },
                new[] { "produkt", "product", "loesung", "solution", "leistung", "angebot", "portfolio", "dienstleistung" }),
            new(KnowledgeCategories.Documentation,
                new[] { "dokumentation", "documentation", "docs", "doc", "handbuch", "manual", "hilfe", "help", "support", "faq", "wissensdatenbank", "anleitung", "anleitungen", "tutorial", "tutorials", "howto", "api", "releasenotes" },
                new[] { "dokumentation", "documentation", "handbuch", "anleitung", "tutorial" }),
            new(KnowledgeCategories.Technical,
                new[] { "whitepaper", "datasheet" },
                new[] { "technolog", "technisch", "technical", "architektur", "architecture", "integration", "sicherheit", "security", "spezifikation", "datenblatt", "infrastruktur" }),
            new(KnowledgeCategories.CaseStudies,
                new[] { "case", "cases", "kunden", "kundenstimmen", "customer", "stories" },
                new[] { "referenz", "fallstudie", "erfolgsgeschichte", "success" }),
            new(KnowledgeCategories.ExistingContent,
                new[] { "blog", "news", "presse", "press", "artikel", "article", "magazin", "insights", "whitepaper", "webinar", "webinare", "event", "events", "mediathek", "epaper", "paper" },
                new[] { "aktuell", "pressemitteilung", "neuigkeit" }),
            new(KnowledgeCategories.Contact,
                Array.Empty<string>(),
                new[] { "kontakt", "contact", "impressum", "imprint", "ansprechpartner", "standort" }),
            new(KnowledgeCategories.Market,
                new[] { "markt", "market", "branchen", "usecase", "usecases" },
                new[] { "branche", "industr", "sektor" }),
        };

        // "About the company" pages are recognised by a whole URL SEGMENT or an explicit title phrase.
        private static readonly string[] AboutSegments =
        {
            "ueber-uns", "about", "about-us", "unternehmen", "company", "wir-ueber-uns", "leitbild",
            "mission", "vision", "profil", "firmenprofil", "das-unternehmen"
        };

        private static readonly string[] AboutTitlePhrases = { "ueber uns", "about us" };

        public static string Normalize(string? value) =>
            (value ?? string.Empty).ToLowerInvariant()
                .Replace("ä", "ae").Replace("ö", "oe").Replace("ü", "ue").Replace("ß", "ss");

        public static string[] Tokens(string? value) =>
            Splitter.Split(Normalize(value)).Where(t => t.Length > 0).ToArray();

        public static HashSet<string> Classify(string url, string title, string text)
        {
            var result = new HashSet<string>();

            var path = Uri.TryCreate(url, UriKind.Absolute, out var uri) ? uri.AbsolutePath : url;
            var pathTokens = Tokens(path);
            var titleTokens = Tokens(title);

            foreach (var rule in Rules)
            {
                bool Hit(string[] tokens) => tokens.Any(t => rule.Exact.Contains(t) || rule.Prefix.Any(p => t.StartsWith(p, StringComparison.Ordinal)));

                if (Hit(pathTokens) || (rule.UseTitle && Hit(titleTokens)))
                    result.Add(rule.Category);
            }

            var segments = Normalize(path).Split('/', StringSplitOptions.RemoveEmptyEntries);
            var normalizedTitle = Normalize(title);

            if (segments.Any(seg => AboutSegments.Contains(seg)) || AboutTitlePhrases.Any(p => normalizedTitle.Contains(p)))
            {
                result.Add(KnowledgeCategories.Identity);
                result.Add(KnowledgeCategories.Description);
            }

            // The homepage introduces the company.
            if (segments.Length == 0)
            {
                result.Add(KnowledgeCategories.Identity);
                if ((text?.Length ?? 0) >= 400) result.Add(KnowledgeCategories.Description);
            }

            // A page that actually carries contact data counts as contact evidence.
            if (!string.IsNullOrEmpty(text) && Email.IsMatch(text) && Phone.IsMatch(text))
                result.Add(KnowledgeCategories.Contact);

            return result;
        }
    }

    public static class ReadinessEvaluator
    {
        public const int MinTextForEvidence = 200;

        // (category, weight, pages needed). Weights add up to 100.
        private static readonly (string Key, int Weight, int Needed)[] Model =
        {
            (KnowledgeCategories.Identity, 10, 1),
            (KnowledgeCategories.Description, 15, 1),
            (KnowledgeCategories.Products, 20, 2),
            (KnowledgeCategories.Documentation, 15, 2),
            (KnowledgeCategories.Technical, 10, 2),
            (KnowledgeCategories.CaseStudies, 8, 1),
            (KnowledgeCategories.ExistingContent, 7, 1),
            (KnowledgeCategories.Contact, 5, 1),
            (KnowledgeCategories.Market, 10, 1),
        };

        /// <param name="productsFoundByAi">Number of products the AI profile found in the sources (counts as products evidence).</param>
        public static ReadinessResult Evaluate(IReadOnlyList<PageEvidence> pages, int productsFoundByAi = 0)
        {
            var usable = pages.Where(p => p.TextLength >= MinTextForEvidence).ToList();

            var categories = new List<CategoryReadiness>();
            double score = 0;

            foreach (var (key, weight, needed) in Model)
            {
                var evidence = usable.Count(p => p.Categories.Contains(key));

                if (key == KnowledgeCategories.Products)
                    evidence = Math.Max(evidence, Math.Min(needed, productsFoundByAi));

                var status = evidence >= needed ? "ok" : evidence > 0 ? "partial" : "missing";
                score += weight * Math.Min(1.0, (double)evidence / needed);

                categories.Add(new CategoryReadiness(key, status, evidence, needed, weight));
            }

            var total = (int)Math.Round(score);
            var recommendations = new List<Recommendation>();

            if (usable.Count == 0)
            {
                recommendations.Add(new Recommendation("no_content", string.Empty));
            }
            else
            {
                foreach (var category in categories.Where(c => c.Status != "ok"))
                {
                    recommendations.Add(new Recommendation(
                        (category.Status == "missing" ? "add_" : "more_") + category.Key,
                        category.Key));
                }
            }

            return new ReadinessResult(total, categories, recommendations, EvaluateGates(total, categories));
        }

        private static Dictionary<string, GateResult> EvaluateGates(int score, IReadOnlyList<CategoryReadiness> categories)
        {
            int Evidence(string key) => categories.First(c => c.Key == key).Evidence;

            // Low readiness warns first and only blocks when there is almost nothing to ground the text.
            GateResult Gate(int blockBelow, int warnBelow, bool needsDescription)
            {
                var reasons = new List<string>();

                if (score < blockBelow) return new GateResult("blocked", new[] { "insufficient_knowledge" });

                if (score < warnBelow) reasons.Add("low_readiness");
                if (needsDescription && Evidence(KnowledgeCategories.Description) == 0) reasons.Add("missing_description");

                return new GateResult(reasons.Count > 0 ? "warn" : "ready", reasons);
            }

            var gates = new Dictionary<string, GateResult>
            {
                ["article"] = Gate(15, 45, needsDescription: true),
                ["whitepaper"] = Gate(30, 60, needsDescription: true),
                ["webinar"] = Gate(25, 50, needsDescription: true),
            };

            // Tutorials need real product documentation; inventing UI steps is forbidden.
            if (Evidence(KnowledgeCategories.Documentation) < 2)
            {
                gates["tutorial"] = new GateResult("blocked", new[] { "tutorial_needs_documentation" });
            }
            else
            {
                gates["tutorial"] = new GateResult(score < 60 ? "warn" : "ready",
                    score < 60 ? new[] { "low_readiness" } : Array.Empty<string>());
            }

            return gates;
        }
    }
}
