using Google.Cloud.Firestore;
using AiProductivityCoach.Api.AiPublishing.Ai;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Security;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.AiPublishing.Media
{
    public static class LogoSource
    {
        public const string None = "";
        public const string Website = "website";
        public const string Manual = "manual";
    }

    public sealed record LogoResult(string Url, string Source, IReadOnlyList<LogoCandidate> Candidates);
    public sealed record HeaderResult(string Url, string Prompt, string Model);

    /// <summary>
    /// Provider profile media: the logo "caught from the website" (spec section 6) and the
    /// AI-generated header/banner "according to the info it fetched" (spec section 7). Both are
    /// distinct from Phase 4's per-content images - these live once on the provider profile itself.
    /// </summary>
    public sealed class ProfileMediaService
    {
        private const long MaxLogoBytes = 3_000_000;
        private static readonly string[] AllowedLogoTypes = { "image/png", "image/jpeg", "image/webp", "image/x-icon" };

        private readonly FirestoreDb _firestore;
        private readonly SafeHttpFetcher _fetcher;
        private readonly GeneratedMediaStorage _storage;
        private readonly IImageClient _images;
        private readonly IAiRunRecorder _runs;
        private readonly ILogger<ProfileMediaService> _logger;

        public ProfileMediaService(
            FirestoreDb firestore,
            SafeHttpFetcher fetcher,
            GeneratedMediaStorage storage,
            IImageClient images,
            IAiRunRecorder runs,
            ILogger<ProfileMediaService> logger)
        {
            _firestore = firestore;
            _fetcher = fetcher;
            _storage = storage;
            _images = images;
            _runs = runs;
            _logger = logger;
        }

        public bool HeaderGenerationConfigured => _images.IsConfigured && _storage.IsConfigured;
        public bool LogoStorageConfigured => _storage.IsConfigured;

        private DocumentReference ProviderRef(string providerId) => _firestore.Collection(AiCollections.Providers).Document(providerId);

        // ───────────── logo ─────────────

        /// <summary>
        /// Re-reads the provider's homepage and finds logo candidates. When the provider has no
        /// logo yet, the best candidate is fetched and stored automatically (still an AI "guess",
        /// never a silent replacement of a logo the admin already picked or kept as-is).
        /// </summary>
        public async Task<LogoResult> DiscoverAsync(string providerId, string website, CancellationToken ct)
        {
            var doc = await ProviderRef(providerId).GetSnapshotAsync(ct);
            var existingUrl = doc.Exists ? FirestoreApi.GetString(doc.ToDictionary(), "logoUrl") : string.Empty;

            IReadOnlyList<LogoCandidate> candidates = Array.Empty<LogoCandidate>();

            try
            {
                var homepage = await _fetcher.FetchDocumentAsync(website, ct);

                if (homepage.Meta.Ok && !string.IsNullOrWhiteSpace(homepage.Body) &&
                    Uri.TryCreate(homepage.Meta.FinalUrl, UriKind.Absolute, out var baseUri))
                {
                    candidates = LogoFinder.Find(homepage.Body, baseUri);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // Logo discovery is a bonus on top of the research job: never fail the run for it.
                _logger.LogWarning(ex, "[Profile] Logo discovery failed for {ProviderId}.", providerId);
            }

            await ProviderRef(providerId).UpdateAsync(new Dictionary<string, object>
            {
                ["logoCandidates"] = candidates.Select(c => new Dictionary<string, object> { ["url"] = c.Url, ["kind"] = c.Kind }).ToList(),
                ["logoCandidatesUpdatedAt"] = Timestamp.GetCurrentTimestamp()
            }, cancellationToken: ct);

            if (string.IsNullOrWhiteSpace(existingUrl) && LogoStorageConfigured && candidates.Count > 0)
            {
                foreach (var candidate in candidates)
                {
                    try
                    {
                        return new LogoResult(
                            (await ApplyAsync(providerId, candidate.Url, LogoSource.Website, ct)).Url,
                            LogoSource.Website, candidates);
                    }
                    catch (ImageGenerationException)
                    {
                        // try the next candidate (e.g. a dead favicon.ico fallback)
                    }
                }
            }

            return new LogoResult(existingUrl, existingUrl.Length > 0 ? ReadLogoSource(doc) : LogoSource.None, candidates);
        }

        /// <summary>Fetches an image (a candidate, or any admin-supplied URL) and makes it the provider's logo.</summary>
        public async Task<LogoResult> ApplyAsync(string providerId, string sourceUrl, string source, CancellationToken ct)
        {
            if (!LogoStorageConfigured)
                throw new ImageGenerationException("storage_not_configured", "The media storage is not configured.");

            var urlCheck = UrlSafety.Normalize(sourceUrl);
            if (!urlCheck.Ok)
                throw new ImageGenerationException("invalid_logo_url", "The image address is not valid.");

            var fetched = await _fetcher.FetchBinaryAsync(urlCheck.Normalized!, MaxLogoBytes, ct);
            if (!fetched.Ok || fetched.Bytes == null)
                throw new ImageGenerationException("logo_fetch_failed", $"The image could not be downloaded ({fetched.ErrorCode}).");

            // The real file signature decides the type - a server's Content-Type header is never trusted alone.
            var detected = ImageSignature.Detect(fetched.Bytes);
            if (detected == null || !AllowedLogoTypes.Contains(detected))
                throw new ImageGenerationException("invalid_logo_format", "The file is not a supported image format (PNG, JPEG, WebP or ICO).");

            var doc = await ProviderRef(providerId).GetSnapshotAsync(ct);
            if (!doc.Exists) throw new ImageGenerationException("provider_not_found", "Provider not found.");

            var oldPath = FirestoreApi.GetString(doc.ToDictionary(), "logoPathname");
            var path = GeneratedMediaStorage.ProfilePathFor(providerId, "logo", ImageSignature.ExtensionFor(detected));
            var stored = await _storage.SaveAsync(path, fetched.Bytes, detected, ct);

            await ProviderRef(providerId).UpdateAsync(new Dictionary<string, object>
            {
                ["logoUrl"] = stored.Url,
                ["logoPathname"] = stored.Pathname,
                ["logoSource"] = source,
                ["logoUpdatedAt"] = Timestamp.GetCurrentTimestamp()
            }, cancellationToken: ct);

            if (!string.IsNullOrWhiteSpace(oldPath) && oldPath != stored.Pathname)
                await _storage.DeleteAsync(oldPath, CancellationToken.None);

            var candidates = doc.TryGetValue<List<object>>("logoCandidates", out var raw)
                ? raw.OfType<Dictionary<string, object>>()
                    .Select(c => new LogoCandidate(FirestoreApi.GetString(c, "url"), FirestoreApi.GetString(c, "kind"), 0))
                    .ToList()
                : new List<LogoCandidate>();

            return new LogoResult(stored.Url, source, candidates);
        }

        public async Task RemoveAsync(string providerId, CancellationToken ct)
        {
            var doc = await ProviderRef(providerId).GetSnapshotAsync(ct);
            if (!doc.Exists) return;

            var path = FirestoreApi.GetString(doc.ToDictionary(), "logoPathname");

            await ProviderRef(providerId).UpdateAsync(new Dictionary<string, object>
            {
                ["logoUrl"] = string.Empty,
                ["logoPathname"] = string.Empty,
                ["logoSource"] = LogoSource.None,
                ["logoUpdatedAt"] = Timestamp.GetCurrentTimestamp()
            }, cancellationToken: ct);

            if (!string.IsNullOrWhiteSpace(path))
                await _storage.DeleteAsync(path, ct);
        }

        private static string ReadLogoSource(DocumentSnapshot doc) =>
            doc.Exists ? FirestoreApi.GetString(doc.ToDictionary(), "logoSource") : LogoSource.None;

        // ───────────── header / banner ─────────────

        public async Task<HeaderResult> GenerateHeaderAsync(string providerId, string? jobId, CancellationToken ct)
        {
            if (!HeaderGenerationConfigured)
                throw new ImageGenerationException("image_not_configured", "The image AI or the media storage is not configured.");

            var doc = await ProviderRef(providerId).GetSnapshotAsync(ct);
            if (!doc.Exists) throw new ImageGenerationException("provider_not_found", "Provider not found.");

            var data = doc.ToDictionary();
            var name = FirestoreApi.GetString(data, "name");
            var (industries, topics) = ReadIndustriesAndTopics(data);
            var prompt = ProfileHeaderPlanner.Build(name, industries, topics);

            var started = DateTime.UtcNow;
            GeneratedImage image;

            try
            {
                image = await _images.GenerateAsync(prompt, ct);
            }
            catch (ImageGenerationException ex)
            {
                await _runs.RecordAsync(providerId, jobId, "profile_header", _images.Model, "failed", started, 0, 0, 1, ex.Code, "openai");
                throw;
            }

            await _runs.RecordAsync(providerId, jobId, "profile_header", image.Model, "completed", started, 0, 0, 1, null, "openai");

            var oldPath = FirestoreApi.GetString(data, "headerPathname");
            var path = GeneratedMediaStorage.ProfilePathFor(providerId, "header", image.Extension);
            var stored = await _storage.SaveAsync(path, image, ct);

            await ProviderRef(providerId).UpdateAsync(new Dictionary<string, object>
            {
                ["headerImageUrl"] = stored.Url,
                ["headerPathname"] = stored.Pathname,
                ["headerPrompt"] = prompt,
                ["headerModel"] = image.Model,
                ["headerUpdatedAt"] = Timestamp.GetCurrentTimestamp()
            }, cancellationToken: ct);

            if (!string.IsNullOrWhiteSpace(oldPath) && oldPath != stored.Pathname)
                await _storage.DeleteAsync(oldPath, CancellationToken.None);

            return new HeaderResult(stored.Url, prompt, image.Model);
        }

        public async Task RemoveHeaderAsync(string providerId, CancellationToken ct)
        {
            var doc = await ProviderRef(providerId).GetSnapshotAsync(ct);
            if (!doc.Exists) return;

            var path = FirestoreApi.GetString(doc.ToDictionary(), "headerPathname");

            await ProviderRef(providerId).UpdateAsync(new Dictionary<string, object>
            {
                ["headerImageUrl"] = string.Empty,
                ["headerPathname"] = string.Empty,
                ["headerPrompt"] = string.Empty,
                ["headerUpdatedAt"] = Timestamp.GetCurrentTimestamp()
            }, cancellationToken: ct);

            if (!string.IsNullOrWhiteSpace(path))
                await _storage.DeleteAsync(path, ct);
        }

        private static (List<string> Industries, List<string> Topics) ReadIndustriesAndTopics(IDictionary<string, object> providerData)
        {
            if (!providerData.TryGetValue("knowledgeProfile", out var raw) || raw is not IDictionary<string, object> profile)
                return (new List<string>(), new List<string>());

            List<string> List(string key) =>
                profile.TryGetValue(key, out var v) && v is IEnumerable<object> items
                    ? items.Select(i => i?.ToString() ?? string.Empty).Where(s => s.Length > 0).ToList()
                    : new List<string>();

            return (List("industries"), List("topics"));
        }
    }
}
