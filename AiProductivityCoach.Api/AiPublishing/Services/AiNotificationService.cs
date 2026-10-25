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

            Invalidate();
        }

        // The admin screen asks for notifications regularly. The list is cached briefly (and dropped
        // whenever this server creates or marks a notification) so the database is not read per request.
        private static readonly TimeSpan CacheLifetime = TimeSpan.FromSeconds(90);
        private readonly object _cacheLock = new();
        private QuerySnapshot? _cached;
        private DateTime _cachedAt = DateTime.MinValue;

        private void Invalidate()
        {
            lock (_cacheLock) _cached = null;
        }

        private async Task<QuerySnapshot> LoadAdminNotificationsAsync()
        {
            lock (_cacheLock)
            {
                if (_cached != null && DateTime.UtcNow - _cachedAt < CacheLifetime)
                    return _cached;
            }

            var fresh = await _firestore
                .Collection(AiCollections.Notifications)
                .WhereEqualTo("audience", AiRoles.Admin)
                .Limit(150)
                .GetSnapshotAsync();

            lock (_cacheLock)
            {
                _cached = fresh;
                _cachedAt = DateTime.UtcNow;
            }

            return fresh;
        }

        public async Task<(List<Dictionary<string, object?>> Items, int Unread)> ListForAdminAsync(
            string adminUid,
            bool unreadOnly,
            int limit)
        {
            var snapshot = await LoadAdminNotificationsAsync();

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
            var snapshot = await LoadAdminNotificationsAsync();

            foreach (var doc in snapshot.Documents)
            {
                if (ids != null && ids.Count > 0 && !ids.Contains(doc.Id))
                    continue;

                // Skip what this admin already read: no write needed.
                var readBy = doc.TryGetValue<List<string>>("readBy", out var list) ? list : new List<string>();
                if (readBy.Contains(adminUid))
                    continue;

                await doc.Reference.UpdateAsync("readBy", FieldValue.ArrayUnion(adminUid));
            }

            Invalidate();
        }
    }
}
