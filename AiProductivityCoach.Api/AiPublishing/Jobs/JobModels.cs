using AiProductivityCoach.Api.AiPublishing.Domain;

namespace AiProductivityCoach.Api.AiPublishing.Jobs
{
    public sealed record JobOutcome(
        string Status,
        string? ErrorCode,
        Dictionary<string, object>? Result,
        string MessageDe,
        string MessageEn)
    {
        public static JobOutcome Completed(Dictionary<string, object>? result, string de, string en) =>
            new(JobStatus.Completed, null, result, de, en);

        public static JobOutcome Partial(Dictionary<string, object>? result, string errorCode, string de, string en) =>
            new(JobStatus.PartiallyCompleted, errorCode, result, de, en);

        public static JobOutcome Failed(string errorCode, string de, string en) =>
            new(JobStatus.Failed, errorCode, null, de, en);
    }

    public interface IAiJobHandler
    {
        /// <summary>Job type this handler executes (see <see cref="JobTypes"/>).</summary>
        string Type { get; }

        /// <summary>Status the job reports while this handler runs.</summary>
        string ActiveStatus { get; }

        Task<JobOutcome> RunAsync(JobContext context, CancellationToken cancellationToken);
    }

    /// <summary>Progress/cancellation surface handed to a running job handler.</summary>
    public sealed class JobContext
    {
        private readonly AiJobService _jobs;
        private int _lastProgress;
        private int _dirty;
        private int _writing;

        public JobContext(
            AiJobService jobs,
            string jobId,
            string providerId,
            string platform,
            string createdBy,
            Dictionary<string, object> payload,
            List<Dictionary<string, object>> steps)
        {
            _jobs = jobs;
            JobId = jobId;
            ProviderId = providerId;
            Platform = platform;
            CreatedBy = createdBy;
            Payload = payload;
            Steps = steps;
        }

        public string JobId { get; }
        public string ProviderId { get; }
        public string Platform { get; }
        public string CreatedBy { get; }
        public Dictionary<string, object> Payload { get; }
        public List<Dictionary<string, object>> Steps { get; }

        public async Task SetStatusAsync(string status)
        {
            // The status label is informational; a transient write conflict must not fail the job.
            for (var attempt = 0; attempt < 2; attempt++)
            {
                try
                {
                    await _jobs.SetStatusAsync(JobId, status);
                    return;
                }
                catch (Exception) when (attempt == 0)
                {
                    await Task.Delay(500);
                }
                catch (Exception)
                {
                    return;
                }
            }
        }

        /// <summary>
        /// Reports progress. Many tasks may call this at once, so writes are coalesced: only one
        /// write is in flight and it always carries the latest state. A failed progress write is
        /// ignored - progress is a UI hint and must never be able to fail the job itself.
        /// </summary>
        public async Task ReportAsync(int progress, string? stepKey = null, string? stepStatus = null, string? detail = null)
        {
            if (stepKey != null)
            {
                lock (Steps)
                {
                    var step = Steps.FirstOrDefault(s => s["key"]?.ToString() == stepKey);
                    if (step != null)
                    {
                        if (stepStatus != null) step["status"] = stepStatus;
                        if (detail != null) step["detail"] = detail;
                    }
                }
            }

            // Progress never moves backwards (e.g. when the number of planned pages grows).
            int previous, next;
            do
            {
                previous = _lastProgress;
                next = Math.Max(previous, Math.Clamp(progress, 0, 100));
            }
            while (Interlocked.CompareExchange(ref _lastProgress, next, previous) != previous);

            Volatile.Write(ref _dirty, 1);

            while (true)
            {
                if (Interlocked.CompareExchange(ref _writing, 1, 0) != 0)
                    return; // another caller is writing and will pick up this update

                try
                {
                    while (Volatile.Read(ref _dirty) == 1)
                    {
                        Volatile.Write(ref _dirty, 0);

                        List<Dictionary<string, object>> snapshot;
                        lock (Steps)
                            snapshot = Steps.Select(step => new Dictionary<string, object>(step)).ToList();

                        try
                        {
                            await _jobs.ReportProgressAsync(JobId, _lastProgress, snapshot);
                        }
                        catch (Exception)
                        {
                            // Contention or a transient error: the next report carries the state again.
                        }
                    }
                }
                finally
                {
                    Volatile.Write(ref _writing, 0);
                }

                if (Volatile.Read(ref _dirty) == 0)
                    return;
            }
        }

        public Task<bool> IsCancelledAsync() => _jobs.IsCancelledAsync(JobId);
    }
}
