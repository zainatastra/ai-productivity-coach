using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AiProductivityCoach.Api.AiPublishing.Ai;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Import;
using AiProductivityCoach.Api.AiPublishing.Jobs;
using AiProductivityCoach.Api.AiPublishing.Knowledge;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.Controllers
{
    /// <summary>
    /// Bulk creation of providers from a CSV. The browser first asks for a preview (nothing is created), then
    /// sends the rows in small batches, so no single request has to run long; one bad row never stops the rest.
    /// </summary>
    [ApiController]
    [Route("api/ai/providers/import")]
    [Authorize(Policy = "AdminOnly")]
    public class AiImportController : AiControllerBase
    {
        public const int MaxBatch = 10;

        private readonly ProviderCreationService _creation;
        private readonly AiJobService _jobs;
        private readonly AiAuditService _audit;
        private readonly OpenAiClient _openAi;

        public AiImportController(ProviderCreationService creation, AiJobService jobs, AiAuditService audit, OpenAiClient openAi)
        {
            _creation = creation;
            _jobs = jobs;
            _audit = audit;
            _openAi = openAi;
        }

        public class PreviewDto
        {
            public string? Csv { get; set; }
        }

        public class BatchRowDto
        {
            public int Line { get; set; }
            public string? Name { get; set; }
            public string? Website { get; set; }
        }

        public class BatchDto
        {
            public List<BatchRowDto>? Rows { get; set; }
            public bool StartResearch { get; set; }
        }

        /// <summary>Reads and checks the file against the rules and the existing providers. Creates nothing.</summary>
        [HttpPost("preview")]
        public async Task<IActionResult> Preview([FromBody] PreviewDto? request)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var parsed = ProviderCsv.Parse(request?.Csv);
            if (!parsed.Ok) return Error(400, parsed.Error!, "The CSV could not be read.");

            var existing = await _creation.ExistingHostsAsync();

            var rows = ProviderCsv.Check(parsed.Rows)
                .Select(check => check.Status == "ok" && existing.Contains(check.Host)
                    ? check with { Status = "exists", Error = "provider_website_exists" }
                    : check)
                .ToList();

            return Ok(new
            {
                rows,
                ignoredColumns = parsed.IgnoredColumns,
                encodingIssue = parsed.EncodingIssue,
                counts = new
                {
                    total = rows.Count,
                    ok = rows.Count(r => r.Status == "ok"),
                    invalid = rows.Count(r => r.Status == "invalid"),
                    duplicates = rows.Count(r => r.Status is "duplicate_in_file" or "exists")
                },
                maxBatch = MaxBatch,
                aiConfigured = _openAi.IsConfigured
            });
        }

        /// <summary>Creates up to ten providers. Each row is checked again here; the browser's preview is never trusted.</summary>
        [HttpPost("batch")]
        public async Task<IActionResult> Batch([FromBody] BatchDto? request)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var rows = request?.Rows ?? new List<BatchRowDto>();
            if (rows.Count == 0) return Error(400, "no_rows", "There is nothing to import.");
            if (rows.Count > MaxBatch) return Error(400, "batch_too_large", $"At most {MaxBatch} rows per request.");

            // Research costs AI usage, so it only starts when the admin asked for it and the AI is configured.
            var research = request!.StartResearch && _openAi.IsConfigured;
            var results = new List<object>();

            foreach (var row in rows)
            {
                try
                {
                    var result = await _creation.CreateAsync(actor, row.Name, row.Website);

                    if (!result.Ok)
                    {
                        results.Add(new { line = row.Line, ok = false, error = result.Code });
                        continue;
                    }

                    var queued = false;
                    if (research)
                    {
                        var (jobId, _) = await _jobs.CreateAsync(
                            JobTypes.Research, result.ProviderId!, actor.Platform, actor.UserId, null, ResearchJobHandler.InitialSteps());

                        await _audit.LogAsync(actor, AuditActions.JobCreated, result.ProviderId!, null, null,
                            new Dictionary<string, object> { ["jobId"] = jobId, ["type"] = JobTypes.Research, ["source"] = "csv_import" });
                        queued = true;
                    }

                    results.Add(new { line = row.Line, ok = true, providerId = result.ProviderId, researchQueued = queued });
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    // One failing row must not take the others down with it.
                    results.Add(new { line = row.Line, ok = false, error = "import_failed" });
                }
            }

            return Ok(new { results });
        }
    }
}
