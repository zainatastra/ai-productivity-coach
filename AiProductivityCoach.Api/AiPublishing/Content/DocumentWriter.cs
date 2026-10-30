using AiProductivityCoach.Api.AiPublishing.Ai;

namespace AiProductivityCoach.Api.AiPublishing.Content
{
    public sealed record WrittenDocument(GeneratedDocument Doc, string Model, string LlmProvider, bool Expanded);

    /// <summary>
    /// One document from one prompt: call the model, parse the JSON, repair broken JSON once, and
    /// expand a draft that came back far too short once. Every model call is recorded with its token use.
    /// </summary>
    public sealed class DocumentWriter
    {
        /// <summary>A draft below this share of the minimum length is expanded automatically.</summary>
        public const double ExpandBelow = 0.75;

        private readonly ILlmClient _llm;
        private readonly IAiRunRecorder _runs;
        private readonly ILogger<DocumentWriter> _logger;

        public DocumentWriter(ILlmClient llm, IAiRunRecorder runs, ILogger<DocumentWriter> logger)
        {
            _llm = llm;
            _runs = runs;
            _logger = logger;
        }

        public async Task<WrittenDocument> WriteAsync(
            string providerId,
            string type,
            string userPrompt,
            int maxTokens,
            int sourceCount,
            string? jobId,
            CancellationToken ct,
            bool allowExpansion = true,
            string? operationName = null)
        {
            var operation = operationName ?? $"generate_{type}";
            var result = await CallAsync(providerId, jobId, operation, LlmTier.Writing, ContentPrompts.WriterSystem, userPrompt, maxTokens, ct);

            var outcome = DocumentParser.Parse(result.Text, type, sourceCount);

            // One cheap repair attempt for broken JSON; content problems (empty body ...) are not repaired.
            if (outcome.Document == null && outcome.ErrorCode == "invalid_json" && result.Text.Length < 80_000)
            {
                try
                {
                    var repair = await CallAsync(providerId, jobId, "repair_json", LlmTier.Light, ContentPrompts.RepairSystem,
                        ContentPrompts.BuildRepairUser(result.Text, "ungültige Syntax"), maxTokens, ct);

                    outcome = DocumentParser.Parse(repair.Text, type, sourceCount);
                }
                catch (ContentGenerationException)
                {
                    // fall through to the invalid-output error below
                }
            }

            if (outcome.Document == null)
                throw new ContentGenerationException("ai_invalid_output", outcome.ErrorCode);

            var doc = outcome.Document;
            var expanded = false;

            // A draft far below the target length gets exactly one expansion pass.
            var minimum = QualityChecker.MinimumWords(type);
            var words = HtmlRenderer.WordCount(HtmlRenderer.PlainText(doc.Blocks));

            if (allowExpansion && minimum > 0 && words < minimum * ExpandBelow && result.Text.Length < 60_000)
            {
                var bigger = await TryExpandAsync(providerId, jobId, type, userPrompt, result.Text, words, minimum, maxTokens, sourceCount, ct);

                if (bigger != null && HtmlRenderer.WordCount(HtmlRenderer.PlainText(bigger.Blocks)) > words)
                {
                    doc = bigger;
                    expanded = true;
                }
            }

            return new WrittenDocument(doc, result.Model, result.Provider, expanded);
        }

        private async Task<GeneratedDocument?> TryExpandAsync(
            string providerId, string? jobId, string type, string userPrompt, string draftJson,
            int words, int minimum, int maxTokens, int sourceCount, CancellationToken ct)
        {
            var target = (int)(minimum * 1.4);

            var user = userPrompt +
                $"\n\nERSTER ENTWURF (zu kurz: {words} Wörter):\n{draftJson}\n\n" +
                $"AUFGABE: Der Entwurf ist zu kurz. Überarbeite ihn zu einem vollständigen Text mit mindestens {target} Wörtern. " +
                "Vertiefe die vorhandenen Abschnitte und ergänze sinnvolle weitere Abschnitte - ausschließlich mit Fakten aus den Quellen " +
                "oder allgemeingültigem Branchenwissen ohne konkrete Zahlen. Wiederhole keine Inhalte. " +
                "Gib das vollständige JSON im selben Format zurück.";

            try
            {
                var result = await CallAsync(providerId, jobId, $"expand_{type}", LlmTier.Writing, ContentPrompts.WriterSystem, user, maxTokens, ct);
                return DocumentParser.Parse(result.Text, type, sourceCount).Document;
            }
            catch (ContentGenerationException ex)
            {
                // The expansion is a bonus: keep the first draft if it fails.
                _logger.LogWarning("[Content] Expansion of {Type} failed ({Code}); keeping the first draft.", type, ex.Code);
                return null;
            }
        }

        private async Task<LlmResult> CallAsync(
            string providerId, string? jobId, string operation, LlmTier tier,
            string system, string user, int maxTokens, CancellationToken ct)
        {
            var started = DateTime.UtcNow;
            var model = _llm.ModelFor(tier);

            try
            {
                var result = await _llm.CompleteAsync(new LlmRequest(operation, tier, system, user, maxTokens, ExpectJson: true), ct);

                await _runs.RecordAsync(providerId, jobId, operation, result.Model, "completed", started,
                    result.InputTokens, result.OutputTokens, 1, null, result.Provider, result.CacheReadTokens);

                return result;
            }
            catch (LlmRefusalException)
            {
                await _runs.RecordAsync(providerId, jobId, operation, model, "refused", started, 0, 0, 1, "refusal", _llm.Provider);
                throw new ContentGenerationException("ai_refused");
            }
            catch (LlmTruncatedException)
            {
                await _runs.RecordAsync(providerId, jobId, operation, model, "truncated", started, 0, 0, 1, "truncated", _llm.Provider);
                throw new ContentGenerationException("ai_truncated");
            }
            catch (Exception ex) when (ex is not OperationCanceledException && ex is not ContentGenerationException)
            {
                _logger.LogError(ex, "[Content] {Operation} failed for {ProviderId}.", operation, providerId);
                await _runs.RecordAsync(providerId, jobId, operation, model, "failed", started, 0, 0, 1, $"{ex.GetType().Name}: {Shorten(ex.Message)}", _llm.Provider);
                throw new ContentGenerationException("ai_unavailable", $"{_llm.Provider}: {ex.GetType().Name}: {Shorten(ex.Message)}");
            }
        }

        private static string Shorten(string text) => text.Length <= 300 ? text : text[..300];
    }
}
