using Google.Cloud.Firestore;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.AiPublishing.Claims
{
    /// <summary>The claim requests (collection company_claims): who asked to take over which unclaimed profile.</summary>
    public sealed class ClaimStore
    {
        private readonly FirestoreDb _firestore;

        public ClaimStore(FirestoreDb firestore)
        {
            _firestore = firestore;
        }

        private CollectionReference Claims => _firestore.Collection("company_claims");

        public DocumentReference Ref(string claimId) => Claims.Document(claimId);

        public async Task<bool> HasPendingAsync(string companyId, string email)
        {
            var snapshot = await Claims.WhereEqualTo("companyId", companyId).WhereEqualTo("state", ClaimStates.Pending).GetSnapshotAsync();
            return snapshot.Documents.Any(d => string.Equals(FirestoreApi.GetString(d.ToDictionary(), "email"), email, StringComparison.OrdinalIgnoreCase));
        }

        public async Task<string> CreateAsync(Dictionary<string, object> claim)
        {
            claim["state"] = ClaimStates.Pending;
            claim["createdAt"] = Timestamp.GetCurrentTimestamp();

            var doc = await Claims.AddAsync(claim);
            return doc.Id;
        }

        public async Task<List<Dictionary<string, object?>>> ListAsync(string state, int limit = 100)
        {
            var snapshot = await Claims.WhereEqualTo("state", state).Limit(limit).GetSnapshotAsync();

            return snapshot.Documents
                .Select(doc => FirestoreApi.ToApi(doc))
                .OrderByDescending(row => row.GetValueOrDefault("createdAt")?.ToString())
                .ToList();
        }
    }
}
