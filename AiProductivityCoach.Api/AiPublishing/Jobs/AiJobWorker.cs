using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Security;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.AiPublishing.Jobs
{
    /// <summary>
    /// Background worker that executes queued AI jobs outside the HTTP request.
    /// Runs inside the API process; all state lives in Firestore so a restart
    /// never loses a job (stale jobs are re-queued after a missed heartbeat).
    /// </summary>
    public sealed class AiJobWorker : BackgroundService
    {
        private const int MaxConcurrentJobs = 2;
        private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(3);
        private static readonly TimeSpan RecoveryInterval = TimeSpan.FromSeconds(60);
        private static readonly TimeSpan HeartbeatInterval = TimeSpan.FromSeconds(20);

        private readonly AiJobService _jobs;
        private readonly AiAuditService _audit;
        private readonly AiNotificationService _notifications;
        private readonly Dictionary<string, IAiJobHandler> _handlers;
        private readonly ILogger<AiJobWorker> _logger;
        private readonly string _instanceId = $"{Environment.MachineName}-{Guid.NewGuid():N}"[..24];
        private readonly List<Task> _running = new();

        public AiJobWorker(
            AiJobService jobs,
            AiAuditService audit,
            AiNotificationService notifications,
            IEnumerable<IAiJobHandler> handlers,
            ILogger<AiJobWorker> logger)
        {
            _jobs = jobs;
            _audit = audit;
            _notifications = notifications;
            _handlers = handlers.ToDictionary(handler => handler.Type);
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("[AiJobWorker] Started ({Instance}) with handlers: {Handlers}",
                _instanceId, string.Join(", ", _handlers.Keys));

            var lastRecovery = DateTime.MinValue;

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    if (DateTime.UtcNow - lastRecovery > RecoveryInterval)
                    {
                        lastRecovery = DateTime.UtcNow;
                        var recovered = await _jobs.RecoverStaleAsync();
                        if (recovered > 0)
                            _logger.LogWarning("[AiJobWorker] Recovered {Count} stale job(s).", recovered);
                    }

                    lock (_running)
                        _running.RemoveAll(task => task.IsCompleted);

                    while (CountRunning() < MaxConcurrentJobs)
                    {
                        var job = await _jobs.TryClaimNextAsync(
                            _instanceId,
                            type => _handlers.TryGetValue(type, out var handler) ? handler.ActiveStatus : null);

                        if (job == null) break;

                        var task = Task.Run(() => RunJobAsync(job, stoppingToken), CancellationToken.None);

                        lock (_running)
                            _running.Add(task);
                    }
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "[AiJobWorker] Poll loop error.");
                }

                try
                {
                    await Task.Delay(PollInterval, stoppingToken);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
            }

            Task[] pending;
            lock (_running) pending = _running.ToArray();
            await Task.WhenAll(pending);
        }

        private int CountRunning()
        {
            lock (_running)
                return _running.Count(task => !task.IsCompleted);
        }

        private async Task RunJobAsync(Google.Cloud.Firestore.DocumentSnapshot job, CancellationToken stoppingToken)
        {
            var data = job.ToDictionary();
            var type = FirestoreApi.GetString(data, "type");
            var providerId = FirestoreApi.GetString(data, "providerId");
            var platform = FirestoreApi.GetString(data, "platform", Platforms.EyEric);
            var attempts = FirestoreApi.GetLong(data, "attempts");
            var handler = _handlers[type];

            var payload = data.TryGetValue("payload", out var rawPayload) && rawPayload is Dictionary<string, object> map
                ? map
                : new Dictionary<string, object>();

            var steps = data.TryGetValue("steps", out var rawSteps) && rawSteps is IEnumerable<object> list
                ? list.OfType<Dictionary<string, object>>().ToList()
                : new List<Dictionary<string, object>>();

            var context = new JobContext(
                _jobs, job.Id, providerId, platform,
                FirestoreApi.GetString(data, "createdBy"), payload, steps);

            using var heartbeatCts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
            var heartbeat = HeartbeatLoopAsync(job.Id, heartbeatCts.Token);

            JobOutcome outcome;

            try
            {
                outcome = await handler.RunAsync(context, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                // Server is shutting down: hand the job back so another start can resume it.
                heartbeatCts.Cancel();
                await _jobs.RequeueAsync(job.Id, "server_restart", TimeSpan.Zero);
                return;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[AiJobWorker] Job {JobId} ({Type}) threw.", job.Id, type);

                heartbeatCts.Cancel();

                if (attempts < AiJobService.MaxAttempts)
                {
                    // Retry with growing back-off; the error code stays visible to admins.
                    await _jobs.RequeueAsync(job.Id, "unexpected_error", TimeSpan.FromSeconds(15 * attempts));
                    return;
                }

                outcome = JobOutcome.Failed(
                    "unexpected_error",
                    "Der Auftrag ist wegen eines unerwarteten Fehlers fehlgeschlagen.",
                    "The job failed because of an unexpected error.");
            }

            heartbeatCts.Cancel();
            try { await heartbeat; } catch { /* heartbeat loop ends on cancel */ }

            var written = await _jobs.FinishAsync(job.Id, outcome);

            if (!written)
                return; // cancelled meanwhile - no notification

            var severity = outcome.Status switch
            {
                JobStatus.Completed => "success",
                JobStatus.PartiallyCompleted => "warning",
                _ => "error"
            };

            try
            {
                await _notifications.NotifyAdminsAsync(
                    platform, providerId, job.Id, type, severity, outcome.MessageDe, outcome.MessageEn);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[AiJobWorker] Notification write failed for job {JobId}.", job.Id);
            }
        }

        private async Task HeartbeatLoopAsync(string jobId, CancellationToken token)
        {
            try
            {
                using var timer = new PeriodicTimer(HeartbeatInterval);

                while (await timer.WaitForNextTickAsync(token))
                {
                    try { await _jobs.HeartbeatAsync(jobId); }
                    catch (Exception ex) { _logger.LogWarning(ex, "[AiJobWorker] Heartbeat failed for {JobId}.", jobId); }
                }
            }
            catch (OperationCanceledException)
            {
                // normal shutdown of the heartbeat
            }
        }
    }
}
