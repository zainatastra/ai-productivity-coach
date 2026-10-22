using Google.Cloud.Firestore;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.AiPublishing.Jobs
{
    /// <summary>
    /// Firestore-backed job queue (spec section 18). Jobs survive restarts:
    /// state, progress and attempts are persisted, stale jobs are re-queued.
    /// </summary>
    public sealed class AiJobService
    {
        public const int MaxAttempts = 3;
        public static readonly TimeSpan StaleAfter = TimeSpan.FromMinutes(2);

        private readonly FirestoreDb _firestore;

        public AiJobService(FirestoreDb firestore)
        {
            _firestore = firestore;
        }

        private CollectionReference Jobs => _firestore.Collection(AiCollections.Jobs);

        // ───────────── creation / queries ─────────────

        public async Task<(string JobId, bool AlreadyActive)> CreateAsync(
            string type,
            string providerId,
            string platform,
            string createdBy,
            Dictionary<string, object>? payload,
            List<Dictionary<string, object>> steps)
        {
            // Idempotency: never run two jobs for the same provider at once.
            var existing = await Jobs
                .WhereEqualTo("providerId", providerId)
                .Limit(100)
                .GetSnapshotAsync();

            // One job at a time per provider: crawling, source checks and analysis all write
            // the same sources/knowledge, so a second job is answered with the running one.
            var running = existing.Documents.FirstOrDefault(doc =>
                JobStatus.IsRunnable(doc.GetValue<string>("status")));

            if (running != null)
                return (running.Id, true);

            var now = Timestamp.GetCurrentTimestamp();
            var docRef = Jobs.Document();

            await docRef.SetAsync(new Dictionary<string, object>
            {
                ["type"] = type,
                ["providerId"] = providerId,
                ["platform"] = platform,
                ["status"] = JobStatus.Queued,
                ["progress"] = 0,
                ["steps"] = steps,
                ["payload"] = payload ?? new Dictionary<string, object>(),
                ["attempts"] = 0,
                ["maxAttempts"] = MaxAttempts,
                ["error"] = string.Empty,
                ["result"] = new Dictionary<string, object>(),
                ["createdBy"] = createdBy,
                ["createdAt"] = now,
                ["updatedAt"] = now,
                ["runAfter"] = now
            });

            return (docRef.Id, false);
        }

        public async Task<DocumentSnapshot?> GetAsync(string jobId)
        {
            if (string.IsNullOrWhiteSpace(jobId)) return null;

            var doc = await Jobs.Document(jobId).GetSnapshotAsync();
            return doc.Exists ? doc : null;
        }

        public async Task<List<Dictionary<string, object?>>> ListForProviderAsync(string providerId, int limit)
        {
            var snapshot = await Jobs
                .WhereEqualTo("providerId", providerId)
                .Limit(100)
                .GetSnapshotAsync();

            return snapshot.Documents
                .Select(doc => FirestoreApi.ToApi(doc, "lockedBy", "payload"))
                .OrderByDescending(row => row.TryGetValue("createdAt", out var v) ? v?.ToString() : "")
                .Take(limit)
                .ToList();
        }

        // ───────────── admin actions ─────────────

        public async Task<bool> CancelAsync(string jobId)
        {
            var docRef = Jobs.Document(jobId);

            return await _firestore.RunTransactionAsync(async tx =>
            {
                var snap = await tx.GetSnapshotAsync(docRef);
                if (!snap.Exists || !JobStatus.IsRunnable(snap.GetValue<string>("status")))
                    return false;

                tx.Update(docRef, new Dictionary<string, object>
                {
                    ["status"] = JobStatus.Cancelled,
                    ["completedAt"] = Timestamp.GetCurrentTimestamp(),
                    ["updatedAt"] = Timestamp.GetCurrentTimestamp()
                });

                return true;
            });
        }

        public async Task<bool> RetryAsync(string jobId)
        {
            var docRef = Jobs.Document(jobId);

            return await _firestore.RunTransactionAsync(async tx =>
            {
                var snap = await tx.GetSnapshotAsync(docRef);
                if (!snap.Exists) return false;

                var status = snap.GetValue<string>("status");
                if (status != JobStatus.Failed &&
                    status != JobStatus.PartiallyCompleted &&
                    status != JobStatus.Cancelled)
                    return false;

                var steps = snap.TryGetValue<List<Dictionary<string, object>>>("steps", out var stored)
                    ? stored.Select(step =>
                    {
                        var copy = new Dictionary<string, object>(step) { ["status"] = "pending" };
                        copy.Remove("detail");
                        return copy;
                    }).ToList()
                    : new List<Dictionary<string, object>>();

                var now = Timestamp.GetCurrentTimestamp();

                tx.Update(docRef, new Dictionary<string, object>
                {
                    ["status"] = JobStatus.Queued,
                    ["progress"] = 0,
                    ["steps"] = steps,
                    ["attempts"] = 0,
                    ["error"] = string.Empty,
                    ["result"] = new Dictionary<string, object>(),
                    ["completedAt"] = FieldValue.Delete,
                    ["startedAt"] = FieldValue.Delete,
                    ["lockedBy"] = FieldValue.Delete,
                    ["runAfter"] = now,
                    ["updatedAt"] = now
                });

                return true;
            });
        }

        // ───────────── worker operations ─────────────

        public async Task<DocumentSnapshot?> TryClaimNextAsync(
            string instanceId,
            Func<string, string?> activeStatusForType)
        {
            var queued = await Jobs
                .WhereEqualTo("status", JobStatus.Queued)
                .Limit(25)
                .GetSnapshotAsync();

            var now = DateTime.UtcNow;

            var candidates = queued.Documents
                .Where(doc => (FirestoreApi.GetDate(doc.ToDictionary(), "runAfter") ?? DateTime.MinValue) <= now)
                .OrderBy(doc => FirestoreApi.GetDate(doc.ToDictionary(), "createdAt") ?? DateTime.MinValue)
                .ToList();

            foreach (var candidate in candidates)
            {
                var type = candidate.GetValue<string>("type");
                var activeStatus = activeStatusForType(type);

                if (activeStatus == null)
                    continue; // no handler registered for this type in this build

                var claimed = await _firestore.RunTransactionAsync(async tx =>
                {
                    var snap = await tx.GetSnapshotAsync(candidate.Reference);

                    if (!snap.Exists || snap.GetValue<string>("status") != JobStatus.Queued)
                        return false;

                    var stamp = Timestamp.GetCurrentTimestamp();

                    tx.Update(candidate.Reference, new Dictionary<string, object>
                    {
                        ["status"] = activeStatus,
                        ["lockedBy"] = instanceId,
                        ["attempts"] = FirestoreApi.GetLong(snap.ToDictionary(), "attempts") + 1,
                        ["startedAt"] = stamp,
                        ["heartbeatAt"] = stamp,
                        ["updatedAt"] = stamp
                    });

                    return true;
                });

                if (claimed)
                    return await candidate.Reference.GetSnapshotAsync();
            }

            return null;
        }

        public async Task HeartbeatAsync(string jobId)
        {
            await Jobs.Document(jobId).UpdateAsync(new Dictionary<string, object>
            {
                ["heartbeatAt"] = Timestamp.GetCurrentTimestamp()
            });
        }

        public async Task SetStatusAsync(string jobId, string status)
        {
            var docRef = Jobs.Document(jobId);

            await _firestore.RunTransactionAsync(async tx =>
            {
                var snap = await tx.GetSnapshotAsync(docRef);

                // A cancelled job must stay cancelled.
                if (!snap.Exists || !JobStatus.IsActive(snap.GetValue<string>("status")))
                    return;

                tx.Update(docRef, new Dictionary<string, object>
                {
                    ["status"] = status,
                    ["updatedAt"] = Timestamp.GetCurrentTimestamp()
                });
            });
        }

        public async Task ReportProgressAsync(
            string jobId,
            int progress,
            List<Dictionary<string, object>> steps)
        {
            var docRef = Jobs.Document(jobId);

            await _firestore.RunTransactionAsync(async tx =>
            {
                var snap = await tx.GetSnapshotAsync(docRef);

                if (!snap.Exists || !JobStatus.IsActive(snap.GetValue<string>("status")))
                    return;

                var stamp = Timestamp.GetCurrentTimestamp();

                tx.Update(docRef, new Dictionary<string, object>
                {
                    ["progress"] = Math.Clamp(progress, 0, 100),
                    ["steps"] = steps,
                    ["heartbeatAt"] = stamp,
                    ["updatedAt"] = stamp
                });
            });
        }

        public async Task<bool> IsCancelledAsync(string jobId)
        {
            var snap = await Jobs.Document(jobId).GetSnapshotAsync();
            return snap.Exists && snap.GetValue<string>("status") == JobStatus.Cancelled;
        }

        /// <summary>Writes the final state. A job cancelled meanwhile stays cancelled.</summary>
        public async Task<bool> FinishAsync(string jobId, JobOutcome outcome)
        {
            var docRef = Jobs.Document(jobId);

            return await _firestore.RunTransactionAsync(async tx =>
            {
                var snap = await tx.GetSnapshotAsync(docRef);

                if (!snap.Exists || !JobStatus.IsActive(snap.GetValue<string>("status")))
                    return false;

                var stamp = Timestamp.GetCurrentTimestamp();
                var done = outcome.Status != JobStatus.Failed;

                tx.Update(docRef, new Dictionary<string, object>
                {
                    ["status"] = outcome.Status,
                    ["progress"] = done ? 100 : FirestoreApi.GetLong(snap.ToDictionary(), "progress"),
                    ["error"] = outcome.ErrorCode ?? string.Empty,
                    ["result"] = outcome.Result ?? new Dictionary<string, object>(),
                    ["messageDe"] = outcome.MessageDe,
                    ["messageEn"] = outcome.MessageEn,
                    ["completedAt"] = stamp,
                    ["lockedBy"] = FieldValue.Delete,
                    ["updatedAt"] = stamp
                });

                return true;
            });
        }

        /// <summary>Puts a job back in the queue (retry after an error or a shutdown).</summary>
        public async Task RequeueAsync(string jobId, string errorCode, TimeSpan delay)
        {
            var docRef = Jobs.Document(jobId);

            await _firestore.RunTransactionAsync(async tx =>
            {
                var snap = await tx.GetSnapshotAsync(docRef);

                if (!snap.Exists || !JobStatus.IsActive(snap.GetValue<string>("status")))
                    return;

                tx.Update(docRef, new Dictionary<string, object>
                {
                    ["status"] = JobStatus.Queued,
                    ["error"] = errorCode,
                    ["lockedBy"] = FieldValue.Delete,
                    ["runAfter"] = Timestamp.FromDateTime(DateTime.UtcNow.Add(delay)),
                    ["updatedAt"] = Timestamp.GetCurrentTimestamp()
                });
            });
        }

        /// <summary>Re-queues (or fails) jobs whose worker stopped sending heartbeats.</summary>
        public async Task<int> RecoverStaleAsync()
        {
            var active = await Jobs
                .WhereIn("status", JobStatus.Active)
                .Limit(100)
                .GetSnapshotAsync();

            var recovered = 0;
            var threshold = DateTime.UtcNow - StaleAfter;

            foreach (var doc in active.Documents)
            {
                var data = doc.ToDictionary();
                var heartbeat = FirestoreApi.GetDate(data, "heartbeatAt")
                                ?? FirestoreApi.GetDate(data, "startedAt")
                                ?? DateTime.MinValue;

                if (heartbeat > threshold)
                    continue;

                var attempts = FirestoreApi.GetLong(data, "attempts");

                if (attempts < MaxAttempts)
                {
                    await RequeueAsync(doc.Id, "worker_interrupted", TimeSpan.Zero);
                }
                else
                {
                    await FinishAsync(doc.Id, JobOutcome.Failed(
                        "worker_interrupted",
                        "Der Auftrag wurde unterbrochen und konnte nicht abgeschlossen werden.",
                        "The job was interrupted and could not be completed."));
                }

                recovered++;
            }

            return recovered;
        }
    }
}
