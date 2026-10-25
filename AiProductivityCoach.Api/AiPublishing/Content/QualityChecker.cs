using System.Text.RegularExpressions;

namespace AiProductivityCoach.Api.AiPublishing.Content
{
    public sealed record QualityCheck(string Code, string Severity, string Detail);

    public sealed record QualityReport(
        string State,                                  // ok | warnings | issues
        IReadOnlyList<QualityCheck> Checks,
        IReadOnlyDictionary<string, object> Metrics);

    /// <summary>
    /// Automatic checks before a draft is handed to the admin (specification section 41).
    /// Deterministic on purpose: each finding can be explained and tested. Problems are reported
    /// as warnings; only structurally unusable output is an "issue".
    /// </summary>
    public static class QualityChecker
    {
        private static readonly Dictionary<string, (int Min, int Max)> WordRange = new()
        {
            [ContentTypes.Article] = (450, 1200),
            [ContentTypes.Whitepaper] = (1100, 3400),
            [ContentTypes.Webinar] = (250, 1400),
        };

        public static int MinimumWords(string type) => WordRange.TryGetValue(type, out var range) ? range.Min : 0;

        private static readonly string[] Promotional =
        {
            "innovativ", "nahtlos", "signifikant", "hochmodern", "modernste", "erstklassig", "optimale lösung",
            "revolutionär", "bahnbrechend", "einzigartig", "unschlagbar", "marktführer", "weltweit führend",
            "führender anbieter", "beste lösung", "perfekte lösung", "game-changer", "best-in-class",
            "world-class", "unübertroffen", "konkurrenzlos", "number one", "weltklasse"
        };

        private static readonly string[] GermanStopwords =
        {
            "der", "die", "das", "und", "ist", "nicht", "mit", "für", "von", "auf", "den", "im", "zu", "ein",
            "eine", "wir", "sie", "auch", "sich", "als", "bei", "werden", "oder", "dass", "aus", "nach", "dem"
        };

        private static readonly string[] EnglishStopwords =
        {
            "the", "and", "of", "to", "is", "for", "with", "that", "are", "this", "on", "as", "by", "from", "your"
        };

        private static readonly Regex Number = new(@"(?<![\p{L}\p{N}])\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?\s?%?|(?<![\p{L}\p{N}])\d{2,}(?:[.,]\d+)?\s?%?", RegexOptions.Compiled);
        private static readonly Regex Claim = new(
            @"\bISO\s?\d{4,5}(?::\d{4})?|\bzertifiziert\b[^.]{0,60}|\bPartner von\b[^.]{0,40}|\b(?:Gold|Platinum|Silver)\s?Partner\b[^.]{0,30}|\bKunden wie\b[^.]{0,60}|\bausgezeichnet\b[^.]{0,50}",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        public static QualityReport Check(
            GeneratedDocument doc,
            IReadOnlyList<string> sourceTexts,
            string language,
            int providedSourceCount)
        {
            var checks = new List<QualityCheck>();
            var plain = HtmlRenderer.PlainText(doc.Blocks);
            var words = HtmlRenderer.WordCount(plain);
            var headings = doc.Blocks.Count(b => b.Type == "heading");
            var allSources = string.Join("\n", sourceTexts).ToLowerInvariant();
            var fullText = string.Join("\n", new[] { doc.Title, doc.Subtitle, doc.Excerpt, plain });

            // ── structure ──
            if (string.IsNullOrWhiteSpace(doc.Excerpt))
                checks.Add(new("missing_excerpt", "warning", string.Empty));

            if (doc.Type != ContentTypes.Webinar && (string.IsNullOrWhiteSpace(doc.SeoTitle) || string.IsNullOrWhiteSpace(doc.MetaDescription)))
                checks.Add(new("missing_seo", "warning", string.Empty));

            if (WordRange.TryGetValue(doc.Type, out var range))
            {
                if (words < range.Min) checks.Add(new("too_short", "warning", $"{words}/{range.Min}"));
                if (words > range.Max) checks.Add(new("too_long", "warning", $"{words}/{range.Max}"));
            }

            var minHeadings = doc.Type == ContentTypes.Whitepaper ? 6 : doc.Type == ContentTypes.Article ? 3 : 2;
            if (headings < minHeadings)
                checks.Add(new("few_headings", "warning", $"{headings}/{minHeadings}"));

            // A heading followed directly by another heading (or by nothing) is an empty section.
            for (var i = 0; i < doc.Blocks.Count; i++)
            {
                if (doc.Blocks[i].Type != "heading") continue;

                var next = i + 1 < doc.Blocks.Count ? doc.Blocks[i + 1] : null;
                if (next == null || next.Type == "heading")
                    checks.Add(new("empty_section", "warning", doc.Blocks[i].Text));
            }

            // Duplicate paragraphs.
            var seenParagraphs = new HashSet<string>();
            foreach (var paragraph in doc.Blocks.Where(b => b.Type == "paragraph"))
            {
                var key = Regex.Replace(HtmlRenderer.Strip(paragraph.Text).ToLowerInvariant(), @"\W+", " ").Trim();
                if (key.Length > 40 && !seenParagraphs.Add(key))
                    checks.Add(new("duplicate_paragraph", "warning", Preview(paragraph.Text)));
            }

            if (doc.Type == ContentTypes.Whitepaper)
            {
                var headingText = string.Join(" | ", doc.Blocks.Where(b => b.Type == "heading").Select(b => b.Text.ToLowerInvariant()));

                if (!Regex.IsMatch(headingText, @"zusammenfassung|executive summary|überblick|management summary"))
                    checks.Add(new("missing_summary_section", "warning", string.Empty));
                if (!Regex.IsMatch(headingText, @"fazit|schluss|ausblick|conclusion|zusammenfassend"))
                    checks.Add(new("missing_conclusion_section", "warning", string.Empty));
            }

            // ── language ──
            var tokens = Regex.Matches(fullText.ToLowerInvariant(), @"[\p{L}]+").Select(m => m.Value).ToList();
            if (tokens.Count > 60)
            {
                var german = tokens.Count(t => GermanStopwords.Contains(t)) / (double)tokens.Count;
                var english = tokens.Count(t => EnglishStopwords.Contains(t)) / (double)tokens.Count;

                if (language == "de" && german < 0.07 && english > german)
                    checks.Add(new("language_mismatch", "warning", "de"));
                else if (language == "en" && english < 0.07 && german > english)
                    checks.Add(new("language_mismatch", "warning", "en"));
            }

            // ── tone ──
            var lowerText = fullText.ToLowerInvariant();
            var hype = Promotional.Where(p => lowerText.Contains(p)).ToList();
            var unsupportedHype = hype.Where(p => !allSources.Contains(p)).ToList();
            if (unsupportedHype.Count > 0 || hype.Count > 2)
                checks.Add(new("promotional_language", "warning", string.Join(", ", hype.Take(4))));

            // ── grounding ──
            if (providedSourceCount > 0 && doc.UsedSources.Count == 0)
                checks.Add(new("no_sources_used", "warning", string.Empty));
            else if (providedSourceCount >= 3 && doc.UsedSources.Count < 2)
                checks.Add(new("low_source_coverage", "warning", $"{doc.UsedSources.Count}/{providedSourceCount}"));

            var unsupportedNumbers = FindUnsupportedNumbers(fullText, allSources);
            if (unsupportedNumbers.Count > 0)
                checks.Add(new("unsupported_number", "warning", string.Join(", ", unsupportedNumbers.Take(5))));

            var unsupportedClaims = Claim.Matches(fullText)
                .Select(m => m.Value.Trim())
                .Where(claim => !ClaimSupported(claim, allSources))
                .Distinct()
                .ToList();
            if (unsupportedClaims.Count > 0)
                checks.Add(new("unsupported_claim", "warning", string.Join(" | ", unsupportedClaims.Take(3))));

            if (Regex.IsMatch(fullText, @"https?://|www\.", RegexOptions.IgnoreCase))
                checks.Add(new("links_present", "warning", string.Empty));

            var state = checks.Any(c => c.Severity == "error") ? "issues" : checks.Count > 0 ? "warnings" : "ok";

            return new QualityReport(state, checks, new Dictionary<string, object>
            {
                ["words"] = words,
                ["headings"] = headings,
                ["sourcesUsed"] = doc.UsedSources.Count,
                ["sourcesProvided"] = providedSourceCount
            });
        }

        /// <summary>Numbers/percentages in the text that appear nowhere in the sources (possible invented statistics).</summary>
        public static List<string> FindUnsupportedNumbers(string text, string lowerSources)
        {
            var normalizedSources = NormalizeDigits(lowerSources);
            var result = new List<string>();
            var year = DateTime.UtcNow.Year;

            foreach (Match match in Number.Matches(text))
            {
                var raw = match.Value.Trim();
                var digits = NormalizeDigits(raw);
                if (digits.Length == 0) continue;

                // Small counting numbers ("5 Wege"), years around today and times are not statistics.
                if (int.TryParse(digits.Replace("%", string.Empty), out var value))
                {
                    if (!raw.Contains('%') && value <= 20) continue;
                    if (!raw.Contains('%') && value >= year - 5 && value <= year + 2) continue;
                }

                if (!normalizedSources.Contains(digits) && !result.Contains(raw))
                    result.Add(raw);
            }

            return result;
        }

        private static string NormalizeDigits(string value) =>
            Regex.Replace(value, @"[\s\.,]", string.Empty).ToLowerInvariant();

        private static bool ClaimSupported(string claim, string lowerSources)
        {
            // The distinctive word/number of the claim must occur in the sources.
            var keys = Regex.Matches(claim, @"ISO\s?\d{4,5}|[A-ZÄÖÜ][\p{L}\-]{3,}", RegexOptions.IgnoreCase)
                .Select(m => m.Value.ToLowerInvariant().Replace(" ", string.Empty))
                .Where(k => k.Length >= 4 && k != "partner" && k != "kunden" && k != "zertifiziert" && k != "ausgezeichnet")
                .ToList();

            if (keys.Count == 0) return lowerSources.Contains(claim.ToLowerInvariant());

            var compactSources = lowerSources.Replace(" ", string.Empty);
            return keys.Any(k => compactSources.Contains(k));
        }

        private static string Preview(string text) => text.Length <= 70 ? text : text[..70] + "…";
    }
}
