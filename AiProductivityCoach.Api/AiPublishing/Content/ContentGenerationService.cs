using AiProductivityCoach.Api.AiPublishing.Ai;
using AiProductivityCoach.Api.AiPublishing.Knowledge;

namespace AiProductivityCoach.Api.AiPublishing.Content
{
    public sealed class ContentGenerationException : Exception
    {
        public ContentGenerationException(string code, string? message = null) : base(message ?? code) => Code = code;
        public string Code { get; }
    }

    public sealed record GenerationResult(string ContentId, int Version, string QualityState, int Words);

    /// <summary>
    /// Writes one document from the provider's knowledge base:
    /// retrieve passages -> ground the prompt -> call the model -> parse (with one repair
    /// attempt) -> automatic quality checks -> store as a private draft version.
    /// </summary>
    public sealed class ContentGenerationService
    {
        private static readonly Dictionary<string, (int Passages, int MaxTokens, int CharLimit)> Settings = new()
        {
            [ContentTypes.Article] = (10, 12000, 22_000),
            [ContentTypes.Whitepaper] = (16, 16000, 30_000),
            [ContentTypes.Webinar] = (10, 10000, 20_000),
        };

        public static (int Passages, int MaxTokens, int CharLimit) SettingsFor(string type) => Settings[type];

        private readonly ILlmClient _llm;
        private readonly KnowledgeSearchService _search;
        private readonly ContentStore _store;
        private readonly DocumentWriter _writer;

        public ContentGenerationService(
            ILlmClient llm,
            KnowledgeSearchService search,
            ContentStore store,
            DocumentWriter writer)
        {
            _llm = llm;
            _search = search;
            _store = store;
            _writer = writer;
        }

        public async Task<GenerationResult> GenerateAsync(
            ProviderContext provider,
            PlanItem item,
            string? existingContentId,
            string? revisionInstruction,
            string actorUid,
            string? jobId,
            CancellationToken ct)
        {
            if (!ContentTypes.IsGeneratable(item.Type))
                throw new ContentGenerationException("type_not_supported");

            if (!_llm.IsConfigured)
                throw new ContentGenerationException("ai_not_configured");

            var (passages, maxTokens, charLimit) = Settings[item.Type];

            // 1) Retrieve this provider's passages for the topic (tenant-scoped by provider id).
            var queries = new List<string> { item.Title, item.Angle };
            queries.AddRange(item.KeyPoints.Take(4));
            queries.Add($"{provider.Name} Produkte und Leistungen");

            List<SearchHit> hits;
            try
            {
                hits = await _search.SearchManyAsync(provider.Id, queries, perQuery: 5, maxTotal: passages, maxPerPage: 3, jobId, ct);
            }
            catch (OpenAiException ex)
            {
                throw new ContentGenerationException("ai_unavailable", "Embeddings (OpenAI): " + ex.Message);
            }

            var excerpts = ContentContext.BuildExcerpts(hits, charLimit);
            if (excerpts.Count == 0)
                throw new ContentGenerationException("no_knowledge");

            // 2) Write.
            var user = ContentPrompts.BuildWriterUser(
                provider.Language, provider.Name, provider.Website, item, provider.Profile, excerpts, revisionInstruction);

            var parsed = await _writer.WriteAsync(provider.Id, item.Type, user, maxTokens, excerpts.Count, jobId, ct);

            // 3) Automatic quality checks against the passages the writer was given.
            var quality = QualityChecker.Check(parsed.Doc, excerpts.Select(e => e.Text).ToList(), provider.Language, excerpts.Count);

            var sources = excerpts
                .Select(e => new SourceRef(e.Number, e.Url, e.Title, parsed.Doc.UsedSources.Contains(e.Number)))
                .ToList();

            var meta = new ContentMeta(provider.Language, parsed.Model, parsed.LlmProvider, jobId);

            // 4) Store as a private draft (new document or next version).
            string contentId;
            int version;

            if (existingContentId != null && await _store.GetAsync(existingContentId) != null)
            {
                contentId = existingContentId;
                version = await _store.AddVersionAsync(contentId, parsed.Doc, meta, quality, sources, actorUid, revisionInstruction);
            }
            else
            {
                contentId = await _store.CreateAsync(provider.Id, parsed.Doc, meta, quality, sources, actorUid, revisionInstruction);
                version = 1;
            }

            return new GenerationResult(contentId, version, quality.State, (int)quality.Metrics["words"]);
        }
    }
}
