using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Jobs;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.Controllers
{
    [ApiController]
    [Route("api/ai/jobs")]
    [Authorize(Policy = "AdminOnly")]
    public class AiJobsController : AiControllerBase
    {
        private readonly AiJobService _jobs;
        private readonly AiAuditService _audit;

        public AiJobsController(AiJobService jobs, AiAuditService audit)
        {
            _jobs = jobs;
            _audit = audit;
        }

        [HttpGet("{jobId}")]
        public async Task<IActionResult> GetJob(string jobId)
        {
            var job = await _jobs.GetAsync(jobId);
            if (job == null) return Error(404, "job_not_found", "Job not found.");

            return Ok(FirestoreApi.ToApi(job, "lockedBy", "payload"));
        }

        [HttpPost("{jobId}/cancel")]
        public async Task<IActionResult> Cancel(string jobId)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var job = await _jobs.GetAsync(jobId);
            if (job == null) return Error(404, "job_not_found", "Job not found.");

            if (!await _jobs.CancelAsync(jobId))
                return Error(409, "job_not_cancellable", "Only queued or running jobs can be cancelled.");

            await _audit.LogAsync(actor, AuditActions.JobCancelled,
                FirestoreApi.GetString(job.ToDictionary(), "providerId"), null, null,
                new Dictionary<string, object> { ["jobId"] = jobId });

            return Ok(FirestoreApi.ToApi((await _jobs.GetAsync(jobId))!, "lockedBy", "payload"));
        }

        [HttpPost("{jobId}/retry")]
        public async Task<IActionResult> Retry(string jobId)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var job = await _jobs.GetAsync(jobId);
            if (job == null) return Error(404, "job_not_found", "Job not found.");

            if (!await _jobs.RetryAsync(jobId))
                return Error(409, "job_not_retryable", "Only failed, partially completed or cancelled jobs can be retried.");

            await _audit.LogAsync(actor, AuditActions.JobRetried,
                FirestoreApi.GetString(job.ToDictionary(), "providerId"), null, null,
                new Dictionary<string, object> { ["jobId"] = jobId });

            return Ok(FirestoreApi.ToApi((await _jobs.GetAsync(jobId))!, "lockedBy", "payload"));
        }
    }
}
