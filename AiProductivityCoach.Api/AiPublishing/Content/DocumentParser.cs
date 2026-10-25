using System.Text.Json;
using System.Text.RegularExpressions;

namespace AiProductivityCoach.Api.AiPublishing.Content
{
    public sealed record ParseOutcome(GeneratedDocument? Document, string? ErrorCode);

    /// <summary>
    /// Reads the model's JSON answer defensively: tolerant of code fences and chatter around the
    /// JSON, strict about structure, and it strips markup, links and control characters from every
    /// string. The model's output is treated as untrusted input.
    /// </summary>
    public static class DocumentParser
    {
        private static readonly Regex Tags = new(@"<[^>]+>", RegexOptions.Compiled);
        private static readonly Regex Urls = new(@"(?:https?://|www\.)\S+", RegexOptions.Compiled | RegexOptions.IgnoreCase);
        private static readonly Regex Control = new(@"[\p{C}]", RegexOptions.Compiled);
        private static readonly Regex Spaces = new(@"[ \t]{2,}", RegexOptions.Compiled);

        public static string? ExtractJson(string? raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return null;

            var text = raw.Trim();

            var fence = Regex.Match(text, @"```(?:json)?\s*(.*?)```", RegexOptions.Singleline | RegexOptions.IgnoreCase);
            if (fence.Success) text = fence.Groups[1].Value.Trim();

            var start = text.IndexOf('{');
            var end = text.LastIndexOf('}');

            return start >= 0 && end > start ? text[start..(end + 1)] : null;
        }

        public static string Clean(string? value, int maxLength)
        {
            if (string.IsNullOrWhiteSpace(value)) return string.Empty;

            var text = Tags.Replace(value, " ");
            text = Urls.Replace(text, string.Empty);
            text = Control.Replace(text, " ");
            text = Spaces.Replace(text, " ").Trim();

            if (text.Length <= maxLength) return text;

            // Cut at a word boundary, never mid-word.
            var cut = text[..maxLength];
            var lastSpace = cut.LastIndexOf(' ');
            return (lastSpace > maxLength * 0.6 ? cut[..lastSpace] : cut).TrimEnd(',', ';', ':', ' ');
        }

        public static ParseOutcome Parse(string? raw, string type, int sourceCount)
        {
            var json = ExtractJson(raw);
            if (json == null) return new ParseOutcome(null, "invalid_json");

            try
            {
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                if (root.ValueKind != JsonValueKind.Object) return new ParseOutcome(null, "invalid_json");

                var title = Clean(Str(root, "title"), 180);
                if (title.Length < 3) return new ParseOutcome(null, "missing_title");

                var blocks = ParseBlocks(root);
                var words = HtmlRenderer.WordCount(HtmlRenderer.PlainText(blocks));
                if (blocks.Count == 0 || words < 40) return new ParseOutcome(null, "empty_body");

                var data = new Dictionary<string, object>();

                if (type == ContentTypes.Webinar)
                {
                    var objectives = StrList(root, "learningObjectives", 8, 300);
                    var agenda = ParseAgenda(root);

                    if (objectives.Count < 2 || agenda.Count < 2)
                        return new ParseOutcome(null, "missing_webinar_fields");

                    data["learningObjectives"] = objectives;
                    data["targetAudience"] = Clean(Str(root, "targetAudience"), 400);
                    data["agenda"] = agenda;
                    data["durationMinutes"] = Math.Clamp(Int(root, "durationMinutes", 60), 15, 240);
                    data["speakerInfo"] = Clean(Str(root, "speakerInfo"), 600);
                    data["registrationCopy"] = Clean(Str(root, "registrationCopy"), 1200);
                    data["discussionPoints"] = StrList(root, "discussionPoints", 10, 300);
                    data["bannerText"] = Clean(Str(root, "bannerText"), 120);
                }

                if (type == ContentTypes.Whitepaper)
                    data["callToAction"] = Clean(Str(root, "callToAction"), 300);

                var used = new List<int>();
                if (root.TryGetProperty("usedSources", out var usedArr) && usedArr.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in usedArr.EnumerateArray())
                    {
                        if (item.ValueKind == JsonValueKind.Number && item.TryGetInt32(out var n) &&
                            n >= 1 && n <= sourceCount && !used.Contains(n))
                            used.Add(n);
                    }
                }

                var document = new GeneratedDocument(
                    type,
                    title,
                    Clean(Str(root, "subtitle"), 320),
                    Clean(Str(root, "excerpt"), 500),
                    Clean(Str(root, "seoTitle"), 70),
                    Clean(Str(root, "metaDescription"), 160),
                    blocks,
                    data,
                    used.OrderBy(n => n).ToList(),
                    Clean(Str(root, "notes"), 400));

                return new ParseOutcome(document, null);
            }
            catch (JsonException)
            {
                return new ParseOutcome(null, "invalid_json");
            }
        }

        // ───────────── blocks ─────────────

        private static List<ContentBlock> ParseBlocks(JsonElement root)
        {
            var blocks = new List<ContentBlock>();

            if (!root.TryGetProperty("body", out var body) || body.ValueKind != JsonValueKind.Array)
                return blocks;

            foreach (var item in body.EnumerateArray())
            {
                if (blocks.Count >= 120) break;
                if (item.ValueKind != JsonValueKind.Object) continue;

                var kind = (Str(item, "type") ?? string.Empty).ToLowerInvariant();

                switch (kind)
                {
                    case "heading":
                        var heading = Clean(Str(item, "text"), 200);
                        if (heading.Length > 1)
                            blocks.Add(ContentBlock.Heading(Math.Clamp(Int(item, "level", 2), 2, 3), heading.TrimEnd('.', ':')));
                        break;

                    case "paragraph":
                        var paragraph = Clean(Str(item, "text"), 2500);
                        if (paragraph.Length > 1) blocks.Add(ContentBlock.Paragraph(paragraph));
                        break;

                    case "quote":
                        var quote = Clean(Str(item, "text"), 600);
                        if (quote.Length > 1) blocks.Add(ContentBlock.Quote(quote));
                        break;

                    case "list":
                        var items = StrList(item, "items", 20, 400);
                        if (items.Count > 0)
                        {
                            var ordered = item.TryGetProperty("ordered", out var o) && o.ValueKind == JsonValueKind.True;
                            blocks.Add(ContentBlock.List(ordered, items));
                        }
                        break;
                }
            }

            return blocks;
        }

        private static List<Dictionary<string, object>> ParseAgenda(JsonElement root)
        {
            var agenda = new List<Dictionary<string, object>>();

            if (!root.TryGetProperty("agenda", out var arr) || arr.ValueKind != JsonValueKind.Array)
                return agenda;

            foreach (var item in arr.EnumerateArray())
            {
                if (agenda.Count >= 12 || item.ValueKind != JsonValueKind.Object) continue;

                var title = Clean(Str(item, "title"), 120);
                if (title.Length < 2) continue;

                agenda.Add(new Dictionary<string, object>
                {
                    ["title"] = title,
                    ["description"] = Clean(Str(item, "description"), 400),
                    ["minutes"] = Math.Clamp(Int(item, "minutes", 0), 0, 240)
                });
            }

            return agenda;
        }

        // ───────────── primitives ─────────────

        private static string? Str(JsonElement el, string name) =>
            el.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

        private static int Int(JsonElement el, string name, int fallback)
        {
            if (!el.TryGetProperty(name, out var v)) return fallback;

            if (v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var n)) return n;
            if (v.ValueKind == JsonValueKind.String && int.TryParse(v.GetString(), out var parsed)) return parsed;

            return fallback;
        }

        private static List<string> StrList(JsonElement el, string name, int maxItems, int maxLength)
        {
            var list = new List<string>();

            if (!el.TryGetProperty(name, out var arr) || arr.ValueKind != JsonValueKind.Array) return list;

            foreach (var item in arr.EnumerateArray())
            {
                if (list.Count >= maxItems) break;
                if (item.ValueKind != JsonValueKind.String) continue;

                var text = Clean(item.GetString(), maxLength);
                if (text.Length > 0) list.Add(text);
            }

            return list;
        }
    }
}
