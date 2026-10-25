using Google.Cloud.Firestore;
using AiProductivityCoach.Api.AiPublishing.Ai;
using AiProductivityCoach.Api.AiPublishing.Content;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.AiPublishing.Media
{
    public sealed record MediaResult(string MediaId, string Url);

    /// <summary>
    /// Creates one image for a draft: plan the picture from the text (light model), generate it,
    /// store it in the media store and attach it to the draft. Nothing here publishes anything.
    /// </summary>
    public sealed class MediaGenerationService
    {
        private readonly ContentStore _content;
        private readonly MediaStore _media;
        private readonly ILlmClient _llm;
        private readonly IImageClient _images;
        private readonly GeneratedMediaStorage _storage;
        private readonly IAiRunRecorder _runs;
        private readonly ILogger<MediaGenerationService> _logger;

        public MediaGenerationService(
            ContentStore content,
            MediaStore media,
            ILlmClient llm,
            IImageClient images,
            GeneratedMediaStorage storage,
            IAiRunRecorder runs,
            ILogger<MediaGenerationService> logger)
        {
            _content = content;
            _media = media;
            _llm = llm;
            _images = images;
            _storage = storage;
            _runs = runs;
            _logger = logger;
        }

        public bool IsConfigured => _images.IsConfigured && _storage.IsConfigured;

        /// <summary>Which part is missing, so the admin sees what to fix (null when everything is set).</summary>
        public string? ConfigProblem => !_images.IsConfigured ? "image_not_configured" : !_storage.IsConfigured ? "storage_not_configured" : null;
        public string ImageModel => _images.Model;

        public async Task<MediaResult> GenerateAsync(
            string contentId, string? instruction, string createdBy, string? jobId, Func<string, Task>? step, CancellationToken ct)
        {
            var doc = await _content.GetAsync(contentId) ?? throw new ImageGenerationException("content_not_found", "Content not found.");
            var data = doc.ToDictionary();
            var providerId = FirestoreApi.GetString(data, "providerId");

            if (await _media.CountAsync(contentId) >= MediaStore.MaxImagesPerDocument)
                throw new ImageGenerationException("too_many_images", "The draft already has the maximum number of images.");

            // 1) plan the picture
            if (step != null) await step("plan");
            var plan = await PlanAsync(providerId, contentId, jobId, data, instruction, ct);

            // 2) generate
            if (step != null) await step("image");
            var started = DateTime.UtcNow;
            GeneratedImage image;

            try
            {
                image = await _images.GenerateAsync(plan.Prompt, ct);
            }
            catch (ImageGenerationException ex)
            {
                await _runs.RecordAsync(providerId, jobId, "image", _images.Model, "failed", started, 0, 0, 1, ex.Code, "openai", 0, contentId);
                throw;
            }

            await _runs.RecordAsync(providerId, jobId, "image", image.Model, "completed", started, 0, 0, 1, null, "openai", 0, contentId);

            // 3) store + attach
            if (step != null) await step("store");
            var mediaId = _media.NewId(contentId);
            var path = GeneratedMediaStorage.PathFor(providerId, contentId, mediaId, image.Extension);
            var stored = await _storage.SaveAsync(path, image, ct);

            try
            {
                await _media.AddAsync(contentId, mediaId, new Dictionary<string, object>
                {
                    ["url"] = stored.Url,
                    ["pathname"] = stored.Pathname,
                    ["prompt"] = plan.Prompt,
                    ["altText"] = plan.AltText,
                    ["model"] = image.Model,
                    ["width"] = image.Width,
                    ["height"] = image.Height,
                    ["bytes"] = image.Bytes.Length,
                    ["source"] = "ai",
                    ["instruction"] = instruction ?? string.Empty,
                    ["jobId"] = jobId ?? string.Empty,
                    ["createdBy"] = createdBy,
                    ["createdAt"] = Timestamp.GetCurrentTimestamp()
                });
            }
            catch
            {
                // Do not leave an orphaned file behind when the record could not be saved.
                await _storage.DeleteAsync(stored.Pathname, CancellationToken.None);
                throw;
            }

            return new MediaResult(mediaId, stored.Url);
        }

        private async Task<ImagePlan> PlanAsync(
            string providerId, string contentId, string? jobId, IDictionary<string, object> data, string? instruction, CancellationToken ct)
        {
            var title = FirestoreApi.GetString(data, "title");
            var excerpt = FirestoreApi.GetString(data, "excerpt");
            var type = FirestoreApi.GetString(data, "type");

            var headings = new List<string>();
            if (data.TryGetValue("blocks", out var rawBlocks) && rawBlocks is IEnumerable<object> blocks)
            {
                foreach (var block in blocks.OfType<IDictionary<string, object>>())
                {
                    if (FirestoreApi.GetString(block, "type") == "heading")
                        headings.Add(FirestoreApi.GetString(block, "text"));
                }
            }

            if (!_llm.IsConfigured)
                return ImagePlanner.Fallback(title);

            var started = DateTime.UtcNow;
            var model = _llm.ModelFor(LlmTier.Light);

            try
            {
                var result = await _llm.CompleteAsync(new LlmRequest(
                    "image_plan", LlmTier.Light, ImagePlanner.System,
                    ImagePlanner.BuildUser(type, title, excerpt, headings, instruction), 600, ExpectJson: true), ct);

                await _runs.RecordAsync(providerId, jobId, "image_plan", result.Model, "completed", started,
                    result.InputTokens, result.OutputTokens, 1, null, result.Provider, result.CacheReadTokens, contentId);

                return ImagePlanner.Parse(result.Text, title);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // The picture does not depend on the planning model: fall back to a neutral prompt.
                _logger.LogWarning(ex, "[Media] Image planning failed for {ContentId}; using the neutral prompt.", contentId);
                await _runs.RecordAsync(providerId, jobId, "image_plan", model, "failed", started, 0, 0, 1, ex.GetType().Name, _llm.Provider, 0, contentId);
                return ImagePlanner.Fallback(title);
            }
        }
    }
}
