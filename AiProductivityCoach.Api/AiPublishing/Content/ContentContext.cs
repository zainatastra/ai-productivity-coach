using Google.Cloud.Firestore;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Knowledge;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.AiPublishing.Content
{
    public sealed record GateInfo(string State, IReadOnlyList<string> Reasons);

    /// <summary>Everything the writer needs to know about one provider, read from its Firestore document.</summary>
    public sealed record ProviderContext(
        string Id,
        string Name,
        string Website,
        string Language,
        string Status,
        ProviderProfileSummary Profile,
        IReadOnlyDictionary<string, GateInfo> Gates,
        bool HasKnowledge);

    public static class ContentContext
    {
        public static async Task<ProviderContext?> LoadAsync(FirestoreDb firestore, string providerId, CancellationToken ct = default)
        {
            if (string.IsNullOrWhiteSpace(providerId)) return null;

            var snap = await firestore.Collection(AiCollections.Providers).Document(providerId).GetSnapshotAsync(ct);
            if (!snap.Exists) return null;

            var data = snap.ToDictionary();

            var products = new List<(string, string)>();
            var topics = new List<string>();
            var industries = new List<string>();
            var description = string.Empty;

            if (data.TryGetValue("knowledgeProfile", out var rawProfile) && rawProfile is Dictionary<string, object> profile)
            {
                description = FirestoreApi.GetString(profile, "description");

                if (profile.TryGetValue("products", out var rawProducts) && rawProducts is IEnumerable<object> list)
                {
                    foreach (var item in list.OfType<Dictionary<string, object>>())
                        products.Add((FirestoreApi.GetString(item, "name"), FirestoreApi.GetString(item, "summary")));
                }

                topics = StringList(profile, "topics");
                industries = StringList(profile, "industries");
            }

            var gates = new Dictionary<string, GateInfo>();
            if (data.TryGetValue("readiness", out var rawReadiness) && rawReadiness is Dictionary<string, object> readiness &&
                readiness.TryGetValue("gates", out var rawGates) && rawGates is Dictionary<string, object> gateMap)
            {
                foreach (var (type, value) in gateMap)
                {
                    if (value is Dictionary<string, object> gate)
                        gates[type] = new GateInfo(FirestoreApi.GetString(gate, "state", "blocked"), StringList(gate, "reasons"));
                }
            }

            return new ProviderContext(
                snap.Id,
                FirestoreApi.GetString(data, "name"),
                FirestoreApi.GetString(data, "website"),
                FirestoreApi.GetString(data, "defaultLanguage", "de"),
                FirestoreApi.GetString(data, "status", ProviderStatus.Created),
                new ProviderProfileSummary(description, products, topics, industries),
                gates,
                FirestoreApi.GetLong(data, "knowledgeVersion") > 0);
        }

        /// <summary>Numbers the retrieved passages [S1], [S2] ... within a size limit.</summary>
        public static List<SourceExcerpt> BuildExcerpts(IEnumerable<SearchHit> hits, int totalCharLimit, int perChunkLimit = 1400)
        {
            var excerpts = new List<SourceExcerpt>();
            var used = 0;

            foreach (var hit in hits)
            {
                var text = hit.Text.Length > perChunkLimit ? hit.Text[..perChunkLimit] : hit.Text;
                if (used + text.Length > totalCharLimit) break;

                used += text.Length;
                excerpts.Add(new SourceExcerpt(excerpts.Count + 1, hit.Url, hit.Title, text));
            }

            return excerpts;
        }

        private static List<string> StringList(IDictionary<string, object> data, string key) =>
            data.TryGetValue(key, out var raw) && raw is IEnumerable<object> list
                ? list.Select(x => x?.ToString() ?? string.Empty).Where(x => x.Length > 0).ToList()
                : new List<string>();
    }
}
