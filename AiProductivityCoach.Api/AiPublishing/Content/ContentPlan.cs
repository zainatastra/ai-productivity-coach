using System.Text.Json;

namespace AiProductivityCoach.Api.AiPublishing.Content
{
    public static class PlanItemStatus
    {
        public const string Proposed = "proposed";
        public const string Removed = "removed";
        public const string ComingSoon = "coming_soon";
    }

    public static class PlanStatus
    {
        public const string Draft = "draft";
        public const string Approved = "approved";
    }

    /// <summary>One topic of the content plan (spec section 11): what will be written, for whom, and why.</summary>
    public sealed record PlanItem(
        string Type,
        string Title,
        string Angle,
        string Audience,
        IReadOnlyList<string> KeyPoints,
        string Instruction,
        string Status,
        string? ContentId);

    public sealed record PlanParseOutcome(Dictionary<string, PlanItem>? Items, string? ErrorCode);

    public static class PlanParser
    {
        public static PlanParseOutcome ParseAll(string? raw)
        {
            var json = DocumentParser.ExtractJson(raw);
            if (json == null) return new PlanParseOutcome(null, "invalid_json");

            try
            {
                using var doc = JsonDocument.Parse(json);

                if (!doc.RootElement.TryGetProperty("items", out var arr) || arr.ValueKind != JsonValueKind.Array)
                    return new PlanParseOutcome(null, "invalid_json");

                var items = new Dictionary<string, PlanItem>();

                foreach (var element in arr.EnumerateArray())
                {
                    var item = ParseItem(element, null);
                    if (item != null && ContentTypes.IsGeneratable(item.Type) && !items.ContainsKey(item.Type))
                        items[item.Type] = item;
                }

                // The V1 package is exactly one article, one whitepaper and one webinar.
                return ContentTypes.Generatable.All(items.ContainsKey)
                    ? new PlanParseOutcome(items, null)
                    : new PlanParseOutcome(null, "incomplete_plan");
            }
            catch (JsonException)
            {
                return new PlanParseOutcome(null, "invalid_json");
            }
        }

        /// <summary>Parses a single regenerated topic. The type is fixed by the caller, never by the AI.</summary>
        public static PlanItem? ParseSingle(string? raw, string type)
        {
            var json = DocumentParser.ExtractJson(raw);
            if (json == null) return null;

            try
            {
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                if (root.TryGetProperty("item", out var inner) && inner.ValueKind == JsonValueKind.Object)
                    root = inner;

                return ParseItem(root, type);
            }
            catch (JsonException)
            {
                return null;
            }
        }

        private static PlanItem? ParseItem(JsonElement el, string? forcedType)
        {
            if (el.ValueKind != JsonValueKind.Object) return null;

            string? Str(string name) => el.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

            var type = forcedType ?? (Str("type") ?? string.Empty).Trim().ToLowerInvariant();
            var title = DocumentParser.Clean(Str("title"), 180);
            var angle = DocumentParser.Clean(Str("angle"), 500);

            if (title.Length < 5 || angle.Length < 10) return null;

            var points = new List<string>();
            if (el.TryGetProperty("keyPoints", out var arr) && arr.ValueKind == JsonValueKind.Array)
            {
                foreach (var p in arr.EnumerateArray())
                {
                    if (points.Count >= 6 || p.ValueKind != JsonValueKind.String) continue;
                    var text = DocumentParser.Clean(p.GetString(), 200);
                    if (text.Length > 2) points.Add(text);
                }
            }

            if (points.Count < 2) return null;

            return new PlanItem(
                type, title, angle,
                DocumentParser.Clean(Str("audience"), 200),
                points, string.Empty, PlanItemStatus.Proposed, null);
        }
    }
}
