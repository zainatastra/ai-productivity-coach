using Google.Cloud.Firestore;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.AiPublishing.Review
{
    /// <summary>
    /// Which company login may see which provider: ai_provider_members/{providerId}_{uid}.
    /// This is the ONLY source of company access; nothing a client sends can widen it.
    /// </summary>
    public sealed class MembershipService
    {
        private readonly FirestoreDb _firestore;

        public MembershipService(FirestoreDb firestore)
        {
            _firestore = firestore;
        }

        private CollectionReference Members => _firestore.Collection(AiCollections.Members);

        public static string IdOf(string providerId, string uid) => $"{providerId}_{uid}";

        public async Task AddAsync(string providerId, string uid, string email, string platform, string invitationId)
        {
            await Members.Document(IdOf(providerId, uid)).SetAsync(new Dictionary<string, object>
            {
                ["providerId"] = providerId,
                ["uid"] = uid,
                ["email"] = email,
                ["platform"] = platform,
                ["invitationId"] = invitationId,
                ["status"] = "active",
                ["createdAt"] = Timestamp.GetCurrentTimestamp()
            });
        }

        public async Task<bool> IsMemberAsync(string providerId, string uid)
        {
            if (string.IsNullOrWhiteSpace(providerId) || string.IsNullOrWhiteSpace(uid)) return false;

            var snap = await Members.Document(IdOf(providerId, uid)).GetSnapshotAsync();
            return snap.Exists && FirestoreApi.GetString(snap.ToDictionary(), "status") == "active";
        }

        public async Task<List<string>> ProviderIdsOfAsync(string uid)
        {
            var snapshot = await Members.WhereEqualTo("uid", uid).Limit(20).GetSnapshotAsync();

            return snapshot.Documents
                .Where(doc => FirestoreApi.GetString(doc.ToDictionary(), "status") == "active")
                .Select(doc => FirestoreApi.GetString(doc.ToDictionary(), "providerId"))
                .Where(id => id.Length > 0)
                .Distinct()
                .ToList();
        }

        public async Task<List<Dictionary<string, object?>>> ListAsync(string providerId)
        {
            var snapshot = await Members.WhereEqualTo("providerId", providerId).Limit(50).GetSnapshotAsync();

            return snapshot.Documents
                .Select(doc => FirestoreApi.ToApi(doc))
                .Where(row => row.GetValueOrDefault("status")?.ToString() == "active")
                .ToList();
        }

        public async Task<bool> RemoveAsync(string providerId, string uid)
        {
            var docRef = Members.Document(IdOf(providerId, uid));
            var snap = await docRef.GetSnapshotAsync();
            if (!snap.Exists) return false;

            await docRef.DeleteAsync();
            return true;
        }
    }
}
