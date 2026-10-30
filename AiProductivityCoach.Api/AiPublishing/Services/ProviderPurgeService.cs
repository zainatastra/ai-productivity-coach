using Google.Cloud.Firestore;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Media;

namespace AiProductivityCoach.Api.AiPublishing.Services
{
    public sealed record PurgeSummary(int Documents, int Images);

    /// <summary>
    /// Permanently removes one provider with everything that belongs to it: sources, pages, the
    /// knowledge base, the content plan, all drafts (with versions and images), jobs, notifications
    /// and AI run records. The audit log is kept on purpose: it is the proof of who deleted what.
    /// Every query is scoped to the provider id, so no other provider can be touched.
    /// </summary>
    public sealed class ProviderPurgeService
    {
        private const int BatchSize = 400;

        private readonly FirestoreDb _firestore;
        private readonly MediaStore _media;
        private readonly GeneratedMediaStorage _storage;
        private readonly ILogger<ProviderPurgeService> _logger;

        public ProviderPurgeService(
            FirestoreDb firestore,
            MediaStore media,
            GeneratedMediaStorage storage,
            ILogger<ProviderPurgeService> logger)
        {
            _firestore = firestore;
            _media = media;
            _storage = storage;
            _logger = logger;
        }

        public async Task<PurgeSummary> PurgeAsync(string providerId, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(providerId))
                throw new ArgumentException("A provider id is required.", nameof(providerId));

            var documents = 0;
            var images = 0;

            // 1) drafts, including versions and the stored image files
            var drafts = await _firestore.Collection(AiCollections.Content)
                .WhereEqualTo("providerId", providerId)
                .GetSnapshotAsync(ct);

            foreach (var draft in drafts.Documents)
            {
                foreach (var name in new[] { AiCollections.ContentComments, AiCollections.ContentStatusLog })
                    await foreach (var doc in draft.Reference.Collection(name).ListDocumentsAsync().WithCancellation(ct))
                        await doc.DeleteAsync(cancellationToken: ct);

                foreach (var image in await _media.ListAsync(draft.Id))
                {
                    await _storage.DeleteAsync(image.GetValueOrDefault("pathname")?.ToString(), ct);
                    images++;
                }

                documents += await DeleteRecursiveAsync(draft.Reference, ct);
            }

            // 2) jobs, notifications and AI run records of this provider
            foreach (var collection in new[] { AiCollections.Jobs, AiCollections.Notifications, AiCollections.Runs, AiCollections.Invitations, AiCollections.Members })
            {
                var rows = await _firestore.Collection(collection)
                    .WhereEqualTo("providerId", providerId)
                    .GetSnapshotAsync(ct);

                await DeleteReferencesAsync(rows.Documents.Select(d => d.Reference).ToList(), ct);
                documents += rows.Count;
            }

            // 3) the provider itself with sources, pages, knowledge chunks and the plan
            documents += await DeleteRecursiveAsync(_firestore.Collection(AiCollections.Providers).Document(providerId), ct);

            _logger.LogWarning("[Purge] Provider {ProviderId} deleted ({Documents} documents, {Images} images).", providerId, documents, images);

            return new PurgeSummary(documents, images);
        }

        /// <summary>Deletes a document and everything below it.</summary>
        private async Task<int> DeleteRecursiveAsync(DocumentReference doc, CancellationToken ct)
        {
            var count = 0;

            await foreach (var sub in doc.ListCollectionsAsync().WithCancellation(ct))
            {
                var children = new List<DocumentReference>();

                await foreach (var child in sub.ListDocumentsAsync().WithCancellation(ct))
                    children.Add(child);

                foreach (var child in children)
                    count += await DeleteRecursiveAsync(child, ct);
            }

            await doc.DeleteAsync(cancellationToken: ct);
            return count + 1;
        }

        private async Task DeleteReferencesAsync(List<DocumentReference> references, CancellationToken ct)
        {
            for (var offset = 0; offset < references.Count; offset += BatchSize)
            {
                var batch = _firestore.StartBatch();
                foreach (var reference in references.Skip(offset).Take(BatchSize))
                    batch.Delete(reference);

                await batch.CommitAsync(ct);
            }
        }
    }
}
