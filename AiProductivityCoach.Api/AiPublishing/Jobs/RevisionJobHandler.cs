using AiProductivityCoach.Api.AiPublishing.Content;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Security;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.AiPublishing.Jobs
{
    /// <summary>Rewrites one draft following an instruction of the admin (job type content.revise).</summary>
    public sealed class RevisionJobHandler : IAiJobHandler
    {
        private static readonly Dictionary<string, (string De, string En)> FailureLabels = new()
        {
            ["no_knowledge"] = ("zu wenig Wissen in den Quellen", "not enough knowledge in the sources"),
            ["ai_refused"] = ("KI hat die Anfrage abgelehnt", "the AI declined the request"),
            ["ai_truncated"] = ("KI-Antwort war zu lang", "the AI answer was too long"),
            ["ai_invalid_output"] = ("KI-Ausgabe unbrauchbar", "the AI output was unusable"),
            ["ai_unavailable"] = ("KI-Dienst nicht erreichbar", "the AI service was not reachable"),
            ["ai_not_configured"] = ("KI nicht konfiguriert", "the AI is not configured"),
            ["content_not_found"] = ("Entwurf nicht gefunden", "draft not found"),
            ["provider_not_found"] = ("Anbieter nicht gefunden", "provider not found"),
        };

        private readonly ContentRevisionService _revisions;
        private readonly AiAuditService _audit;
        private readonly ILogger<RevisionJobHandler> _logger;

        public RevisionJobHandler(ContentRevisionService revisions, AiAuditService audit, ILogger<RevisionJobHandler> logger)
        {
            _revisions = revisions;
            _audit = audit;
            _logger = logger;
        }

        public string Type => JobTypes.Revise;
        public string ActiveStatus => JobStatus.Generating;

        public static List<Dictionary<string, object>> InitialSteps() => new()
        {
            new() { ["key"] = "revise", ["labelDe"] = "Entwurf überarbeiten", ["labelEn"] = "Revising the draft", ["status"] = "pending" },
        };

        public async Task<JobOutcome> RunAsync(JobContext context, CancellationToken cancellationToken)
        {
            var actor = TenantContext.SystemActor(context.Platform);
            var contentId = context.Payload.TryGetValue("contentId", out var c) ? c?.ToString() ?? string.Empty : string.Empty;
            var instruction = context.Payload.TryGetValue("instruction", out var i) ? i?.ToString() ?? string.Empty : string.Empty;

            if (string.IsNullOrWhiteSpace(contentId) || string.IsNullOrWhiteSpace(instruction))
                return JobOutcome.Failed("content_not_found", "Der Entwurf oder die Anweisung fehlt.", "The draft or the instruction is missing.");

            using var scope = new JobCancellationScope(context, cancellationToken);

            await _audit.LogAsync(actor, AuditActions.ContentRevisionStarted, context.ProviderId, contentId, null,
                new Dictionary<string, object> { ["jobId"] = context.JobId });

            await context.ReportAsync(10, "revise", "running");

            try
            {
                var result = await _revisions.ReviseAsync(contentId, instruction, context.CreatedBy, context.JobId, scope.Token);

                await context.ReportAsync(100, "revise", "done", $"Version {result.Version} · {result.Words} Wörter");

                await _audit.LogAsync(actor, AuditActions.ContentRevised, context.ProviderId, contentId, null,
                    new Dictionary<string, object> { ["version"] = result.Version, ["quality"] = result.QualityState });

                return JobOutcome.Completed(
                    new Dictionary<string, object> { ["contentId"] = contentId, ["version"] = result.Version },
                    $"Entwurf überarbeitet (Version {result.Version}).", $"Draft revised (version {result.Version}).");
            }
            catch (OperationCanceledException) when (scope.Cancelled && !cancellationToken.IsCancellationRequested)
            {
                return JobOutcome.Failed("cancelled", "Abgebrochen.", "Cancelled.");
            }
            catch (ContentGenerationException ex)
            {
                _logger.LogWarning("[Revise] {Code}: {Message}", ex.Code, ex.Message);
                await _audit.LogAsync(actor, AuditActions.ContentRevisionFailed, context.ProviderId, contentId, null,
                    new Dictionary<string, object> { ["reason"] = ex.Code });
                await context.ReportAsync(100, "revise", "failed");

                var label = FailureLabels.TryGetValue(ex.Code, out var l) ? l : (De: ex.Code, En: ex.Code);
                var detail = ex.Message == ex.Code ? string.Empty : $": {ex.Message}";
                return JobOutcome.Failed(ex.Code, $"Überarbeitung fehlgeschlagen ({label.De}{detail}).", $"Revision failed ({label.En}{detail}).");
            }
        }
    }
}
