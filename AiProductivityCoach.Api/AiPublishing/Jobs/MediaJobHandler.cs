using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Media;
using AiProductivityCoach.Api.AiPublishing.Security;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.AiPublishing.Jobs
{
    /// <summary>Creates one image for a draft in the background (job type media.generate).</summary>
    public sealed class MediaJobHandler : IAiJobHandler
    {
        private static readonly Dictionary<string, (string De, string En)> FailureLabels = new()
        {
            ["image_not_configured"] = ("Bild-KI nicht konfiguriert", "image AI is not configured"),
            ["image_blocked"] = ("Bildanfrage von der Sicherheitsprüfung abgelehnt", "image request declined by the safety check"),
            ["image_unavailable"] = ("Bild-KI nicht erreichbar", "the image AI was not reachable"),
            ["storage_not_configured"] = ("Medienspeicher nicht konfiguriert", "media storage is not configured"),
            ["storage_failed"] = ("Bild konnte nicht gespeichert werden", "the image could not be stored"),
            ["too_many_images"] = ("Maximale Bildanzahl erreicht", "maximum number of images reached"),
            ["content_not_found"] = ("Entwurf nicht gefunden", "draft not found"),
        };

        private readonly MediaGenerationService _media;
        private readonly AiAuditService _audit;
        private readonly ILogger<MediaJobHandler> _logger;

        public MediaJobHandler(MediaGenerationService media, AiAuditService audit, ILogger<MediaJobHandler> logger)
        {
            _media = media;
            _audit = audit;
            _logger = logger;
        }

        public string Type => JobTypes.GenerateMedia;
        public string ActiveStatus => JobStatus.GeneratingMedia;

        public static List<Dictionary<string, object>> InitialSteps() => new()
        {
            new() { ["key"] = "plan", ["labelDe"] = "Bild planen", ["labelEn"] = "Planning the image", ["status"] = "pending" },
            new() { ["key"] = "image", ["labelDe"] = "Bild erstellen", ["labelEn"] = "Creating the image", ["status"] = "pending" },
            new() { ["key"] = "store", ["labelDe"] = "Bild speichern", ["labelEn"] = "Saving the image", ["status"] = "pending" },
        };

        public async Task<JobOutcome> RunAsync(JobContext context, CancellationToken cancellationToken)
        {
            var actor = TenantContext.SystemActor(context.Platform);
            var contentId = context.Payload.TryGetValue("contentId", out var c) ? c?.ToString() ?? string.Empty : string.Empty;
            var instruction = context.Payload.TryGetValue("instruction", out var i) ? i?.ToString() : null;

            if (string.IsNullOrWhiteSpace(contentId))
                return JobOutcome.Failed("content_not_found", "Der Entwurf wurde nicht gefunden.", "The draft was not found.");

            using var scope = new JobCancellationScope(context, cancellationToken);

            await _audit.LogAsync(actor, AuditActions.MediaGenerationStarted, context.ProviderId, contentId, null,
                new Dictionary<string, object> { ["jobId"] = context.JobId });

            var order = new[] { "plan", "image", "store" };
            var done = new HashSet<string>();

            try
            {
                var result = await _media.GenerateAsync(contentId, instruction, context.CreatedBy, context.JobId,
                    async key =>
                    {
                        foreach (var previous in order.TakeWhile(k => k != key).Where(done.Add))
                            await context.ReportAsync(0, previous, "done");

                        await context.ReportAsync(Array.IndexOf(order, key) * 30 + 5, key, "running");
                    }, scope.Token);

                await context.ReportAsync(100, "store", "done");

                await _audit.LogAsync(actor, AuditActions.MediaGenerated, context.ProviderId, contentId, null,
                    new Dictionary<string, object> { ["mediaId"] = result.MediaId });

                return JobOutcome.Completed(new Dictionary<string, object> { ["mediaId"] = result.MediaId, ["contentId"] = contentId },
                    "Bild für den Entwurf erstellt.", "Image created for the draft.");
            }
            catch (OperationCanceledException) when (scope.Cancelled && !cancellationToken.IsCancellationRequested)
            {
                return JobOutcome.Failed("cancelled", "Abgebrochen.", "Cancelled.");
            }
            catch (ImageGenerationException ex)
            {
                _logger.LogWarning("[Media] {Code}: {Message}", ex.Code, ex.Message);
                await _audit.LogAsync(actor, AuditActions.MediaGenerationFailed, context.ProviderId, contentId, null,
                    new Dictionary<string, object> { ["reason"] = ex.Code });

                var label = FailureLabels.TryGetValue(ex.Code, out var l) ? l : (De: ex.Code, En: ex.Code);
                return JobOutcome.Failed(ex.Code, $"Bild fehlgeschlagen ({label.De}: {ex.Message}).", $"Image failed ({label.En}: {ex.Message}).");
            }
        }
    }
}
