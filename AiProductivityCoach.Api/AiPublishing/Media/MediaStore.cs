using Google.Cloud.Firestore;
using AiProductivityCoach.Api.AiPublishing.Domain;

namespace AiProductivityCoach.Api.AiPublishing.Media
{
    /// <summary>Images of one draft: ai_content/{contentId}/media/{mediaId}. The cover is a field on the draft.</summary>
    public sealed class MediaStore
    {
        public const int MaxImagesPerDocument = 6;

        private readonly FirestoreDb _firestore;

        public MediaStore(FirestoreDb firestore)
        {
            _firestore = firestore;
        }

        private DocumentReference Content(string contentId) => _firestore.Collection(AiCollections.Content).Document(contentId);

        private CollectionReference Media(string contentId) => Content(contentId).Collection(AiCollections.ContentMedia);

        public string NewId(string contentId) => Media(contentId).Document().Id;

        public async Task<List<Dictionary<string, object?>>> ListAsync(string contentId)
        {
            var snapshot = await Media(contentId).GetSnapshotAsync();

            return snapshot.Documents
                .Select(doc => Services.FirestoreApi.ToApi(doc))
                .OrderByDescending(row => row.TryGetValue("createdAt", out var v) ? v?.ToString() : "")
                .ToList();
        }

        public async Task<int> CountAsync(string contentId) => (await Media(contentId).GetSnapshotAsync()).Count;

        public async Task<Dictionary<string, object>?> GetAsync(string contentId, string mediaId)
        {
            var snap = await Media(contentId).Document(mediaId).GetSnapshotAsync();
            return snap.Exists ? snap.ToDictionary() : null;
        }

        /// <summary>Saves the image; the first one of a draft automatically becomes its cover.</summary>
        public async Task AddAsync(string contentId, string mediaId, Dictionary<string, object> data)
        {
            await _firestore.RunTransactionAsync(async tx =>
            {
                var contentRef = Content(contentId);
                var snap = await tx.GetSnapshotAsync(contentRef);
                if (!snap.Exists) throw new InvalidOperationException("Content not found.");

                tx.Set(Media(contentId).Document(mediaId), data);

                var hasCover = snap.ContainsField("coverMediaId") && !string.IsNullOrEmpty(snap.GetValue<string>("coverMediaId"));
                var update = new Dictionary<string, object> { ["updatedAt"] = Timestamp.GetCurrentTimestamp() };

                if (!hasCover)
                {
                    update["coverMediaId"] = mediaId;
                    update["coverUrl"] = data["url"];
                    update["coverAlt"] = data["altText"];
                }

                tx.Update(contentRef, update);
            });
        }

        public async Task SetCoverAsync(string contentId, string mediaId)
        {
            var media = await GetAsync(contentId, mediaId) ?? throw new InvalidOperationException("Media not found.");

            await Content(contentId).UpdateAsync(new Dictionary<string, object>
            {
                ["coverMediaId"] = mediaId,
                ["coverUrl"] = media["url"],
                ["coverAlt"] = media.GetValueOrDefault("altText") ?? string.Empty,
                ["updatedAt"] = Timestamp.GetCurrentTimestamp()
            });
        }

        /// <summary>Deletes the image record; when it was the cover, the newest remaining image takes over.</summary>
        public async Task DeleteAsync(string contentId, string mediaId)
        {
            await Media(contentId).Document(mediaId).DeleteAsync();

            var content = await Content(contentId).GetSnapshotAsync();
            if (!content.Exists) return;

            var cover = content.ContainsField("coverMediaId") ? content.GetValue<string>("coverMediaId") : null;
            if (cover != mediaId) return;

            var rest = await ListAsync(contentId);
            var next = rest.FirstOrDefault();

            await Content(contentId).UpdateAsync(next == null
                ? new Dictionary<string, object> { ["coverMediaId"] = string.Empty, ["coverUrl"] = string.Empty, ["coverAlt"] = string.Empty }
                : new Dictionary<string, object>
                {
                    ["coverMediaId"] = next["id"]?.ToString() ?? string.Empty,
                    ["coverUrl"] = next["url"]?.ToString() ?? string.Empty,
                    ["coverAlt"] = next["altText"]?.ToString() ?? string.Empty
                });
        }

        public async Task DeleteAllAsync(string contentId)
        {
            var snapshot = await Media(contentId).GetSnapshotAsync();
            var batch = _firestore.StartBatch();
            foreach (var doc in snapshot.Documents) batch.Delete(doc.Reference);
            await batch.CommitAsync();
        }
    }
}
