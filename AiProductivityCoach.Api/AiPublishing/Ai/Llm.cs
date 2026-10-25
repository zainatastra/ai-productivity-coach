using Anthropic;
using Anthropic.Models.Messages;

namespace AiProductivityCoach.Api.AiPublishing.Ai
{
    /// <summary>
    /// What a call needs from a model. Writing = long, high-quality text (Sonnet class);
    /// Light = plans, summaries and checks (Haiku class).
    /// </summary>
    public enum LlmTier { Writing, Light }

    public sealed record LlmRequest(
        string Operation,
        LlmTier Tier,
        string System,
        string User,
        int MaxTokens,
        bool ExpectJson);

    public sealed record LlmResult(
        string Text,
        int InputTokens,
        int OutputTokens,
        int CacheReadTokens,
        string Provider,
        string Model);

    public sealed class LlmRefusalException : Exception
    {
        public LlmRefusalException(string message) : base(message) { }
    }

    public sealed class LlmTruncatedException : Exception
    {
        public LlmTruncatedException(string message) : base(message) { }
    }

    public interface ILlmClient
    {
        bool IsConfigured { get; }
        string Provider { get; }
        string ModelFor(LlmTier tier);
        Task<LlmResult> CompleteAsync(LlmRequest request, CancellationToken cancellationToken);
    }

    /// <summary>Claude (Anthropic API): Sonnet for writing, Haiku for light tasks.</summary>
    public sealed class ClaudeLlmClient : ILlmClient
    {
        private readonly AnthropicClient? _client;
        private readonly string _writingModel;
        private readonly string _lightModel;
        private readonly string? _refusalFallbackModel;
        private readonly ILogger<ClaudeLlmClient> _logger;

        public ClaudeLlmClient(IConfiguration configuration, ILogger<ClaudeLlmClient> logger)
        {
            _logger = logger;

            var apiKey = Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY") ?? configuration["Anthropic:ApiKey"];

            _writingModel = configuration["Anthropic:WritingModel"] ?? "claude-sonnet-5-5";
            _lightModel = configuration["Anthropic:LightModel"] ?? "claude-haiku-5-5";
            _refusalFallbackModel = configuration["Anthropic:RefusalFallbackModel"] ?? "claude-opus-5-5";

            if (!string.IsNullOrWhiteSpace(apiKey))
                _client = new AnthropicClient { ApiKey = apiKey };
        }

        public bool IsConfigured => _client != null;
        public string Provider => "anthropic";

        public string ModelFor(LlmTier tier) => tier == LlmTier.Writing ? _writingModel : _lightModel;

        public async Task<LlmResult> CompleteAsync(LlmRequest request, CancellationToken cancellationToken)
        {
            if (_client == null)
                throw new InvalidOperationException("Anthropic is not configured.");

            var model = ModelFor(request.Tier);
            var response = await SendAsync(request, model, cancellationToken);

            // A safety decline is retried once on the fallback model instead of failing the job.
            if (response.StopReason == "refusal" &&
                !string.IsNullOrWhiteSpace(_refusalFallbackModel) &&
                _refusalFallbackModel != model)
            {
                _logger.LogWarning("[Claude] {Model} declined {Operation}; retrying on {Fallback}.",
                    model, request.Operation, _refusalFallbackModel);

                model = _refusalFallbackModel;
                response = await SendAsync(request, model, cancellationToken);
            }

            if (response.StopReason == "refusal")
                throw new LlmRefusalException("The model declined to answer.");

            if (response.StopReason == "max_tokens")
                throw new LlmTruncatedException("The model stopped because the output limit was reached.");

            var text = string.Concat(response.Content.Select(block => block.Value).OfType<TextBlock>().Select(t => t.Text));

            return new LlmResult(
                text,
                (int)response.Usage.InputTokens,
                (int)response.Usage.OutputTokens,
                (int)(response.Usage.CacheReadInputTokens ?? 0),
                Provider,
                model);
        }

        private Task<Message> SendAsync(LlmRequest request, string model, CancellationToken cancellationToken)
        {
            var parameters = new MessageCreateParams
            {
                Model = model,
                MaxTokens = request.MaxTokens,
                // The long, fixed instructions are cached; only the per-document sources change.
                System = new List<TextBlockParam>
                {
                    new() { Text = request.System, CacheControl = new CacheControlEphemeral() }
                },
                Messages = new List<MessageParam> { new UserMessageParam { Content = request.User } },
                OutputConfig = new OutputConfig
                {
                    Effort = request.Tier == LlmTier.Writing ? Effort.Medium : Effort.Low
                }
            };

            return _client!.Messages.Create(parameters, cancellationToken: cancellationToken);
        }
    }

    /// <summary>OpenAI chat: the fallback while no Anthropic key is configured.</summary>
    public sealed class OpenAiLlmClient : ILlmClient
    {
        private readonly OpenAiClient _openAi;

        public OpenAiLlmClient(OpenAiClient openAi)
        {
            _openAi = openAi;
        }

        public bool IsConfigured => _openAi.IsConfigured;
        public string Provider => "openai";

        public string ModelFor(LlmTier tier) =>
            tier == LlmTier.Writing ? _openAi.WritingModel : _openAi.AnalysisModel;

        public async Task<LlmResult> CompleteAsync(LlmRequest request, CancellationToken cancellationToken)
        {
            var model = ModelFor(request.Tier);
            var chat = await _openAi.ChatAsync(model, request.System, request.User, request.MaxTokens, request.ExpectJson, cancellationToken);

            return new LlmResult(chat.Content, chat.PromptTokens, chat.CompletionTokens, 0, Provider, model);
        }
    }

    /// <summary>Uses Claude when an Anthropic key is configured, otherwise OpenAI.</summary>
    public sealed class LlmRouter : ILlmClient
    {
        private readonly ClaudeLlmClient _claude;
        private readonly OpenAiLlmClient _openAi;

        public LlmRouter(ClaudeLlmClient claude, OpenAiLlmClient openAi)
        {
            _claude = claude;
            _openAi = openAi;
        }

        private ILlmClient Active => _claude.IsConfigured ? _claude : _openAi;

        public bool IsConfigured => Active.IsConfigured;
        public string Provider => Active.Provider;
        public string ModelFor(LlmTier tier) => Active.ModelFor(tier);

        public Task<LlmResult> CompleteAsync(LlmRequest request, CancellationToken cancellationToken) =>
            Active.CompleteAsync(request, cancellationToken);
    }
}
