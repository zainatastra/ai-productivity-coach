using Google.Cloud.Firestore;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AiProductivityCoach.Api.AiPublishing.Ai;
using AiProductivityCoach.Api.AiPublishing.Content;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Jobs;
using AiProductivityCoach.Api.AiPublishing.Media;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.Controllers
{
    /// <summary>
    /// Content plan and generated drafts of one provider (admin only). The provider id always comes
    /// from the route and is verified against Firestore; the AI never chooses or changes it.
    /// </summary>
    [ApiController]
    [Route("api/ai")]
    [Authorize(Policy = "AdminOnly")]
    public class AiContentController : AiControllerBase
    {
        private readonly FirestoreDb _firestore;
        private readonly ContentPlanService _plans;
        private readonly ContentStore _store;
        private readonly AiJobService _jobs;
        private readonly AiAuditService _audit;
        private readonly ILlmClient _llm;
        private readonly MediaStore _media;
        private readonly MediaGenerationService _mediaGeneration;
        private readonly GeneratedMediaStorage _mediaStorage;

        public AiContentController(
            FirestoreDb firestore,
            ContentPlanService plans,
            ContentStore store,
            AiJobService jobs,
            AiAuditService audit,
            ILlmClient llm,
            MediaStore media,
            MediaGenerationService mediaGeneration,
            GeneratedMediaStorage mediaStorage)
        {
            _firestore = firestore;
            _plans = plans;
            _store = store;
            _jobs = jobs;
            _audit = audit;
            _llm = llm;
            _media = media;
            _mediaGeneration = mediaGeneration;
            _mediaStorage = mediaStorage;
        }

        public class UpdatePlanItemDto
        {
            public string? Title { get; set; }
            public string? Angle { get; set; }
            public string? Audience { get; set; }
            public List<string>? KeyPoints { get; set; }
            public string? Instruction { get; set; }
            public bool? Removed { get; set; }
        }

        public class RegenerateItemDto
        {
            public string? Instruction { get; set; }
        }

        public class GenerateContentDto
        {
            public List<string>? Types { get; set; }
            public bool Regenerate { get; set; }
        }

        // ───────────── plan ─────────────

        [HttpGet("providers/{providerId}/content-plan")]
        public async Task<IActionResult> GetPlan(string providerId, CancellationToken ct)
        {
            var provider = await ContentContext.LoadAsync(_firestore, providerId, ct);
            if (provider == null) return ProviderNotFound();

            var plan = await _plans.GetAsync(providerId, ct);
            return Ok(PlanResponse(provider, plan));
        }

        [HttpPost("providers/{providerId}/content-plan/generate")]
        public async Task<IActionResult> GeneratePlan(string providerId, CancellationToken ct)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var provider = await ContentContext.LoadAsync(_firestore, providerId, ct);
            if (provider == null) return ProviderNotFound();
            if (provider.Status == ProviderStatus.Archived) return Error(409, "provider_archived", "Archived providers cannot be edited.");

            return await Run(async () => Ok(PlanResponse(provider, await _plans.GenerateAsync(provider, actor, ct))));
        }

        [HttpPatch("providers/{providerId}/content-plan/items/{type}")]
        public async Task<IActionResult> UpdateItem(string providerId, string type, [FromBody] UpdatePlanItemDto request)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var provider = await ContentContext.LoadAsync(_firestore, providerId);
            if (provider == null) return ProviderNotFound();

            var patch = new PlanItemPatch(request.Title, request.Angle, request.Audience, request.KeyPoints, request.Instruction, request.Removed);

            return await Run(async () => Ok(PlanResponse(provider, await _plans.UpdateItemAsync(providerId, type, patch, actor))));
        }

        [HttpPost("providers/{providerId}/content-plan/items/{type}/regenerate")]
        public async Task<IActionResult> RegenerateItem(string providerId, string type, [FromBody] RegenerateItemDto? request, CancellationToken ct)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var provider = await ContentContext.LoadAsync(_firestore, providerId, ct);
            if (provider == null) return ProviderNotFound();

            return await Run(async () => Ok(PlanResponse(provider,
                await _plans.RegenerateItemAsync(provider, type, request?.Instruction, actor, ct))));
        }

        [HttpPost("providers/{providerId}/content-plan/approve")]
        public async Task<IActionResult> Approve(string providerId)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var provider = await ContentContext.LoadAsync(_firestore, providerId);
            if (provider == null) return ProviderNotFound();

            return await Run(async () => Ok(PlanResponse(provider, await _plans.ApproveAsync(providerId, actor))));
        }

        // ───────────── generation ─────────────

        [HttpPost("providers/{providerId}/content/generate")]
        public async Task<IActionResult> Generate(string providerId, [FromBody] GenerateContentDto? request)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var provider = await ContentContext.LoadAsync(_firestore, providerId);
            if (provider == null) return ProviderNotFound();
            if (provider.Status == ProviderStatus.Archived) return Error(409, "provider_archived", "Archived providers cannot be edited.");

            if (!_llm.IsConfigured) return Error(503, "ai_not_configured", "The AI is not configured.");

            var plan = await _plans.GetAsync(providerId);
            if (plan == null) return Error(404, "plan_not_found", "No content plan exists yet.");
            if (plan.Status != PlanStatus.Approved) return Error(409, "plan_not_approved", "The content plan must be approved first.");

            var regenerate = request?.Regenerate == true;
            var requested = request?.Types is { Count: > 0 }
                ? request.Types.Where(ContentTypes.IsGeneratable).ToHashSet()
                : ContentTypes.Generatable.ToHashSet();

            var targets = ContentTypes.Generatable
                .Where(requested.Contains)
                .Where(type =>
                {
                    var item = plan.Items.FirstOrDefault(i => i.Type == type);
                    return item is { Status: PlanItemStatus.Proposed } && (regenerate || item.ContentId == null);
                })
                .ToList();

            if (targets.Count == 0)
                return Error(409, "nothing_to_generate", "There is nothing left to generate.");

            var payload = new Dictionary<string, object>
            {
                ["types"] = targets.Cast<object>().ToList(),
                ["regenerate"] = regenerate
            };

            var (jobId, alreadyActive) = await _jobs.CreateAsync(
                JobTypes.Generate, providerId, actor.Platform, actor.UserId, payload, GenerationJobHandler.InitialSteps(targets));

            if (!alreadyActive)
            {
                await _audit.LogAsync(actor, AuditActions.JobCreated, providerId, null, null,
                    new Dictionary<string, object> { ["jobId"] = jobId, ["type"] = JobTypes.Generate });
            }

            return Accepted(new { jobId, alreadyActive });
        }

        // ───────────── drafts ─────────────

        [HttpGet("providers/{providerId}/content")]
        public async Task<IActionResult> ListContent(string providerId)
        {
            var provider = await ContentContext.LoadAsync(_firestore, providerId);
            if (provider == null) return ProviderNotFound();

            return Ok(await _store.ListAsync(providerId));
        }

        [HttpGet("content/{contentId}")]
        public async Task<IActionResult> GetContent(string contentId)
        {
            var doc = await _store.GetAsync(contentId);
            if (doc == null) return Error(404, "content_not_found", "Content not found.");

            var row = FirestoreApi.ToApi(doc);
            row["versions"] = await _store.ListVersionsAsync(contentId);
            row["media"] = await _media.ListAsync(contentId);

            return Ok(row);
        }

        [HttpDelete("content/{contentId}")]
        public async Task<IActionResult> DeleteContent(string contentId)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var doc = await _store.GetAsync(contentId);
            if (doc == null) return Error(404, "content_not_found", "Content not found.");

            var data = doc.ToDictionary();
            var providerId = FirestoreApi.GetString(data, "providerId");

            // Only drafts can be deleted here; published or approved content follows the workflow.
            if (FirestoreApi.GetString(data, "status") != ContentStatus.Draft)
                return Error(409, "content_not_draft", "Only drafts can be deleted.");

            foreach (var image in await _media.ListAsync(contentId))
                await _mediaStorage.DeleteAsync(image.GetValueOrDefault("pathname")?.ToString(), HttpContext.RequestAborted);

            await _media.DeleteAllAsync(contentId);
            await _store.DeleteAsync(contentId);
            await _plans.ClearContentLinkAsync(providerId, contentId);

            await _audit.LogAsync(actor, AuditActions.ContentDeleted, providerId, contentId, null,
                new Dictionary<string, object> { ["type"] = FirestoreApi.GetString(data, "type") });

            return NoContent();
        }

        // ───────────── images ─────────────

        public class GenerateImageDto
        {
            public string? Instruction { get; set; }
        }

        [HttpPost("content/{contentId}/media/generate")]
        public async Task<IActionResult> GenerateImage(string contentId, [FromBody] GenerateImageDto? request)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var doc = await _store.GetAsync(contentId);
            if (doc == null) return Error(404, "content_not_found", "Content not found.");

            var data = doc.ToDictionary();
            var providerId = FirestoreApi.GetString(data, "providerId");

            if (FirestoreApi.GetString(data, "status") != ContentStatus.Draft)
                return Error(409, "content_not_draft", "Images can only be added to drafts.");

            if (_mediaGeneration.ConfigProblem is { } problem)
                return Error(503, problem, "The image AI or the media storage is not configured.");

            if (await _media.CountAsync(contentId) >= MediaStore.MaxImagesPerDocument)
                return Error(409, "too_many_images", "The draft already has the maximum number of images.");

            var instruction = request?.Instruction?.Trim();
            if (instruction is { Length: > 300 }) instruction = instruction[..300];

            var payload = new Dictionary<string, object> { ["contentId"] = contentId };
            if (!string.IsNullOrWhiteSpace(instruction)) payload["instruction"] = instruction;

            var (jobId, alreadyActive) = await _jobs.CreateAsync(
                JobTypes.GenerateMedia, providerId, actor.Platform, actor.UserId, payload, MediaJobHandler.InitialSteps());

            if (!alreadyActive)
            {
                await _audit.LogAsync(actor, AuditActions.JobCreated, providerId, contentId, null,
                    new Dictionary<string, object> { ["jobId"] = jobId, ["type"] = JobTypes.GenerateMedia });
            }

            return Accepted(new { jobId, alreadyActive });
        }

        [HttpGet("content/{contentId}/media")]
        public async Task<IActionResult> ListImages(string contentId)
        {
            if (await _store.GetAsync(contentId) == null) return Error(404, "content_not_found", "Content not found.");
            return Ok(await _media.ListAsync(contentId));
        }

        [HttpPut("content/{contentId}/media/{mediaId}/cover")]
        public async Task<IActionResult> SetCover(string contentId, string mediaId)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var doc = await _store.GetAsync(contentId);
            if (doc == null) return Error(404, "content_not_found", "Content not found.");
            if (await _media.GetAsync(contentId, mediaId) == null) return Error(404, "media_not_found", "Image not found.");

            await _media.SetCoverAsync(contentId, mediaId);
            await _audit.LogAsync(actor, AuditActions.MediaCoverChanged, FirestoreApi.GetString(doc.ToDictionary(), "providerId"), contentId, null,
                new Dictionary<string, object> { ["mediaId"] = mediaId });

            return NoContent();
        }

        [HttpDelete("content/{contentId}/media/{mediaId}")]
        public async Task<IActionResult> DeleteImage(string contentId, string mediaId)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var doc = await _store.GetAsync(contentId);
            if (doc == null) return Error(404, "content_not_found", "Content not found.");

            var image = await _media.GetAsync(contentId, mediaId);
            if (image == null) return Error(404, "media_not_found", "Image not found.");

            if (FirestoreApi.GetString(doc.ToDictionary(), "status") != ContentStatus.Draft)
                return Error(409, "content_not_draft", "Images can only be removed from drafts.");

            await _media.DeleteAsync(contentId, mediaId);
            await _mediaStorage.DeleteAsync(FirestoreApi.GetString(image, "pathname"), HttpContext.RequestAborted);
            await _audit.LogAsync(actor, AuditActions.MediaDeleted, FirestoreApi.GetString(doc.ToDictionary(), "providerId"), contentId, null,
                new Dictionary<string, object> { ["mediaId"] = mediaId });

            return NoContent();
        }

        // ───────────── helpers ─────────────

        private object PlanResponse(ProviderContext provider, PlanDocument? plan)
        {
            var engine = new
            {
                provider = _llm.Provider,
                configured = _llm.IsConfigured,
                writingModel = _llm.ModelFor(LlmTier.Writing),
                lightModel = _llm.ModelFor(LlmTier.Light)
            };

            if (plan == null)
                return new { exists = false, hasKnowledge = provider.HasKnowledge, engine, items = Array.Empty<object>() };

            return new
            {
                exists = true,
                hasKnowledge = provider.HasKnowledge,
                status = plan.Status,
                version = plan.Version,
                engine,
                items = plan.Items
                    .OrderBy(i => Array.IndexOf(ContentTypes.All, i.Type))
                    .Select(i => new
                    {
                        type = i.Type,
                        title = i.Title,
                        angle = i.Angle,
                        audience = i.Audience,
                        keyPoints = i.KeyPoints,
                        instruction = i.Instruction,
                        status = i.Status,
                        contentId = i.ContentId,
                        gate = provider.Gates.TryGetValue(i.Type, out var gate)
                            ? new { state = gate.State, reasons = gate.Reasons }
                            : null
                    })
            };
        }

        private IActionResult ProviderNotFound() => Error(404, "provider_not_found", "Provider not found.");

        private async Task<IActionResult> Run(Func<Task<IActionResult>> action)
        {
            try
            {
                return await action();
            }
            catch (ContentGenerationException ex)
            {
                return ex.Code switch
                {
                    "ai_not_configured" => Error(503, ex.Code, "The AI is not configured."),
                    "no_knowledge" => Error(409, ex.Code, "The knowledge base is empty. Run the research first."),
                    "plan_not_found" or "item_not_found" => Error(404, ex.Code, "Not found."),
                    "ai_refused" or "ai_truncated" or "ai_invalid_output" or "ai_unavailable" => Error(502, ex.Code, "The AI could not complete the request."),
                    _ => Error(400, ex.Code, "The request is not valid.")
                };
            }
        }
    }
}
