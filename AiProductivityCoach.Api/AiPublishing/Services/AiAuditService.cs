using Google.Cloud.Firestore;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Security;

namespace AiProductivityCoach.Api.AiPublishing.Services
{
    /// <summary>Append-only audit trail for the AI Publishing Engine (spec section 38).</summary>
    public sealed class AiAuditService
    {
        private readonly FirestoreDb _firestore;
        private readonly ILogger<AiAuditService> _logger;

        public AiAuditService(FirestoreDb firestore, ILogger<AiAuditService> logger)
        {
            _firestore = firestore;
            _logger = logger;
        }

        public async Task LogAsync(
            TenantContext actor,
            string action,
            string? providerId = null,
            string? contentId = null,
            string? agentRunId = null,
            Dictionary<string, object>? metadata = null)
        {
            try
            {
                var data = new Dictionary<string, object>
                {
                    ["actorUserId"] = actor.UserId,
                    ["actorRole"] = actor.Role,
                    ["platform"] = actor.Platform,
                    ["providerId"] = providerId ?? string.Empty,
                    ["contentId"] = contentId ?? string.Empty,
                    ["agentRunId"] = agentRunId ?? string.Empty,
                    ["action"] = action,
                    ["metadata"] = metadata ?? new Dictionary<string, object>(),
                    ["createdAt"] = Timestamp.GetCurrentTimestamp()
                };

                await _firestore.Collection(AiCollections.AuditLogs).AddAsync(data);
            }
            catch (Exception ex)
            {
                // Logging must never break the user-facing operation.
                _logger.LogError(ex, "AI audit log write failed for action {Action}", action);
            }
        }

        public async Task<List<Dictionary<string, object?>>> ListAsync(
            string? providerId,
            int limit,
            CancellationToken cancellationToken = default)
        {
            Query query = _firestore.Collection(AiCollections.AuditLogs);

            if (!string.IsNullOrWhiteSpace(providerId))
                query = query.WhereEqualTo("providerId", providerId);
            else
                query = query.OrderByDescending("createdAt");

            // With a provider filter we sort in memory to avoid needing a composite index.
            var snapshot = await query.Limit(providerId == null ? limit : 500)
                .GetSnapshotAsync(cancellationToken);

            return snapshot.Documents
                .Select(doc => FirestoreApi.ToApi(doc))
                .OrderByDescending(row => row.TryGetValue("createdAt", out var v) ? v?.ToString() : "")
                .Take(limit)
                .ToList();
        }
    }
}
