using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace AiProductivityCoach.Api.AiPublishing.Ai
{
    public sealed record EmbeddingResult(List<double[]> Vectors, int TotalTokens);

    public sealed record ChatResult(string Content, int PromptTokens, int CompletionTokens);

    public sealed class OpenAiException : Exception
    {
        public OpenAiException(int statusCode, string message) : base(message) => StatusCode = statusCode;
        public int StatusCode { get; }
    }

    /// <summary>
    /// Thin OpenAI client used by the AI Publishing Engine (embeddings + JSON chat).
    /// The API key stays on the server and never appears in errors or logs.
    /// </summary>
    public sealed class OpenAiClient
    {
        private const int EmbeddingBatchSize = 64;
        private const int MaxInputChars = 8000;
        private static readonly TimeSpan[] RetryDelays =
        {
            TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(3), TimeSpan.FromSeconds(8)
        };

        private readonly HttpClient _http;
        private readonly string? _apiKey;
        private readonly string _writingModel;
        private readonly ILogger<OpenAiClient> _logger;

        public OpenAiClient(IConfiguration configuration, ILogger<OpenAiClient> logger)
        {
            _logger = logger;
            _apiKey = Environment.GetEnvironmentVariable("OPENAI_API_KEY") ?? configuration["OpenAI:ApiKey"];

            EmbeddingModel = configuration["OpenAI:EmbeddingModel"] ?? "text-embedding-3-small";
            AnalysisModel = configuration["OpenAI:AnalysisModel"] ?? configuration["OpenAI:Model"] ?? "gpt-4o-mini";
            _writingModel = configuration["OpenAI:WritingModel"] ?? AnalysisModel;

            _http = new HttpClient { BaseAddress = new Uri("https://api.openai.com/v1/"), Timeout = TimeSpan.FromSeconds(90) };
        }

        public string EmbeddingModel { get; }
        public string AnalysisModel { get; }
        public bool IsConfigured => !string.IsNullOrWhiteSpace(_apiKey);

        public async Task<EmbeddingResult> EmbedAsync(IReadOnlyList<string> inputs, CancellationToken cancellationToken)
        {
            var vectors = new List<double[]>(inputs.Count);
            var tokens = 0;

            for (var offset = 0; offset < inputs.Count; offset += EmbeddingBatchSize)
            {
                var batch = inputs.Skip(offset).Take(EmbeddingBatchSize)
                    .Select(text => text.Length > MaxInputChars ? text[..MaxInputChars] : text)
                    .ToArray();

                using var doc = await PostAsync("embeddings", new { model = EmbeddingModel, input = batch }, cancellationToken);

                var data = doc.RootElement.GetProperty("data")
                    .EnumerateArray()
                    .OrderBy(item => item.GetProperty("index").GetInt32())
                    .Select(item => item.GetProperty("embedding").EnumerateArray().Select(v => v.GetDouble()).ToArray())
                    .ToList();

                if (data.Count != batch.Length)
                    throw new OpenAiException(502, "Embedding response size mismatch.");

                vectors.AddRange(data);
                tokens += doc.RootElement.GetProperty("usage").GetProperty("total_tokens").GetInt32();
            }

            return new EmbeddingResult(vectors, tokens);
        }

        /// <summary>Chat completion constrained to a JSON object.</summary>
        public async Task<ChatResult> ChatJsonAsync(
            string system,
            string user,
            int maxTokens,
            CancellationToken cancellationToken)
        {
            var body = new
            {
                model = AnalysisModel,
                temperature = 0.2,
                max_tokens = maxTokens,
                response_format = new { type = "json_object" },
                messages = new object[]
                {
                    new { role = "system", content = system },
                    new { role = "user", content = user }
                }
            };

            using var doc = await PostAsync("chat/completions", body, cancellationToken);

            var content = doc.RootElement.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString() ?? string.Empty;
            var usage = doc.RootElement.GetProperty("usage");

            return new ChatResult(content, usage.GetProperty("prompt_tokens").GetInt32(), usage.GetProperty("completion_tokens").GetInt32());
        }

        /// <summary>General chat completion (used as the fallback writer when no Claude key is set).</summary>
        public async Task<ChatResult> ChatAsync(
            string model,
            string system,
            string user,
            int maxTokens,
            bool json,
            CancellationToken cancellationToken)
        {
            var body = new Dictionary<string, object>
            {
                ["model"] = model,
                ["temperature"] = 0.4,
                ["max_tokens"] = maxTokens,
                ["messages"] = new object[]
                {
                    new { role = "system", content = system },
                    new { role = "user", content = user }
                }
            };

            if (json)
                body["response_format"] = new { type = "json_object" };

            using var doc = await PostAsync("chat/completions", body, cancellationToken);

            var choice = doc.RootElement.GetProperty("choices")[0];
            var content = choice.GetProperty("message").GetProperty("content").GetString() ?? string.Empty;
            var usage = doc.RootElement.GetProperty("usage");

            if (choice.TryGetProperty("finish_reason", out var reason) && reason.GetString() == "length")
                throw new LlmTruncatedException("The model stopped because the output limit was reached.");

            return new ChatResult(content, usage.GetProperty("prompt_tokens").GetInt32(), usage.GetProperty("completion_tokens").GetInt32());
        }

        public string WritingModel => _writingModel;

        private async Task<JsonDocument> PostAsync(string path, object body, CancellationToken cancellationToken)
        {
            if (!IsConfigured)
                throw new OpenAiException(500, "OpenAI is not configured.");

            var json = JsonSerializer.Serialize(body);

            for (var attempt = 0; ; attempt++)
            {
                using var request = new HttpRequestMessage(HttpMethod.Post, path)
                {
                    Content = new StringContent(json, Encoding.UTF8, "application/json")
                };
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _apiKey);

                HttpResponseMessage? response = null;

                try
                {
                    response = await _http.SendAsync(request, cancellationToken);
                    var text = await response.Content.ReadAsStringAsync(cancellationToken);

                    if (response.IsSuccessStatusCode)
                        return JsonDocument.Parse(text);

                    var status = (int)response.StatusCode;
                    var retryable = status == 429 || status >= 500;

                    if (!retryable || attempt >= RetryDelays.Length)
                    {
                        _logger.LogWarning("[OpenAI] {Path} failed with {Status}.", path, status);
                        throw new OpenAiException(status, $"OpenAI request failed ({status}).");
                    }

                    var delay = response.Headers.RetryAfter?.Delta ?? RetryDelays[attempt];
                    await Task.Delay(delay > TimeSpan.FromSeconds(20) ? TimeSpan.FromSeconds(20) : delay, cancellationToken);
                }
                catch (HttpRequestException) when (attempt < RetryDelays.Length)
                {
                    await Task.Delay(RetryDelays[attempt], cancellationToken);
                }
                catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested && attempt < RetryDelays.Length)
                {
                    await Task.Delay(RetryDelays[attempt], cancellationToken);
                }
                finally
                {
                    response?.Dispose();
                }
            }
        }
    }
}
