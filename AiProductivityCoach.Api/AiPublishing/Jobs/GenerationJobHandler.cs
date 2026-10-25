using AiProductivityCoach.Api.AiPublishing.Content;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Security;
using AiProductivityCoach.Api.AiPublishing.Services;
using Google.Cloud.Firestore;

namespace AiProductivityCoach.Api.AiPublishing.Jobs
{
    /// <summary>
    /// Writes the approved content package in the background (spec sections 12 and 18).
    /// Each document is independent: one failure never discards the others, and the job then
    /// ends as "partially completed" (spec section 42). Nothing is published - everything is a draft.
    /// </summary>
    public sealed class GenerationJobHandler : IAiJobHandler
    {
        private static readonly Dictionary<string, (string De, string En)> TypeLabels = new()
        {
            [ContentTypes.Article] = ("Artikel", "article"),
            [ContentTypes.Whitepaper] = ("Whitepaper", "whitepaper"),
            [ContentTypes.Webinar] = ("Webinar", "webinar"),
        };

        private static readonly Dictionary<string, (string De, string En)> FailureLabels = new()
        {
            ["no_knowledge"] = ("zu wenig Wissen in den Quellen", "not enough knowledge in the sources"),
            ["knowledge_blocked"] = ("Wissensbasis reicht noch nicht aus", "knowledge base is not sufficient yet"),
            ["ai_refused"] = ("KI hat die Anfrage abgelehnt", "the AI declined the request"),
            ["ai_truncated"] = ("KI-Antwort war zu lang", "the AI answer was too long"),
            ["ai_invalid_output"] = ("KI-Ausgabe unbrauchbar", "the AI output was unusable"),
            ["ai_unavailable"] = ("KI-Dienst nicht erreichbar", "the AI service was not reachable"),
            ["ai_not_configured"] = ("KI nicht konfiguriert", "the AI is not configured"),
            ["unexpected_error"] = ("unerwarteter Fehler", "unexpected error"),
        };

        private readonly FirestoreDb _firestore;
        private readonly ContentPlanService _plans;
        private readonly ContentGenerationService _generator;
        private readonly AiAuditService _audit;
        private readonly ILogger<GenerationJobHandler> _logger;

        public GenerationJobHandler(
            FirestoreDb firestore,
            ContentPlanService plans,
            ContentGenerationService generator,
            AiAuditService audit,
            ILogger<GenerationJobHandler> logger)
        {
            _firestore = firestore;
            _plans = plans;
            _generator = generator;
            _audit = audit;
            _logger = logger;
        }

        public string Type => JobTypes.Generate;
        public string ActiveStatus => JobStatus.Generating;

        public static List<Dictionary<string, object>> InitialSteps(IEnumerable<string> types) =>
            types.Where(TypeLabels.ContainsKey).Select(type => new Dictionary<string, object>
            {
                ["key"] = type,
                ["labelDe"] = $"{TypeLabels[type].De} erstellen",
                ["labelEn"] = $"Writing {TypeLabels[type].En}",
                ["status"] = "pending"
            }).ToList();

        public async Task<JobOutcome> RunAsync(JobContext context, CancellationToken cancellationToken)
        {
            var actor = TenantContext.SystemActor(context.Platform);
            var provider = await ContentContext.LoadAsync(_firestore, context.ProviderId, cancellationToken);

            if (provider == null)
                return JobOutcome.Failed("provider_not_found", "Der Anbieter wurde nicht gefunden.", "The provider was not found.");

            var plan = await _plans.GetAsync(context.ProviderId, cancellationToken);

            if (plan == null || plan.Status != PlanStatus.Approved)
                return JobOutcome.Failed("plan_not_approved", "Der Inhaltsplan ist nicht freigegeben.", "The content plan is not approved.");

            var requested = context.Payload.TryGetValue("types", out var rawTypes) && rawTypes is IEnumerable<object> list
                ? list.Select(t => t?.ToString() ?? string.Empty).ToHashSet()
                : ContentTypes.Generatable.ToHashSet();

            var regenerate = context.Payload.TryGetValue("regenerate", out var rawRegen) && rawRegen is true;

            await _audit.LogAsync(actor, AuditActions.ContentGenerationStarted, context.ProviderId, null, null,
                new Dictionary<string, object> { ["jobId"] = context.JobId, ["types"] = requested.ToList() });

            using var scope = new JobCancellationScope(context, cancellationToken);
            var ct = scope.Token;

            var generated = new List<string>();
            var failed = new Dictionary<string, string>();
            var skipped = new List<string>();

            var targets = ContentTypes.Generatable.Where(requested.Contains).ToList();

            try
            {
                for (var index = 0; index < targets.Count; index++)
                {
                    ct.ThrowIfCancellationRequested();

                    var type = targets[index];
                    var item = plan.Items.First(i => i.Type == type);
                    var progress = 4 + (int)(92.0 * index / targets.Count);

                    await context.ReportAsync(progress, type, "running");

                    if (item.Status != PlanItemStatus.Proposed)
                    {
                        skipped.Add(type);
                        await context.ReportAsync(progress, type, "done", "übersprungen");
                        continue;
                    }

                    if (item.ContentId != null && !regenerate)
                    {
                        skipped.Add(type);
                        await context.ReportAsync(progress, type, "done", "bereits vorhanden");
                        continue;
                    }

                    if (provider.Gates.TryGetValue(type, out var gate) && gate.State == "blocked")
                    {
                        failed[type] = "knowledge_blocked";
                        await _audit.LogAsync(actor, AuditActions.ContentGenerationFailed, context.ProviderId, null, null,
                            new Dictionary<string, object> { ["type"] = type, ["reason"] = "knowledge_blocked" });
                        await context.ReportAsync(progress, type, "failed", FailureText("knowledge_blocked"));
                        continue;
                    }

                    try
                    {
                        var result = await _generator.GenerateAsync(
                            provider, item, item.ContentId, null, context.CreatedBy, context.JobId, ct);

                        await _plans.SetItemContentAsync(context.ProviderId, type, result.ContentId);
                        generated.Add(type);

                        await _audit.LogAsync(actor, AuditActions.ContentGenerated, context.ProviderId, result.ContentId, null,
                            new Dictionary<string, object>
                            {
                                ["type"] = type, ["version"] = result.Version, ["quality"] = result.QualityState, ["words"] = result.Words
                            });

                        await context.ReportAsync(progress, type, "done", $"{result.Words} Wörter");
                    }
                    catch (ContentGenerationException ex)
                    {
                        failed[type] = ex.Message == ex.Code ? ex.Code : $"{ex.Code}|{ex.Message}";
                        _logger.LogWarning("[Generate] {Type} failed for {ProviderId}: {Code} {Message}", type, context.ProviderId, ex.Code, ex.Message);

                        await _audit.LogAsync(actor, AuditActions.ContentGenerationFailed, context.ProviderId, null, null,
                            new Dictionary<string, object> { ["type"] = type, ["reason"] = ex.Code });
                        await context.ReportAsync(progress, type, "failed", FailureText(ex.Code));
                    }
                    catch (Exception ex) when (ex is not OperationCanceledException)
                    {
                        failed[type] = $"unexpected_error|{ex.GetType().Name}: {(ex.Message.Length <= 300 ? ex.Message : ex.Message[..300])}";
                        _logger.LogError(ex, "[Generate] {Type} crashed for {ProviderId}.", type, context.ProviderId);
                        await context.ReportAsync(progress, type, "failed", FailureText("unexpected_error"));
                    }
                }
            }
            catch (OperationCanceledException) when (scope.Cancelled && !cancellationToken.IsCancellationRequested)
            {
                return JobOutcome.Failed("cancelled", "Abgebrochen.", "Cancelled.");
            }

            var result_ = new Dictionary<string, object>
            {
                ["generated"] = generated,
                ["skipped"] = skipped,
                ["failed"] = failed.ToDictionary(pair => pair.Key, pair => (object)pair.Value)
            };

            var (de, en) = Summary(provider.Name, generated, skipped, failed);

            if (failed.Count == 0)
                return JobOutcome.Completed(result_, de, en);

            if (generated.Count == 0)
                return JobOutcome.Failed(failed.Values.First().Split('|')[0], de, en);

            return JobOutcome.Partial(result_, "some_documents_failed", de, en);
        }

        private static string FailureText(string code) =>
            FailureLabels.TryGetValue(code, out var label) ? label.De : code;

        private static (string De, string En) Summary(
            string name,
            List<string> generated,
            List<string> skipped,
            Dictionary<string, string> failed)
        {
            var de = new List<string>();
            var en = new List<string>();

            foreach (var type in generated) { de.Add($"{TypeLabels[type].De} erstellt"); en.Add($"{TypeLabels[type].En} created"); }
            foreach (var type in skipped) { de.Add($"{TypeLabels[type].De} übersprungen"); en.Add($"{TypeLabels[type].En} skipped"); }

            foreach (var (type, entry) in failed)
            {
                var parts = entry.Split('|', 2);
                var code = parts[0];
                var detail = parts.Length > 1 ? $": {parts[1]}" : string.Empty;
                var label = FailureLabels.TryGetValue(code, out var l) ? l : (De: code, En: code);
                de.Add($"{TypeLabels[type].De} fehlgeschlagen ({label.De}{detail})");
                en.Add($"{TypeLabels[type].En} failed ({label.En}{detail})");
            }

            return ($"Inhalte für „{name}“: {string.Join(", ", de)}.", $"Content for \"{name}\": {string.Join(", ", en)}.");
        }
    }
}
