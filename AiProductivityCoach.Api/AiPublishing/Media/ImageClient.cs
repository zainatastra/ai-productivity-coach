using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace AiProductivityCoach.Api.AiPublishing.Media
{
    public sealed record GeneratedImage(byte[] Bytes, string ContentType, string Extension, string Model, int Width, int Height);

    public sealed class ImageGenerationException : Exception
    {
        public ImageGenerationException(string code, string message) : base(message) => Code = code;
        public string Code { get; }
    }

    public interface IImageClient
    {
        bool IsConfigured { get; }
        string Model { get; }
        Task<GeneratedImage> GenerateAsync(string prompt, CancellationToken cancellationToken);
    }

    /// <summary>
    /// OpenAI image generation (/v1/images/generations). The image is returned as base64 and is
    /// stored by us; the API key never leaves the server.
    /// </summary>
    public sealed class OpenAiImageClient : IImageClient
    {
        private const int Width = 1536;
        private const int Height = 1024;

        private readonly HttpClient _http;
        private readonly string? _apiKey;
        private readonly string _quality;
        private readonly ILogger<OpenAiImageClient> _logger;

        public OpenAiImageClient(IConfiguration configuration, ILogger<OpenAiImageClient> logger)
        {
            _logger = logger;
            _apiKey = Environment.GetEnvironmentVariable("OPENAI_API_KEY") ?? configuration["OpenAI:ApiKey"];
            Model = configuration["OpenAI:ImageModel"] ?? "gpt-image-2.5-flare";
            _quality = configuration["OpenAI:ImageQuality"] ?? "medium";
            _http = new HttpClient { BaseAddress = new Uri("https://api.openai.com/v1/"), Timeout = TimeSpan.FromSeconds(240) };
        }

        public string Model { get; }
        public bool IsConfigured => !string.IsNullOrWhiteSpace(_apiKey);

        public async Task<GeneratedImage> GenerateAsync(string prompt, CancellationToken cancellationToken)
        {
            if (!IsConfigured)
                throw new ImageGenerationException("image_not_configured", "OpenAI is not configured.");

            var body = JsonSerializer.Serialize(new Dictionary<string, object>
            {
                ["model"] = Model,
                ["prompt"] = prompt,
                ["size"] = $"{Width}x{Height}",
                ["quality"] = _quality,
                ["output_format"] = "jpeg",
                ["output_compression"] = 85,
                ["n"] = 1
            });

            for (var attempt = 0; ; attempt++)
            {
                using var request = new HttpRequestMessage(HttpMethod.Post, "images/generations")
                {
                    Content = new StringContent(body, Encoding.UTF8, "application/json")
                };
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _apiKey);

                try
                {
                    using var response = await _http.SendAsync(request, cancellationToken);
                    var text = await response.Content.ReadAsStringAsync(cancellationToken);

                    if (response.IsSuccessStatusCode)
                        return Parse(text);

                    var status = (int)response.StatusCode;
                    var detail = Short(text);

                    if ((status == 429 || status >= 500) && attempt < 2)
                    {
                        await Task.Delay(TimeSpan.FromSeconds(3 * (attempt + 1)), cancellationToken);
                        continue;
                    }

                    _logger.LogWarning("[Image] generation failed with {Status}: {Detail}", status, detail);

                    // The moderation system declined the prompt: a different, safe prompt may work.
                    if (status == 400 && text.Contains("moderation", StringComparison.OrdinalIgnoreCase))
                        throw new ImageGenerationException("image_blocked", "The image request was declined by the safety system.");

                    throw new ImageGenerationException("image_unavailable", $"OpenAI image request failed ({status}): {detail}");
                }
                catch (HttpRequestException) when (attempt < 2)
                {
                    await Task.Delay(TimeSpan.FromSeconds(3), cancellationToken);
                }
                catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested && attempt < 2)
                {
                    await Task.Delay(TimeSpan.FromSeconds(3), cancellationToken);
                }
            }
        }

        private GeneratedImage Parse(string json)
        {
            using var doc = JsonDocument.Parse(json);

            if (!doc.RootElement.TryGetProperty("data", out var data) || data.GetArrayLength() == 0 ||
                !data[0].TryGetProperty("b64_json", out var b64) || string.IsNullOrWhiteSpace(b64.GetString()))
                throw new ImageGenerationException("image_unavailable", "OpenAI returned no image data.");

            var bytes = Convert.FromBase64String(b64.GetString()!);

            if (!ImageSignature.IsJpeg(bytes))
                throw new ImageGenerationException("image_unavailable", "OpenAI returned an unexpected image format.");

            return new GeneratedImage(bytes, "image/jpeg", "jpg", Model, Width, Height);
        }

        private static string Short(string text) => text.Length <= 250 ? text : text[..250];
    }

    public static class ImageSignature
    {
        public static bool IsJpeg(byte[] bytes) => bytes.Length > 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF;
    }
}
