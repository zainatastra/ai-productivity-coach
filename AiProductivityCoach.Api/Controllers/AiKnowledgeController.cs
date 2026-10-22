using Google.Cloud.Firestore;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AiProductivityCoach.Api.AiPublishing.Ai;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Jobs;
using AiProductivityCoach.Api.AiPublishing.Knowledge;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.Controllers
{
    /// <summary>Research and knowledge base of one provider (admin only, tenant-scoped by provider id).</summary>
    [ApiController]
    [Route("api/ai/providers/{providerId}")]
    [Authorize(Policy = "AdminOnly")]
    public class AiKnowledgeController : AiControllerBase
    {
        private readonly FirestoreDb _firestore;
        private readonly AiJobService _jobs;
        private readonly AiAuditService _audit;
        private readonly KnowledgeStore _store;
        private readonly KnowledgeSearchService _search;
        private readonly OpenAiClient _openAi;

        public AiKnowledgeController(
            FirestoreDb firestore,
            AiJobService jobs,
            AiAuditService audit,
            KnowledgeStore store,
            KnowledgeSearchService search,
            OpenAiClient openAi)
        {
            _firestore = firestore;
            _jobs = jobs;
            _audit = audit;
            _store = store;
            _search = search;
            _openAi = openAi;
        }

        private DocumentReference ProviderRef(string providerId) =>
            _firestore.Collection(AiCollections.Providers).Document(providerId);

        [HttpPost("research")]
        public async Task<IActionResult> StartResearch(string providerId)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var provider = await ProviderRef(providerId).GetSnapshotAsync();
            if (!provider.Exists) return Error(404, "provider_not_found", "Provider not found.");

            if (FirestoreApi.GetString(provider.ToDictionary(), "status") == ProviderStatus.Archived)
                return Error(409, "provider_archived", "Archived providers cannot be edited.");

            if (!_openAi.IsConfigured)
                return Error(503, "ai_not_configured", "The AI is not configured.");

            var (jobId, alreadyActive) = await _jobs.CreateAsync(
                JobTypes.Research, providerId, actor.Platform, actor.UserId, null, ResearchJobHandler.InitialSteps());

            if (!alreadyActive)
            {
                await _audit.LogAsync(actor, AuditActions.JobCreated, providerId, null, null,
                    new Dictionary<string, object> { ["jobId"] = jobId, ["type"] = JobTypes.Research });
            }

            return Accepted(new { jobId, alreadyActive });
        }

        /// <summary>Readiness, AI profile and usage of the provider's knowledge base.</summary>
        [HttpGet("knowledge")]
        public async Task<IActionResult> GetKnowledge(string providerId)
        {
            var provider = await ProviderRef(providerId).GetSnapshotAsync();
            if (!provider.Exists) return Error(404, "provider_not_found", "Provider not found.");

            var data = FirestoreApi.ToApi(provider);

            return Ok(new
            {
                readiness = data.GetValueOrDefault("readiness"),
                profile = data.GetValueOrDefault("knowledgeProfile"),
                pageSummary = data.GetValueOrDefault("pageSummary"),
                usage = data.GetValueOrDefault("aiUsage"),
                stale = data.GetValueOrDefault("knowledgeStale") is true,
                updatedAt = data.GetValueOrDefault("knowledgeUpdatedAt")
            });
        }

        /// <summary>The pages the knowledge base was built from (source traceability).</summary>
        [HttpGet("knowledge/pages")]
        public async Task<IActionResult> GetPages(string providerId)
        {
            var provider = await ProviderRef(providerId).GetSnapshotAsync();
            if (!provider.Exists) return Error(404, "provider_not_found", "Provider not found.");

            var pages = await _store.GetPagesAsync(providerId);

            var rows = pages.Values
                .Select(doc => FirestoreApi.ToApi(doc))
                .OrderByDescending(row => row.TryGetValue("status", out var s) && s?.ToString() == "ok")
                .ThenByDescending(row => row.TryGetValue("isSeed", out var seed) && seed is true)
                .ThenBy(row => row.TryGetValue("url", out var u) ? u?.ToString() : "")
                .ToList();

            return Ok(rows);
        }

        /// <summary>Semantic search inside this provider's knowledge base only (test the knowledge).</summary>
        [HttpGet("knowledge/search")]
        public async Task<IActionResult> SearchKnowledge(
            string providerId,
            [FromQuery] string q,
            [FromQuery] int limit = 5,
            CancellationToken cancellationToken = default)
        {
            var query = (q ?? string.Empty).Trim();

            if (query.Length < 2 || query.Length > 300)
                return Error(400, "search_query_invalid", "Enter a search text between 2 and 300 characters.");

            var provider = await ProviderRef(providerId).GetSnapshotAsync(cancellationToken);
            if (!provider.Exists) return Error(404, "provider_not_found", "Provider not found.");

            if (!_openAi.IsConfigured)
                return Error(503, "ai_not_configured", "The AI is not configured.");

            try
            {
                var hits = await _search.SearchAsync(providerId, query, Math.Clamp(limit, 1, 10), cancellationToken);

                return Ok(hits.Select(h => new
                {
                    chunkId = h.ChunkId,
                    url = h.Url,
                    title = h.Title,
                    heading = h.Heading,
                    text = h.Text,
                    score = Math.Round(h.Score, 4)
                }));
            }
            catch (OpenAiException)
            {
                return Error(502, "ai_unavailable", "The AI service is not available right now.");
            }
        }
    }
}
