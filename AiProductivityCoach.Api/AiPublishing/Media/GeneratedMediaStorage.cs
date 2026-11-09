using System.Net.Http.Json;
using System.Text.Json;
using AiProductivityCoach.Api.Services;

namespace AiProductivityCoach.Api.AiPublishing.Media
{
    public sealed record StoredImage(string Url, string Pathname);

    /// <summary>
    /// Stores generated images in the same Vercel Blob store as the other provider media, through
    /// the secured server-to-server route of the frontend.
    /// </summary>
    public sealed class GeneratedMediaStorage
    {
        private readonly HttpClient _http;
        private readonly ProviderMediaStorage _config;
        private readonly ILogger<GeneratedMediaStorage> _logger;

        public GeneratedMediaStorage(HttpClient http, ProviderMediaStorage config, ILogger<GeneratedMediaStorage> logger)
        {
            _http = http;
            _config = config;
            _logger = logger;
        }

        public bool IsConfigured => _config.IsConfigured;

        public static string PathFor(string providerId, string contentId, string mediaId, string extension) =>
            $"providers/{providerId}/ai-content/{contentId}/{mediaId}.{extension.TrimStart('.').ToLowerInvariant()}";

        /// <summary>Path for the provider profile's own media (logo, AI header) - distinct from per-content images.</summary>
        public static string ProfilePathFor(string providerId, string slot, string extension) =>
            $"providers/{providerId}/profile/{slot}-{Guid.NewGuid():N}.{extension.TrimStart('.').ToLowerInvariant()}";

        public Task<StoredImage> SaveAsync(string pathname, GeneratedImage image, CancellationToken cancellationToken) =>
            SaveAsync(pathname, image.Bytes, image.ContentType, cancellationToken);

        public async Task<StoredImage> SaveAsync(string pathname, byte[] bytes, string contentType, CancellationToken cancellationToken)
        {
            if (!IsConfigured)
                throw new ImageGenerationException("storage_not_configured", "The media storage is not configured.");

            using var request = new HttpRequestMessage(HttpMethod.Post,
                $"{_config.FrontendBaseUrl.TrimEnd('/')}/api/provider-media/generated");
            request.Headers.TryAddWithoutValidation("X-Media-Internal-Secret", _config.InternalSecret);
            request.Content = JsonContent.Create(new
            {
                pathname,
                contentType,
                dataBase64 = Convert.ToBase64String(bytes)
            });

            try
            {
                using var response = await _http.SendAsync(request, cancellationToken);
                var text = await response.Content.ReadAsStringAsync(cancellationToken);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning("[Media] upload failed with {Status}: {Body}", (int)response.StatusCode, text.Length > 200 ? text[..200] : text);
                    throw new ImageGenerationException("storage_failed", $"The image could not be stored ({(int)response.StatusCode}).");
                }

                using var doc = JsonDocument.Parse(text);
                var url = doc.RootElement.TryGetProperty("url", out var u) ? u.GetString() : null;

                if (string.IsNullOrWhiteSpace(url))
                    throw new ImageGenerationException("storage_failed", "The storage returned no image address.");

                return new StoredImage(url!, pathname);
            }
            catch (HttpRequestException ex)
            {
                throw new ImageGenerationException("storage_failed", "The media storage is not reachable: " + ex.Message);
            }
        }

        public Task DeleteAsync(string? pathname, CancellationToken cancellationToken) =>
            _config.DeleteIfExistsAsync(pathname, cancellationToken);
    }
}
