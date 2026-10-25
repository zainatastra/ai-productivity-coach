using Google.Cloud.Firestore;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.AiPublishing.Content
{
    public sealed record ContentMeta(string Language, string Model, string LlmProvider, string? JobId);

    public sealed record SourceRef(int Number, string Url, string Title, bool Used);

    /// <summary>
    /// The central, private draft workspace (specification section 20). Every document belongs to
    /// one provider (providerId is set by the backend, never by the AI or the browser) and keeps a
    /// full version history. Nothing here is public.
    /// </summary>
    public sealed class ContentStore
    {
        private readonly FirestoreDb _firestore;

        public ContentStore(FirestoreDb firestore)
        {
            _firestore = firestore;
        }

        private CollectionReference Docs => _firestore.Collection(AiCollections.Content);

        // ───────────── create / version ─────────────

        public async Task<string> CreateAsync(
            string providerId,
            GeneratedDocument doc,
            ContentMeta meta,
            QualityReport quality,
            IReadOnlyList<SourceRef> sources,
            string createdBy,
            string? instruction)
        {
            var docRef = Docs.Document();
            var now = Timestamp.GetCurrentTimestamp();

            var data = Fields(doc, meta, quality, sources);
            data["providerId"] = providerId;
            data["type"] = doc.Type;
            data["status"] = ContentStatus.Draft;
            data["currentVersion"] = 1;
            data["createdBy"] = createdBy;
            data["createdByAI"] = true;
            data["platforms"] = new List<string>();
            data["createdAt"] = now;
            data["updatedAt"] = now;

            var batch = _firestore.StartBatch();
            batch.Set(docRef, data);
            batch.Set(docRef.Collection(AiCollections.ContentVersions).Document("1"), VersionFields(data, 1, createdBy, instruction));
            await batch.CommitAsync();

            return docRef.Id;
        }

        /// <summary>Stores a regenerated document as the next version and makes it the current text.</summary>
        public async Task<int> AddVersionAsync(
            string contentId,
            GeneratedDocument doc,
            ContentMeta meta,
            QualityReport quality,
            IReadOnlyList<SourceRef> sources,
            string createdBy,
            string? instruction)
        {
            var docRef = Docs.Document(contentId);

            return await _firestore.RunTransactionAsync(async tx =>
            {
                var snap = await tx.GetSnapshotAsync(docRef);
                if (!snap.Exists) throw new InvalidOperationException("Content not found.");

                var next = (int)FirestoreApi.GetLong(snap.ToDictionary(), "currentVersion", 1) + 1;
                var data = Fields(doc, meta, quality, sources);
                data["currentVersion"] = next;
                data["updatedAt"] = Timestamp.GetCurrentTimestamp();

                tx.Update(docRef, data);
                tx.Set(docRef.Collection(AiCollections.ContentVersions).Document(next.ToString()),
                    VersionFields(data, next, createdBy, instruction));

                return next;
            });
        }

        // ───────────── reads ─────────────

        public async Task<DocumentSnapshot?> GetAsync(string contentId)
        {
            if (string.IsNullOrWhiteSpace(contentId)) return null;

            var snap = await Docs.Document(contentId).GetSnapshotAsync();
            return snap.Exists ? snap : null;
        }

        /// <summary>List view: metadata only (no bodies), newest first.</summary>
        public async Task<List<Dictionary<string, object?>>> ListAsync(string providerId)
        {
            var snapshot = await Docs.WhereEqualTo("providerId", providerId).GetSnapshotAsync();

            return snapshot.Documents
                .Select(doc => FirestoreApi.ToApi(doc, "blocks", "bodyHtml", "data", "sources"))
                .OrderByDescending(row => row.TryGetValue("updatedAt", out var v) ? v?.ToString() : "")
                .ToList();
        }

        public async Task<List<Dictionary<string, object?>>> ListVersionsAsync(string contentId)
        {
            var snapshot = await Docs.Document(contentId).Collection(AiCollections.ContentVersions).GetSnapshotAsync();

            return snapshot.Documents
                .Select(doc => FirestoreApi.ToApi(doc, "blocks", "bodyHtml", "data", "sources"))
                .OrderByDescending(row => row.TryGetValue("versionNumber", out var v) && int.TryParse(v?.ToString(), out var n) ? n : 0)
                .ToList();
        }

        public async Task DeleteAsync(string contentId)
        {
            var docRef = Docs.Document(contentId);
            var versions = await docRef.Collection(AiCollections.ContentVersions).GetSnapshotAsync();

            var batch = _firestore.StartBatch();
            foreach (var version in versions.Documents) batch.Delete(version.Reference);
            batch.Delete(docRef);
            await batch.CommitAsync();
        }

        // ───────────── mapping ─────────────

        private static Dictionary<string, object> Fields(
            GeneratedDocument doc,
            ContentMeta meta,
            QualityReport quality,
            IReadOnlyList<SourceRef> sources)
        {
            var plain = HtmlRenderer.PlainText(doc.Blocks);

            return new Dictionary<string, object>
            {
                ["language"] = meta.Language,
                ["title"] = doc.Title,
                ["subtitle"] = doc.Subtitle,
                ["excerpt"] = doc.Excerpt,
                ["seoTitle"] = doc.SeoTitle,
                ["metaDescription"] = doc.MetaDescription,
                ["blocks"] = doc.Blocks.Select(BlockToMap).ToList(),
                ["bodyHtml"] = HtmlRenderer.Render(doc.Blocks),
                ["data"] = doc.Data.ToDictionary(pair => pair.Key, pair => pair.Value),
                ["notes"] = doc.Notes,
                ["wordCount"] = HtmlRenderer.WordCount(plain),
                ["sources"] = sources.Select(s => new Dictionary<string, object>
                {
                    ["number"] = s.Number, ["url"] = s.Url, ["title"] = s.Title, ["used"] = s.Used
                }).ToList(),
                ["quality"] = new Dictionary<string, object>
                {
                    ["state"] = quality.State,
                    ["checks"] = quality.Checks.Select(c => new Dictionary<string, object>
                    {
                        ["code"] = c.Code, ["severity"] = c.Severity, ["detail"] = c.Detail
                    }).ToList(),
                    ["metrics"] = quality.Metrics.ToDictionary(pair => pair.Key, pair => pair.Value)
                },
                ["model"] = meta.Model,
                ["llmProvider"] = meta.LlmProvider,
                ["jobId"] = meta.JobId ?? string.Empty
            };
        }

        private static Dictionary<string, object> VersionFields(
            Dictionary<string, object> data,
            int version,
            string createdBy,
            string? instruction)
        {
            var copy = new Dictionary<string, object>(data);

            foreach (var key in new[] { "providerId", "status", "currentVersion", "platforms", "createdAt", "updatedAt", "type" })
                copy.Remove(key);

            copy["versionNumber"] = version;
            copy["createdBy"] = createdBy;
            copy["createdByAI"] = true;
            copy["revisionInstruction"] = instruction ?? string.Empty;
            copy["createdAt"] = Timestamp.GetCurrentTimestamp();

            return copy;
        }

        private static Dictionary<string, object> BlockToMap(ContentBlock block) => new()
        {
            ["type"] = block.Type,
            ["level"] = block.Level,
            ["text"] = block.Text,
            ["ordered"] = block.Ordered,
            ["items"] = block.Items.ToList()
        };
    }
}
