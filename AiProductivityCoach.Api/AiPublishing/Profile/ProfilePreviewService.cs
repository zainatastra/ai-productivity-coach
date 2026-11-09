using Google.Cloud.Firestore;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Review;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.AiPublishing.Profile
{
    public sealed record PreviewLinkStatus(bool Active, DateTime? CreatedAt);

    /// <summary>
    /// The "preview with link" that spec section 5 asks for: a provider profile that exists before
    /// anyone is invited or approved, viewable only by whoever holds the secret link - not a public
    /// listing, not login-gated. Reuses the same token design as Phase 6's invitation links
    /// (<see cref="InvitationTokens"/>: random, only the hash is stored), but unlike an invitation
    /// this link has no fixed expiry - it stays valid until the admin revokes or regenerates it,
    /// since it is meant to stay usable for as long as the profile is being reviewed before send/approval.
    /// </summary>
    public sealed class ProfilePreviewService
    {
        private readonly FirestoreDb _firestore;

        public ProfilePreviewService(FirestoreDb firestore)
        {
            _firestore = firestore;
        }

        private DocumentReference ProviderRef(string providerId) => _firestore.Collection(AiCollections.Providers).Document(providerId);

        /// <summary>Creates a fresh link, invalidating any previous one. The raw token is returned only here.</summary>
        public async Task<string> CreateOrRotateAsync(string providerId)
        {
            var token = InvitationTokens.Generate();

            await ProviderRef(providerId).UpdateAsync(new Dictionary<string, object>
            {
                ["previewTokenHash"] = InvitationTokens.Hash(token),
                ["previewCreatedAt"] = Timestamp.GetCurrentTimestamp(),
                ["previewRevokedAt"] = FieldValue.Delete
            });

            return token;
        }

        public async Task RevokeAsync(string providerId)
        {
            await ProviderRef(providerId).UpdateAsync(new Dictionary<string, object>
            {
                ["previewRevokedAt"] = Timestamp.GetCurrentTimestamp()
            });
        }

        public async Task<PreviewLinkStatus> StatusAsync(string providerId)
        {
            var doc = await ProviderRef(providerId).GetSnapshotAsync();
            if (!doc.Exists) return new PreviewLinkStatus(false, null);

            var data = doc.ToDictionary();
            var hasToken = FirestoreApi.GetString(data, "previewTokenHash").Length > 0;
            var revoked = data.ContainsKey("previewRevokedAt");

            return new PreviewLinkStatus(hasToken && !revoked, FirestoreApi.GetDate(data, "previewCreatedAt"));
        }

        /// <summary>Resolves a token from a public link to its provider, or null when invalid/revoked/unknown.</summary>
        public async Task<DocumentSnapshot?> ResolveAsync(string? token)
        {
            if (!InvitationTokens.LooksValid(token)) return null;

            var hash = InvitationTokens.Hash(token!);

            var snapshot = await _firestore.Collection(AiCollections.Providers)
                .WhereEqualTo("previewTokenHash", hash)
                .Limit(1)
                .GetSnapshotAsync();

            if (snapshot.Count == 0) return null;

            var doc = snapshot.Documents[0];
            return doc.ToDictionary().ContainsKey("previewRevokedAt") ? null : doc;
        }

        public sealed record PreviewContentItem(string Id, string Type, string Title, string Excerpt, int WordCount);

        /// <summary>
        /// The pieces the admin can already show alongside the profile on the preview page - every
        /// draft/approved/published piece for this provider, newest first. Archived pieces are left
        /// out since the admin has deliberately retired them.
        /// </summary>
        public async Task<IReadOnlyList<PreviewContentItem>> GetContentAsync(string providerId)
        {
            var snapshot = await _firestore.Collection(AiCollections.Content)
                .WhereEqualTo("providerId", providerId)
                .GetSnapshotAsync();

            return snapshot.Documents
                .Select(doc => (Id: doc.Id, Data: doc.ToDictionary()))
                .Where(entry => FirestoreApi.GetString(entry.Data, "status") != Domain.ContentStatus.Archived)
                .OrderByDescending(entry => FirestoreApi.GetDate(entry.Data, "updatedAt") ?? DateTime.MinValue)
                .Select(entry => new PreviewContentItem(
                    entry.Id,
                    FirestoreApi.GetString(entry.Data, "type"),
                    FirestoreApi.GetString(entry.Data, "title"),
                    FirestoreApi.GetString(entry.Data, "excerpt"),
                    (int)FirestoreApi.GetLong(entry.Data, "wordCount")))
                .ToList();
        }
    }
}
