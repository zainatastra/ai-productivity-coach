using Google.Cloud.Firestore;
using AiProductivityCoach.Api.AiPublishing.Domain;

namespace AiProductivityCoach.Api.AiPublishing.Services
{
    /// <summary>In-app admin notifications (spec section 19, V1).</summary>
    public sealed class AiNotificationService
    {
        private readonly FirestoreDb _firestore;

        public AiNotificationService(FirestoreDb firestore)
        {
            _firestore = firestore;
        }

        public async Task NotifyAdminsAsync(
            string platform,
            string providerId,
            string? jobId,
            string kind,
            string severity,
            string messageDe,
            string messageEn)
        {
            await _firestore.Collection(AiCollections.Notifications).AddAsync(new Dictionary<string, object>
            {
                ["audience"] = AiRoles.Admin,
                ["platform"] = platform,
                ["providerId"] = providerId,
                ["jobId"] = jobId ?? string.Empty,
                ["kind"] = kind,
                ["severity"] = severity,
                ["messageDe"] = messageDe,
                ["messageEn"] = messageEn,
                ["readBy"] = new List<string>(),
                ["createdAt"] = Timestamp.GetCurrentTimestamp()
            });
        }

        public async Task<(List<Dictionary<string, object?>> Items, int Unread)> ListForAdminAsync(
            string adminUid,
            bool unreadOnly,
            int limit)
        {
            var snapshot = await _firestore
                .Collection(AiCollections.Notifications)
                .WhereEqualTo("audience", AiRoles.Admin)
                .Limit(300)
                .GetSnapshotAsync();

            var rows = snapshot.Documents
                .Select(doc =>
                {
                    var row = FirestoreApi.ToApi(doc, "readBy");
                    var readBy = doc.TryGetValue<List<string>>("readBy", out var list)
                        ? list
                        : new List<string>();
                    row["read"] = readBy.Contains(adminUid);
                    return row;
                })
                .OrderByDescending(row => row.TryGetValue("createdAt", out var v) ? v?.ToString() : "")
                .ToList();

            var unread = rows.Count(row => row["read"] is false);

            if (unreadOnly)
                rows = rows.Where(row => row["read"] is false).ToList();

            return (rows.Take(limit).ToList(), unread);
        }

        public async Task MarkReadAsync(string adminUid, IReadOnlyCollection<string>? ids)
        {
            var snapshot = await _firestore
                .Collection(AiCollections.Notifications)
                .WhereEqualTo("audience", AiRoles.Admin)
                .Limit(300)
                .GetSnapshotAsync();

            foreach (var doc in snapshot.Documents)
            {
                if (ids != null && ids.Count > 0 && !ids.Contains(doc.Id))
                    continue;

                await doc.Reference.UpdateAsync("readBy", FieldValue.ArrayUnion(adminUid));
            }
        }
    }
}
