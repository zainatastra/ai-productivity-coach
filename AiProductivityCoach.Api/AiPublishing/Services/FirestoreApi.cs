using Google.Cloud.Firestore;

namespace AiProductivityCoach.Api.AiPublishing.Services
{
    /// <summary>Helpers to turn Firestore documents into JSON-safe API objects.</summary>
    public static class FirestoreApi
    {
        public static object? Convert(object? value)
        {
            switch (value)
            {
                case Timestamp timestamp:
                    return timestamp.ToDateTime().ToUniversalTime().ToString("O");
                case Dictionary<string, object> map:
                    return map.ToDictionary(pair => pair.Key, pair => Convert(pair.Value));
                case string text:
                    return text;
                case IEnumerable<object> list:
                    return list.Select(Convert).ToList();
                default:
                    return value;
            }
        }

        public static Dictionary<string, object?> ToApi(
            DocumentSnapshot doc,
            params string[] hiddenFields)
        {
            var result = new Dictionary<string, object?> { ["id"] = doc.Id };

            foreach (var pair in doc.ToDictionary())
            {
                if (hiddenFields.Contains(pair.Key)) continue;
                result[pair.Key] = Convert(pair.Value);
            }

            return result;
        }

        public static string GetString(IDictionary<string, object> data, string key, string fallback = "") =>
            data.TryGetValue(key, out var value) && value != null
                ? value.ToString() ?? fallback
                : fallback;

        public static long GetLong(IDictionary<string, object> data, string key, long fallback = 0) =>
            data.TryGetValue(key, out var value) && value != null && long.TryParse(value.ToString(), out var n)
                ? n
                : fallback;

        public static DateTime? GetDate(IDictionary<string, object> data, string key) =>
            data.TryGetValue(key, out var value) && value is Timestamp ts
                ? ts.ToDateTime().ToUniversalTime()
                : null;
    }
}
