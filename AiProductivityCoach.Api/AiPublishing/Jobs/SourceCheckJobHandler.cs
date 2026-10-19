using Google.Cloud.Firestore;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Security;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.AiPublishing.Jobs
{
    /// <summary>
    /// Checks that every source URL of a provider is reachable and contains readable
    /// text. Honest by design: unreachable or empty sources are reported as
    /// "unavailable" and never counted as analysed (spec section 8.1).
    /// This is the first step of the research pipeline; crawling/chunking follows later.
    /// </summary>
    public sealed class SourceCheckJobHandler : IAiJobHandler
    {
        private const int Parallelism = 3;

        private readonly FirestoreDb _firestore;
        private readonly SafeHttpFetcher _fetcher;
        private readonly AiAuditService _audit;

        public SourceCheckJobHandler(FirestoreDb firestore, SafeHttpFetcher fetcher, AiAuditService audit)
        {
            _firestore = firestore;
            _fetcher = fetcher;
            _audit = audit;
        }

        public string Type => JobTypes.SourceCheck;
        public string ActiveStatus => JobStatus.Researching;

        public static List<Dictionary<string, object>> InitialSteps() => new()
        {
            new Dictionary<string, object>
            {
                ["key"] = "check_sources",
                ["labelDe"] = "Quellen prüfen",
                ["labelEn"] = "Checking sources",
                ["status"] = "pending"
            }
        };

        public async Task<JobOutcome> RunAsync(JobContext context, CancellationToken cancellationToken)
        {
            var actor = TenantContext.SystemActor(context.Platform);
            var providerRef = _firestore.Collection(AiCollections.Providers).Document(context.ProviderId);
            var provider = await providerRef.GetSnapshotAsync(cancellationToken);

            if (!provider.Exists)
            {
                return JobOutcome.Failed(
                    "provider_not_found",
                    "Der Anbieter wurde nicht gefunden.",
                    "The provider was not found.");
            }

            var providerName = provider.GetValue<string>("name");

            var sourceSnapshot = await providerRef
                .Collection(AiCollections.Sources)
                .GetSnapshotAsync(cancellationToken);

            var selectedIds = context.Payload.TryGetValue("sourceIds", out var rawIds) &&
                              rawIds is IEnumerable<object> idList
                ? idList.Select(id => id.ToString()).ToHashSet()
                : null;

            var sources = sourceSnapshot.Documents
                .Where(doc => selectedIds == null || selectedIds.Contains(doc.Id))
                .ToList();

            if (sources.Count == 0)
            {
                return JobOutcome.Failed(
                    "no_sources",
                    $"Für „{providerName}“ sind keine Quellen vorhanden.",
                    $"No sources exist for \"{providerName}\".");
            }

            await _audit.LogAsync(actor, AuditActions.SourceCrawlStarted, context.ProviderId, null, null,
                new Dictionary<string, object> { ["jobId"] = context.JobId, ["sources"] = sources.Count });

            await context.ReportAsync(2, "check_sources", "running", $"0/{sources.Count}");

            foreach (var source in sources)
            {
                await source.Reference.UpdateAsync(new Dictionary<string, object>
                {
                    ["status"] = SourceStatus.Checking,
                    ["updatedAt"] = Timestamp.GetCurrentTimestamp()
                }, cancellationToken: cancellationToken);
            }

            var done = 0;
            var available = 0;
            var cancelled = false;
            var gate = new SemaphoreSlim(Parallelism);

            // Cancelling a job must interrupt fetches that are already running,
            // so a watcher polls the job state and cancels the shared token.
            using var cancelCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);

            var watcher = Task.Run(async () =>
            {
                try
                {
                    while (!cancelCts.IsCancellationRequested)
                    {
                        await Task.Delay(TimeSpan.FromSeconds(1.5), cancelCts.Token);

                        if (await context.IsCancelledAsync())
                        {
                            cancelled = true;
                            cancelCts.Cancel();
                        }
                    }
                }
                catch (OperationCanceledException)
                {
                    // watcher stops with the job
                }
            });

            var tasks = sources.Select(async source =>
            {
                try
                {
                    await gate.WaitAsync(cancelCts.Token);

                    try
                    {
                        var url = source.GetValue<string>("url");
                        var result = await _fetcher.FetchAsync(url, cancelCts.Token);

                        // Never write a result for a job that was cancelled meanwhile.
                        if (cancelled) return;

                        await source.Reference.UpdateAsync(new Dictionary<string, object>
                        {
                            ["status"] = result.Ok ? SourceStatus.Available : SourceStatus.Unavailable,
                            ["httpStatus"] = result.HttpStatus ?? 0,
                            ["errorCode"] = result.ErrorCode ?? string.Empty,
                            ["title"] = result.Title ?? string.Empty,
                            ["language"] = result.Language ?? string.Empty,
                            ["contentType"] = result.ContentType ?? string.Empty,
                            ["contentHash"] = result.Hash ?? string.Empty,
                            ["textLength"] = result.TextLength,
                            ["finalUrl"] = result.FinalUrl,
                            ["checkedAt"] = Timestamp.GetCurrentTimestamp(),
                            ["updatedAt"] = Timestamp.GetCurrentTimestamp()
                        }, cancellationToken: cancelCts.Token);

                        if (result.Ok) Interlocked.Increment(ref available);

                        var finished = Interlocked.Increment(ref done);
                        var progress = 5 + (int)(90.0 * finished / sources.Count);

                        await context.ReportAsync(progress, "check_sources", "running", $"{finished}/{sources.Count}");
                    }
                    finally
                    {
                        gate.Release();
                    }
                }
                catch (OperationCanceledException) when (cancelled && !cancellationToken.IsCancellationRequested)
                {
                    // job cancelled by the admin - handled below
                }
            }).ToList();

            await Task.WhenAll(tasks);

            cancelCts.Cancel();
            await watcher;

            if (cancelled)
            {
                // Put sources that were never reached back to "pending".
                foreach (var source in sources)
                {
                    var current = await source.Reference.GetSnapshotAsync(cancellationToken);
                    if (current.GetValue<string>("status") == SourceStatus.Checking)
                    {
                        await source.Reference.UpdateAsync("status", SourceStatus.Pending,
                            cancellationToken: cancellationToken);
                    }
                }

                await RefreshSummaryAsync(providerRef, cancellationToken);

                return JobOutcome.Failed("cancelled", "Abgebrochen.", "Cancelled.");
            }

            var unavailable = sources.Count - available;

            // Refresh the provider-level summary from ALL sources (not only the checked subset).
            var totalAvailable = await RefreshSummaryAsync(providerRef, cancellationToken);

            var result = new Dictionary<string, object>
            {
                ["checked"] = sources.Count,
                ["available"] = available,
                ["unavailable"] = unavailable
            };

            if (available == 0)
            {
                await _audit.LogAsync(actor, AuditActions.SourceCrawlFailed, context.ProviderId, null, null,
                    new Dictionary<string, object> { ["jobId"] = context.JobId, ["checked"] = sources.Count });

                return JobOutcome.Failed(
                    "all_sources_unavailable",
                    $"Alle {sources.Count} Quellen von „{providerName}“ sind nicht verfügbar. Bitte weitere Links hinzufügen.",
                    $"All {sources.Count} sources of \"{providerName}\" are unavailable. Please add more links.");
            }

            await _audit.LogAsync(actor, AuditActions.SourceCrawlCompleted, context.ProviderId, null, null,
                new Dictionary<string, object>
                {
                    ["jobId"] = context.JobId,
                    ["checked"] = sources.Count,
                    ["available"] = available,
                    ["unavailable"] = unavailable
                });

            if (unavailable > 0)
            {
                return JobOutcome.Partial(
                    result,
                    "some_sources_unavailable",
                    $"Quellenprüfung für „{providerName}“ abgeschlossen: {available} von {sources.Count} Quellen verfügbar, {unavailable} nicht verfügbar.",
                    $"Source check for \"{providerName}\" finished: {available} of {sources.Count} sources available, {unavailable} unavailable.");
            }

            return JobOutcome.Completed(
                result,
                $"Quellenprüfung für „{providerName}“ abgeschlossen: alle {sources.Count} Quellen sind verfügbar.",
                $"Source check for \"{providerName}\" finished: all {sources.Count} sources are available.");
        }

        private static async Task<int> RefreshSummaryAsync(DocumentReference providerRef, CancellationToken ct)
        {
            var allSources = await providerRef.Collection(AiCollections.Sources).GetSnapshotAsync(ct);

            int Count(string status) =>
                allSources.Documents.Count(doc => doc.GetValue<string>("status") == status);

            var available = Count(SourceStatus.Available);

            await providerRef.UpdateAsync(new Dictionary<string, object>
            {
                ["sourceSummary"] = new Dictionary<string, object>
                {
                    ["total"] = allSources.Count,
                    ["available"] = available,
                    ["unavailable"] = Count(SourceStatus.Unavailable)
                },
                ["lastSourceCheckAt"] = Timestamp.GetCurrentTimestamp(),
                ["updatedAt"] = Timestamp.GetCurrentTimestamp()
            }, cancellationToken: ct);

            return available;
        }
    }
}
