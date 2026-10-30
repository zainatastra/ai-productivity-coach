using System.Text.Json;
using Google.Cloud.Firestore;
using AiProductivityCoach.Api.AiPublishing.Ai;
using AiProductivityCoach.Api.AiPublishing.Knowledge;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.AiPublishing.Content
{
    public sealed record RevisionResult(string ContentId, int Version, string QualityState, int Words);

    /// <summary>
    /// Changes an existing draft after it was written: manual edits by the admin and AI revisions
    /// ("make it shorter", "more technical"). Every change becomes a new version; nothing is overwritten.
    /// </summary>
    public sealed class ContentRevisionService
    {
        public const string ManualEditInstruction = "manual_edit";

        private readonly FirestoreDb _firestore;
        private readonly ILlmClient _llm;
        private readonly KnowledgeSearchService _search;
        private readonly ContentStore _store;
        private readonly DocumentWriter _writer;

        public ContentRevisionService(
            FirestoreDb firestore,
            ILlmClient llm,
            KnowledgeSearchService search,
            ContentStore store,
            DocumentWriter writer)
        {
            _firestore = firestore;
            _llm = llm;
            _search = search;
            _store = store;
            _writer = writer;
        }

        // ───────────── manual edit ─────────────

        public async Task<RevisionResult> SaveEditAsync(string contentId, EditDocumentDto edit, string actorUid)
        {
            var snap = await _store.GetAsync(contentId) ?? throw new ContentGenerationException("content_not_found");
            var data = snap.ToDictionary();

            var current = ContentDocumentMapper.FromStored(data);
            var outcome = ContentDocumentMapper.FromEdit(edit, current);

            if (outcome.Document == null)
                throw new ContentGenerationException(outcome.ErrorCode ?? "invalid_document");

            var language = FirestoreApi.GetString(data, "language", "de");

            // There is no source set for hand-written text, so only structure, language and tone are checked.
            var quality = QualityChecker.Check(outcome.Document, Array.Empty<string>(), language, 0, grounded: false);

            var meta = new ContentMeta(language, "admin", "manual", null);
            var version = await _store.AddVersionAsync(
                contentId, outcome.Document, meta, quality, ContentDocumentMapper.SourcesFromStored(data),
                actorUid, ManualEditInstruction, byAi: false);

            return new RevisionResult(contentId, version, quality.State, (int)quality.Metrics["words"]);
        }

        // ───────────── AI revision ─────────────

        public async Task<RevisionResult> ReviseAsync(
            string contentId, string instruction, string actorUid, string? jobId, CancellationToken ct)
        {
            if (!_llm.IsConfigured)
                throw new ContentGenerationException("ai_not_configured");

            var snap = await _store.GetAsync(contentId) ?? throw new ContentGenerationException("content_not_found");
            var data = snap.ToDictionary();
            var providerId = FirestoreApi.GetString(data, "providerId");
            var type = FirestoreApi.GetString(data, "type");

            if (!ContentTypes.IsGeneratable(type))
                throw new ContentGenerationException("type_not_supported");

            var provider = await ContentContext.LoadAsync(_firestore, providerId, ct)
                ?? throw new ContentGenerationException("provider_not_found");

            var current = ContentDocumentMapper.FromStored(data);
            var (passages, maxTokens, charLimit) = ContentGenerationService.SettingsFor(type);

            // 1) Fresh passages of THIS provider for the topic and for what the admin asked.
            var queries = new List<string> { current.Title, instruction };
            queries.AddRange(current.Blocks.Where(b => b.Type == "heading").Select(b => b.Text).Take(3));
            queries.Add($"{provider.Name} Produkte und Leistungen");

            List<SearchHit> hits;
            try
            {
                hits = await _search.SearchManyAsync(providerId, queries, perQuery: 5, maxTotal: passages, maxPerPage: 3, jobId, ct);
            }
            catch (OpenAiException ex)
            {
                throw new ContentGenerationException("ai_unavailable", "Embeddings (OpenAI): " + ex.Message);
            }

            var excerpts = ContentContext.BuildExcerpts(hits, charLimit);
            if (excerpts.Count == 0)
                throw new ContentGenerationException("no_knowledge");

            // 2) Rewrite. No automatic expansion: the admin may well have asked for a shorter text.
            var user = ContentPrompts.BuildRevisionUser(
                provider.Language, provider.Name, provider.Website, provider.Profile, excerpts,
                ToJson(current), instruction, type);

            var written = await _writer.WriteAsync(providerId, type, user, maxTokens, excerpts.Count, jobId, ct,
                allowExpansion: false, operationName: $"revise_{type}");

            // 3) Checks, then store as the next version.
            var quality = QualityChecker.Check(written.Doc, excerpts.Select(e => e.Text).ToList(), provider.Language, excerpts.Count);

            var sources = excerpts
                .Select(e => new SourceRef(e.Number, e.Url, e.Title, written.Doc.UsedSources.Contains(e.Number)))
                .ToList();

            var meta = new ContentMeta(provider.Language, written.Model, written.LlmProvider, jobId);
            var version = await _store.AddVersionAsync(contentId, written.Doc, meta, quality, sources, actorUid, instruction);

            return new RevisionResult(contentId, version, quality.State, (int)quality.Metrics["words"]);
        }

        /// <summary>The current draft in the same JSON shape the writer returns.</summary>
        public static string ToJson(GeneratedDocument doc)
        {
            var map = new Dictionary<string, object>
            {
                ["title"] = doc.Title,
                ["subtitle"] = doc.Subtitle,
                ["excerpt"] = doc.Excerpt,
                ["seoTitle"] = doc.SeoTitle,
                ["metaDescription"] = doc.MetaDescription,
                ["body"] = doc.Blocks.Select(b => b.Type switch
                {
                    "heading" => new Dictionary<string, object> { ["type"] = "heading", ["level"] = b.Level, ["text"] = b.Text },
                    "list" => new Dictionary<string, object> { ["type"] = "list", ["ordered"] = b.Ordered, ["items"] = b.Items },
                    _ => new Dictionary<string, object> { ["type"] = b.Type, ["text"] = b.Text }
                }).ToList(),
                ["notes"] = doc.Notes
            };

            foreach (var (key, value) in doc.Data)
                map[key] = value;

            return JsonSerializer.Serialize(map, new JsonSerializerOptions { WriteIndented = false, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping });
        }
    }
}
