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

        public Task SetStatusAsync(string status) => _jobs.SetStatusAsync(JobId, status);

        public async Task ReportAsync(int progress, string? stepKey = null, string? stepStatus = null, string? detail = null)
        {
            if (stepKey != null)
            {
                var step = Steps.FirstOrDefault(s => s["key"]?.ToString() == stepKey);
                if (step != null)
                {
                    if (stepStatus != null) step["status"] = stepStatus;
                    if (detail != null) step["detail"] = detail;
                }
            }

            await _jobs.ReportProgressAsync(JobId, progress, Steps);
        }

        public Task<bool> IsCancelledAsync() => _jobs.IsCancelledAsync(JobId);
    }
}
