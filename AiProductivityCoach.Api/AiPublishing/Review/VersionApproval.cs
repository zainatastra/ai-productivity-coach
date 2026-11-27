using AiProductivityCoach.Api.AiPublishing.Content;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Services;
using Google.Cloud.Firestore;

namespace AiProductivityCoach.Api.AiPublishing.Review
{
    public static class ApprovalStates
    {
        public const string Requested = "requested";
        public const string ChangesRequested = "changes_requested";
        public const string Rejected = "rejected";
    }

    /// <summary>
    /// Version-based approval of pieces that are already approved or published. The live version is the
    /// one in <c>approvedVersion</c>; every edit after that is a newer, pending version. Platforms only
    /// ever receive the live version, so a pending edit never reaches the public until an admin approves it.
    /// </summary>
    public static class VersionApproval
    {
        public const string RequestField = "approvalRequest";
        public const string ApprovedField = "approvedVersion";
        public const string PublishedField = "publishedVersions";

        public static bool IsLive(string? status) => status == ContentStatus.Approved || status == ContentStatus.Published;

        public static long CurrentVersion(IDictionary<string, object> data) =>
            Math.Max(1, FirestoreApi.GetLong(data, "currentVersion", 1));

        /// <summary>The live version. A piece approved before versioned approval existed has no value: its current text is live.</summary>
        public static long ApprovedVersion(IDictionary<string, object> data)
        {
            var approved = FirestoreApi.GetLong(data, ApprovedField, 0);
            return approved > 0 ? approved : CurrentVersion(data);
        }

        public static bool HasPendingChanges(IDictionary<string, object> data) =>
            IsLive(FirestoreApi.GetString(data, "status")) && CurrentVersion(data) > ApprovedVersion(data);

        public static string State(IDictionary<string, object> data) =>
            data.TryGetValue(RequestField, out var raw) && raw is IDictionary<string, object> map
                ? FirestoreApi.GetString(map, "state")
                : string.Empty;

        public static long RequestedVersion(IDictionary<string, object> data) =>
            data.TryGetValue(RequestField, out var raw) && raw is IDictionary<string, object> map
                ? FirestoreApi.GetLong(map, "version", 0)
                : 0;

        /// <summary>A request can be made when there are pending changes and none is waiting for the admin yet.</summary>
        public static bool CanRequest(IDictionary<string, object> data) =>
            HasPendingChanges(data) && State(data) != ApprovalStates.Requested;

        /// <summary>Admins may approve pending changes at any time; sending them back or rejecting needs a request.</summary>
        public static bool CanDecide(IDictionary<string, object> data, string decision) =>
            HasPendingChanges(data) && (decision == "approve" || State(data) == ApprovalStates.Requested);

        /// <summary>The version a platform currently shows, or 0 if this piece was never published there.</summary>
        public static long PublishedVersion(IDictionary<string, object> data, string platform) =>
            data.TryGetValue(PublishedField, out var raw) && raw is IDictionary<string, object> map
                ? FirestoreApi.GetLong(map, platform, 0)
                : 0;

        /// <summary>A platform is out of date when it shows an older version than the live one (or none).</summary>
        public static bool IsOutOfDate(IDictionary<string, object> data, string platform) =>
            IsLive(FirestoreApi.GetString(data, "status")) && PublishedVersion(data, platform) < ApprovedVersion(data);

        /// <summary>Records which version a platform now shows.</summary>
        public static Task MarkPublishedAsync(DocumentReference piece, string platform, long version, CancellationToken ct = default) =>
            piece.UpdateAsync(new Dictionary<string, object> { [$"{PublishedField}.{platform}"] = version }, cancellationToken: ct);

        public static bool IsValidDecision(string? decision) =>
            decision is "approve" or "request_changes" or "reject";

        /// <summary>
        /// The text platforms should use: the live version. When edits are pending, the live version's
        /// stored text replaces the current text; everything else (cover, status) is taken as it is.
        /// </summary>
        public static async Task<IDictionary<string, object>> LiveDataAsync(DocumentSnapshot piece, CancellationToken ct = default)
        {
            var data = piece.ToDictionary();
            if (!HasPendingChanges(data)) return data;

            var version = await piece.Reference
                .Collection(AiCollections.ContentVersions)
                .Document(ApprovedVersion(data).ToString())
                .GetSnapshotAsync(ct);

            return version.Exists ? Overlay(data, version.ToDictionary()) : data;
        }

        public static IDictionary<string, object> Overlay(IDictionary<string, object> current, IDictionary<string, object> live)
        {
            var merged = new Dictionary<string, object>(current);

            foreach (var field in ContentStore.VersionedFields)
            {
                if (live.TryGetValue(field, out var value) && value != null) merged[field] = value;
            }

            return merged;
        }
    }
}
