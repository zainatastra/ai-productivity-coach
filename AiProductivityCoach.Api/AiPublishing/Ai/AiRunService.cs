using Google.Cloud.Firestore;
using AiProductivityCoach.Api.AiPublishing.Domain;

namespace AiProductivityCoach.Api.AiPublishing.Ai
{
    /// <summary>
    /// Records every AI execution (spec section 39) with its token usage, and keeps a
    /// running usage total per provider so costs stay visible.
    /// </summary>
    public sealed class AiRunService
    {
        private readonly FirestoreDb _firestore;
        private readonly ILogger<AiRunService> _logger;

        public AiRunService(FirestoreDb firestore, ILogger<AiRunService> logger)
        {
            _firestore = firestore;
            _logger = logger;
        }

        public async Task<string> RecordAsync(
            string providerId,
            string? jobId,
            string operation,
            string model,
            string status,
            DateTime startedAtUtc,
            int promptTokens,
            int completionTokens,
            int items,
            string? error = null)
        {
            try
            {
                var run = _firestore.Collection(AiCollections.Runs).Document();

                await run.SetAsync(new Dictionary<string, object>
                {
                    ["providerId"] = providerId,
                    ["jobId"] = jobId ?? string.Empty,
                    ["operation"] = operation,
                    ["model"] = model,
                    ["status"] = status,
                    ["promptTokens"] = promptTokens,
                    ["completionTokens"] = completionTokens,
                    ["totalTokens"] = promptTokens + completionTokens,
                    ["items"] = items,
                    ["error"] = error ?? string.Empty,
                    ["startedAt"] = Timestamp.FromDateTime(startedAtUtc),
                    ["completedAt"] = Timestamp.GetCurrentTimestamp()
                });

                if (promptTokens + completionTokens > 0)
                {
                    await _firestore.Collection(AiCollections.Providers).Document(providerId).UpdateAsync(
                        new Dictionary<string, object>
                        {
                            [$"aiUsage.{operation}Tokens"] = FieldValue.Increment(promptTokens + completionTokens),
                            ["aiUsage.totalTokens"] = FieldValue.Increment(promptTokens + completionTokens)
                        });
                }

                return run.Id;
            }
            catch (Exception ex)
            {
                // Run bookkeeping must never break the job itself.
                _logger.LogError(ex, "AI run record failed for {Operation}", operation);
                return string.Empty;
            }
        }
    }
}
