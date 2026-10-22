using System.Security.Cryptography;
using System.Text;
using Google.Cloud.Firestore;
using AiProductivityCoach.Api.AiPublishing.Domain;

namespace AiProductivityCoach.Api.AiPublishing.Knowledge
{
    public sealed record StoredChunk(
        string Id,
        string PageId,
        string SourceId,
        string Url,
        string Title,
        string Heading,
        string Text,
        double[] Vector);

    /// <summary>
    /// Firestore access for a provider's knowledge base. EVERYTHING lives below
    /// ai_providers/{providerId}/..., so a query can never see another provider's data
    /// (tenant isolation by construction, spec section 37).
    /// </summary>
    public sealed class KnowledgeStore
    {
        private readonly FirestoreDb _firestore;

        public KnowledgeStore(FirestoreDb firestore)
        {
            _firestore = firestore;
        }

        public static string PageId(string url)
        {
            var hash = SHA1.HashData(Encoding.UTF8.GetBytes(url.Trim().ToLowerInvariant()));
            return Convert.ToHexString(hash)[..20].ToLowerInvariant();
        }

        private DocumentReference Provider(string providerId) =>
            _firestore.Collection(AiCollections.Providers).Document(providerId);

        private CollectionReference Pages(string providerId) => Provider(providerId).Collection(AiCollections.Pages);
        private CollectionReference Chunks(string providerId) => Provider(providerId).Collection(AiCollections.Chunks);

        // ───────────── pages ─────────────

        public async Task<Dictionary<string, DocumentSnapshot>> GetPagesAsync(string providerId, CancellationToken ct = default)
        {
            var snapshot = await Pages(providerId).GetSnapshotAsync(ct);
            return snapshot.Documents.ToDictionary(doc => doc.Id);
        }

        public Task UpsertPageAsync(string providerId, string pageId, Dictionary<string, object> data, CancellationToken ct = default) =>
            Pages(providerId).Document(pageId).SetAsync(data, SetOptions.MergeAll, ct);

        public async Task DeletePageAsync(string providerId, string pageId, CancellationToken ct = default)
        {
            await DeleteChunksForPageAsync(providerId, pageId, ct);
            await Pages(providerId).Document(pageId).DeleteAsync(cancellationToken: ct);
        }

        /// <summary>Removes everything learned from one source (used when a source is removed).</summary>
        public async Task DeleteBySourceAsync(string providerId, string sourceId, CancellationToken ct = default)
        {
            var pages = await Pages(providerId).WhereEqualTo("sourceId", sourceId).GetSnapshotAsync(ct);

            foreach (var page in pages.Documents)
                await DeletePageAsync(providerId, page.Id, ct);
        }

        // ───────────── chunks ─────────────

        public async Task DeleteChunksForPageAsync(string providerId, string pageId, CancellationToken ct = default)
        {
            var existing = await Chunks(providerId).WhereEqualTo("pageId", pageId).GetSnapshotAsync(ct);
            if (existing.Count == 0) return;

            var batch = _firestore.StartBatch();
            foreach (var doc in existing.Documents) batch.Delete(doc.Reference);
            await batch.CommitAsync(ct);
        }

        public async Task ReplaceChunksAsync(
            string providerId,
            string pageId,
            string sourceId,
            string url,
            string title,
            IReadOnlyList<TextChunk> chunks,
            IReadOnlyList<double[]> vectors,
            string model,
            bool pageHadChunks,
            CancellationToken ct = default)
        {
            // A page that never had chunks has nothing to delete (saves a Firestore round trip).
            if (pageHadChunks)
                await DeleteChunksForPageAsync(providerId, pageId, ct);

            var batch = _firestore.StartBatch();
            var now = Timestamp.GetCurrentTimestamp();

            for (var i = 0; i < chunks.Count; i++)
            {
                batch.Set(Chunks(providerId).Document($"{pageId}_{chunks[i].Index:D3}"), new Dictionary<string, object>
                {
                    ["pageId"] = pageId,
                    ["sourceId"] = sourceId,
                    ["url"] = url,
                    ["title"] = title,
                    ["heading"] = chunks[i].Heading,
                    ["index"] = chunks[i].Index,
                    ["text"] = chunks[i].Text,
                    ["embedding"] = vectors[i].ToList(),
                    ["model"] = model,
                    ["createdAt"] = now
                });
            }

            await batch.CommitAsync(ct);
        }

        public async Task<List<StoredChunk>> LoadChunksAsync(string providerId, CancellationToken ct = default)
        {
            var snapshot = await Chunks(providerId).GetSnapshotAsync(ct);

            return snapshot.Documents
                .Where(doc => doc.TryGetValue<List<double>>("embedding", out var v) && v.Count > 0)
                .Select(doc => new StoredChunk(
                    doc.Id,
                    doc.GetValue<string>("pageId"),
                    doc.GetValue<string>("sourceId"),
                    doc.GetValue<string>("url"),
                    doc.GetValue<string>("title"),
                    doc.GetValue<string>("heading"),
                    doc.GetValue<string>("text"),
                    doc.GetValue<List<double>>("embedding").ToArray()))
                .ToList();
        }
    }
}
