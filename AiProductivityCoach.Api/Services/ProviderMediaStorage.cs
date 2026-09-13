using System.Net.Http.Json;

namespace AiProductivityCoach.Api.Services
{
    public class ProviderMediaStorage
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;
        private readonly ILogger<ProviderMediaStorage> _logger;

        public ProviderMediaStorage(
            HttpClient httpClient,
            IConfiguration configuration,
            ILogger<ProviderMediaStorage> logger)
        {
            _httpClient = httpClient;
            _configuration = configuration;
            _logger = logger;
        }

        public string FrontendBaseUrl =>
            Environment.GetEnvironmentVariable("VERCEL_MEDIA_BASE_URL")
            ?? _configuration["VercelMedia:FrontendBaseUrl"]
            ?? string.Empty;

        public string InternalSecret =>
            Environment.GetEnvironmentVariable("VERCEL_MEDIA_INTERNAL_SECRET")
            ?? _configuration["VercelMedia:InternalSecret"]
            ?? string.Empty;

        public bool IsConfigured =>
            !string.IsNullOrWhiteSpace(FrontendBaseUrl) &&
            !string.IsNullOrWhiteSpace(InternalSecret);

        public async Task DeleteIfExistsAsync(
            string? pathname,
            CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(pathname))
                return;

            if (!IsConfigured)
            {
                _logger.LogWarning(
                    "Vercel Blob cleanup skipped for {Pathname}: media bridge is not fully configured.",
                    pathname
                );
                return;
            }

            try
            {
                using var request = new HttpRequestMessage(
                    HttpMethod.Post,
                    $"{FrontendBaseUrl.TrimEnd('/')}/api/provider-media/delete"
                );

                request.Headers.TryAddWithoutValidation(
                    "X-Media-Internal-Secret",
                    InternalSecret
                );

                request.Content = JsonContent.Create(new { pathname });

                using var response = await _httpClient.SendAsync(
                    request,
                    cancellationToken
                );

                if (!response.IsSuccessStatusCode &&
                    response.StatusCode != System.Net.HttpStatusCode.NotFound)
                {
                    var body = await response.Content.ReadAsStringAsync(cancellationToken);
                    _logger.LogWarning(
                        "Vercel Blob cleanup failed for {Pathname}. Status={Status}. Body={Body}",
                        pathname,
                        (int)response.StatusCode,
                        body
                    );
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(
                    ex,
                    "Vercel Blob cleanup request failed for {Pathname}.",
                    pathname
                );
            }
        }

        public string BuildObjectName(
            string companyId,
            string scope,
            string slot,
            string extension,
            string? resourceId = null)
        {
            var version = Guid.NewGuid().ToString("N");
            var safeExtension = extension.TrimStart('.').ToLowerInvariant();

            if (string.IsNullOrWhiteSpace(resourceId))
                return $"providers/{companyId}/{scope}/{slot}/{version}.{safeExtension}";

            return $"providers/{companyId}/{scope}/{resourceId}/{slot}/{version}.{safeExtension}";
        }
    }
}
