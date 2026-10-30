using Google.Cloud.Firestore;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.AiPublishing.Review
{
    public static class InvitationStatus
    {
        public const string Pending = "pending";
        public const string Accepted = "accepted";
        public const string Revoked = "revoked";
    }

    public sealed record InvitationInfo(string Id, string ProviderId, string Email, string Platform, string Status, DateTime ExpiresAt)
    {
        public bool IsUsable => Status == InvitationStatus.Pending && ExpiresAt > DateTime.UtcNow;
    }

    /// <summary>Invitations of a provider to a company contact: ai_invitations/{id}.</summary>
    public sealed class InvitationService
    {
        private readonly FirestoreDb _firestore;

        public InvitationService(FirestoreDb firestore)
        {
            _firestore = firestore;
        }

        private CollectionReference Invitations => _firestore.Collection(AiCollections.Invitations);

        /// <summary>Creates an invitation. An older open invitation for the same address is revoked.</summary>
        public async Task<(string Id, string Token)> CreateAsync(string providerId, string email, string platform, string createdBy)
        {
            var open = await Invitations
                .WhereEqualTo("providerId", providerId)
                .WhereEqualTo("email", email)
                .WhereEqualTo("status", InvitationStatus.Pending)
                .GetSnapshotAsync();

            foreach (var old in open.Documents)
                await old.Reference.UpdateAsync("status", InvitationStatus.Revoked);

            var token = InvitationTokens.Generate();
            var now = DateTime.UtcNow;
            var doc = Invitations.Document();

            await doc.SetAsync(new Dictionary<string, object>
            {
                ["providerId"] = providerId,
                ["email"] = email,
                ["platform"] = platform,
                ["tokenHash"] = InvitationTokens.Hash(token),
                ["status"] = InvitationStatus.Pending,
                ["createdBy"] = createdBy,
                ["createdAt"] = Timestamp.FromDateTime(now),
                ["expiresAt"] = Timestamp.FromDateTime(now.Add(InvitationTokens.Lifetime))
            });

            return (doc.Id, token);
        }

        public async Task<List<Dictionary<string, object?>>> ListAsync(string providerId)
        {
            var snapshot = await Invitations.WhereEqualTo("providerId", providerId).Limit(50).GetSnapshotAsync();

            return snapshot.Documents
                .Select(doc => FirestoreApi.ToApi(doc, "tokenHash"))
                .OrderByDescending(row => row.TryGetValue("createdAt", out var v) ? v?.ToString() : "")
                .ToList();
        }

        public async Task<InvitationInfo?> FindByTokenAsync(string token)
        {
            if (!InvitationTokens.LooksValid(token)) return null;

            var snapshot = await Invitations.WhereEqualTo("tokenHash", InvitationTokens.Hash(token)).Limit(1).GetSnapshotAsync();
            return snapshot.Count == 0 ? null : ToInfo(snapshot.Documents[0]);
        }

        public async Task<InvitationInfo?> GetAsync(string providerId, string invitationId)
        {
            var snap = await Invitations.Document(invitationId).GetSnapshotAsync();
            if (!snap.Exists) return null;

            var info = ToInfo(snap);
            return info.ProviderId == providerId ? info : null;
        }

        public async Task<bool> RevokeAsync(string providerId, string invitationId)
        {
            var info = await GetAsync(providerId, invitationId);
            if (info == null || info.Status != InvitationStatus.Pending) return false;

            await Invitations.Document(invitationId).UpdateAsync("status", InvitationStatus.Revoked);
            return true;
        }

        /// <summary>Marks the invitation as used. Fails when it was already used or revoked in the meantime.</summary>
        public async Task<bool> MarkAcceptedAsync(string invitationId, string uid)
        {
            var docRef = Invitations.Document(invitationId);

            return await _firestore.RunTransactionAsync(async tx =>
            {
                var snap = await tx.GetSnapshotAsync(docRef);
                if (!snap.Exists || snap.GetValue<string>("status") != InvitationStatus.Pending) return false;

                tx.Update(docRef, new Dictionary<string, object>
                {
                    ["status"] = InvitationStatus.Accepted,
                    ["acceptedBy"] = uid,
                    ["acceptedAt"] = Timestamp.GetCurrentTimestamp()
                });

                return true;
            });
        }

        private static InvitationInfo ToInfo(DocumentSnapshot doc)
        {
            var data = doc.ToDictionary();

            return new InvitationInfo(
                doc.Id,
                FirestoreApi.GetString(data, "providerId"),
                FirestoreApi.GetString(data, "email"),
                FirestoreApi.GetString(data, "platform", Platforms.EyEric),
                FirestoreApi.GetString(data, "status"),
                FirestoreApi.GetDate(data, "expiresAt") ?? DateTime.MinValue);
        }
    }
}
