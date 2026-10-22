using System.Collections.Concurrent;
using Google.Cloud.Firestore;
using AiProductivityCoach.Api.AiPublishing.Ai;
using AiProductivityCoach.Api.AiPublishing.Domain;

namespace AiProductivityCoach.Api.AiPublishing.Knowledge
{
    public sealed record SearchHit(string ChunkId, string Url, string Title, string Heading, string Text, double Score);

    /// <summary>
    /// Semantic search over ONE provider's knowledge base. The provider id is the only
    /// way in, so retrieval is tenant-scoped by design (never a global vector search).
    /// </summary>
    public sealed class KnowledgeSearchService
    {
        private const int MaxCachedProviders = 20;

        private readonly KnowledgeStore _store;
        private readonly OpenAiClient _openAi;
        private readonly AiRunService _runs;
        private readonly FirestoreDb _firestore;
        private readonly ConcurrentDictionary<string, (long Version, List<StoredChunk> Chunks)> _cache = new();

        public KnowledgeSearchService(KnowledgeStore store, OpenAiClient openAi, AiRunService runs, FirestoreDb firestore)
        {
            _store = store;
            _openAi = openAi;
            _runs = runs;
            _firestore = firestore;
        }

        public async Task<List<SearchHit>> SearchAsync(
            string providerId,
            string query,
            int topK,
            CancellationToken ct,
            bool recordRun = true)
        {
            var started = DateTime.UtcNow;
            var embedding = await _openAi.EmbedAsync(new[] { query }, ct);

            if (recordRun)
            {
                await _runs.RecordAsync(providerId, null, "search", _openAi.EmbeddingModel, "completed",
                    started, embedding.TotalTokens, 0, 1);
            }

            var chunks = await GetChunksAsync(providerId, ct);
            return Rank(chunks, embedding.Vectors[0], topK);
        }

        public static List<SearchHit> Rank(IEnumerable<StoredChunk> chunks, double[] queryVector, int topK) =>
            chunks
                .Select(c => new SearchHit(c.Id, c.Url, c.Title, c.Heading, c.Text, VectorMath.Cosine(c.Vector, queryVector)))
                .OrderByDescending(h => h.Score)
                .Take(Math.Clamp(topK, 1, 20))
                .ToList();

        public async Task<List<StoredChunk>> GetChunksAsync(string providerId, CancellationToken ct)
        {
            var provider = await _firestore.Collection(AiCollections.Providers).Document(providerId).GetSnapshotAsync(ct);
            var version = provider.Exists && provider.TryGetValue<long>("knowledgeVersion", out var v) ? v : 0;

            if (_cache.TryGetValue(providerId, out var cached) && cached.Version == version)
                return cached.Chunks;

            var chunks = await _store.LoadChunksAsync(providerId, ct);

            if (_cache.Count >= MaxCachedProviders) _cache.Clear();
            _cache[providerId] = (version, chunks);

            return chunks;
        }
    }
}
