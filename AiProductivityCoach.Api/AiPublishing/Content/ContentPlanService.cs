using Google.Cloud.Firestore;
using AiProductivityCoach.Api.AiPublishing.Ai;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Knowledge;
using AiProductivityCoach.Api.AiPublishing.Security;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.AiPublishing.Content
{
    public sealed record PlanDocument(
        string Status,
        IReadOnlyList<PlanItem> Items,
        string LlmProvider,
        string Model,
        int Version);

    public sealed record PlanItemPatch(
        string? Title,
        string? Angle,
        string? Audience,
        List<string>? KeyPoints,
        string? Instruction,
        bool? Removed);

    /// <summary>
    /// The content strategy step before any long text is written (specification section 11):
    /// the AI proposes one article, one whitepaper and one webinar; the admin edits, regenerates
    /// or removes topics and finally approves the plan. The plan lives next to the provider.
    /// </summary>
    public sealed class ContentPlanService
    {
        private static readonly string[] PlanQueries =
        {
            "Produkte und Lösungen des Unternehmens",
            "Herausforderungen und Probleme der Kunden",
            "Technologien, Themen und Schwerpunkte",
            "Branchen und Anwendungsfälle"
        };

        private readonly FirestoreDb _firestore;
        private readonly ILlmClient _llm;
        private readonly KnowledgeSearchService _search;
        private readonly AiRunService _runs;
        private readonly AiAuditService _audit;
        private readonly ILogger<ContentPlanService> _logger;

        public ContentPlanService(
            FirestoreDb firestore,
            ILlmClient llm,
            KnowledgeSearchService search,
            AiRunService runs,
            AiAuditService audit,
            ILogger<ContentPlanService> logger)
        {
            _firestore = firestore;
            _llm = llm;
            _search = search;
            _runs = runs;
            _audit = audit;
            _logger = logger;
        }

        private DocumentReference PlanRef(string providerId) =>
            _firestore.Collection(AiCollections.Providers).Document(providerId)
                .Collection(AiCollections.ContentPlan).Document("current");

        // ───────────── read / write ─────────────

        public async Task<PlanDocument?> GetAsync(string providerId, CancellationToken ct = default)
        {
            var snap = await PlanRef(providerId).GetSnapshotAsync(ct);
            return snap.Exists ? FromData(snap.ToDictionary()) : null;
        }

        private Task SaveAsync(string providerId, PlanDocument plan, Dictionary<string, object>? extra = null)
        {
            var data = ToData(plan);
            data["updatedAt"] = Timestamp.GetCurrentTimestamp();

            if (extra != null)
                foreach (var pair in extra) data[pair.Key] = pair.Value;

            return PlanRef(providerId).SetAsync(data, SetOptions.MergeAll);
        }

        // ───────────── generate the plan ─────────────

        public async Task<PlanDocument> GenerateAsync(ProviderContext provider, TenantContext actor, CancellationToken ct)
        {
            if (!provider.HasKnowledge) throw new ContentGenerationException("no_knowledge");
            if (!_llm.IsConfigured) throw new ContentGenerationException("ai_not_configured");

            List<SearchHit> hits;
            try
            {
                hits = await _search.SearchManyAsync(provider.Id, PlanQueries, perQuery: 4, maxTotal: 10, maxPerPage: 2, null, ct);
            }
            catch (OpenAiException)
            {
                throw new ContentGenerationException("ai_unavailable");
            }

            var excerpts = ContentContext.BuildExcerpts(hits, 14_000, 1000);
            if (excerpts.Count == 0) throw new ContentGenerationException("no_knowledge");

            var gateNotes = provider.Gates
                .Where(g => g.Value.State != "ready" && g.Key != ContentTypes.Tutorial)
                .Select(g => $"Für {g.Key}: {string.Join(", ", g.Value.Reasons)}.")
                .ToList();

            var user = ContentPrompts.BuildPlannerUser(provider.Language, provider.Name, provider.Website, provider.Profile, excerpts, gateNotes);
            var proposals = await RunPlannerAsync(provider.Id, "plan", user, ct);

            var existing = await GetAsync(provider.Id, ct);
            var items = new List<PlanItem>();

            foreach (var type in ContentTypes.Generatable)
            {
                var old = existing?.Items.FirstOrDefault(i => i.Type == type);

                // A topic that already has a written document is kept: it is never silently replaced.
                if (old != null && old.ContentId != null)
                {
                    items.Add(old);
                    continue;
                }

                var proposed = proposals[type];
                items.Add(proposed with { Instruction = old?.Instruction ?? string.Empty });
            }

            items.Add(ComingSoonTutorial());

            var plan = new PlanDocument(PlanStatus.Draft, items, _llm.Provider, _llm.ModelFor(LlmTier.Light), (existing?.Version ?? 0) + 1);

            await SaveAsync(provider.Id, plan, new Dictionary<string, object>
            {
                ["createdAt"] = Timestamp.GetCurrentTimestamp(),
                ["createdBy"] = actor.UserId
            });

            await _audit.LogAsync(actor, AuditActions.ContentPlanGenerated, provider.Id, null, null,
                new Dictionary<string, object> { ["version"] = plan.Version, ["model"] = plan.Model });

            return plan;
        }

        private async Task<Dictionary<string, PlanItem>> RunPlannerAsync(string providerId, string operation, string user, CancellationToken ct)
        {
            var text = await CompleteLightAsync(providerId, operation, ContentPrompts.PlannerSystem, user, 3000, ct);
            var parsed = PlanParser.ParseAll(text);

            if (parsed.Items == null && parsed.ErrorCode == "invalid_json")
            {
                var repaired = await CompleteLightAsync(providerId, "repair_json", ContentPrompts.RepairSystem,
                    ContentPrompts.BuildRepairUser(text, "ungültige Syntax"), 3000, ct);
                parsed = PlanParser.ParseAll(repaired);
            }

            return parsed.Items ?? throw new ContentGenerationException("ai_invalid_output", parsed.ErrorCode);
        }

        private async Task<string> CompleteLightAsync(string providerId, string operation, string system, string user, int maxTokens, CancellationToken ct)
        {
            var started = DateTime.UtcNow;

            try
            {
                var result = await _llm.CompleteAsync(new LlmRequest(operation, LlmTier.Light, system, user, maxTokens, ExpectJson: true), ct);

                await _runs.RecordAsync(providerId, null, operation, result.Model, "completed", started,
                    result.InputTokens, result.OutputTokens, 1, null, result.Provider, result.CacheReadTokens);

                return result.Text;
            }
            catch (LlmRefusalException)
            {
                throw new ContentGenerationException("ai_refused");
            }
            catch (LlmTruncatedException)
            {
                throw new ContentGenerationException("ai_truncated");
            }
            catch (Exception ex) when (ex is not OperationCanceledException && ex is not ContentGenerationException)
            {
                _logger.LogError(ex, "[Plan] {Operation} failed for {ProviderId}.", operation, providerId);
                throw new ContentGenerationException("ai_unavailable");
            }
        }

        // ───────────── edit / regenerate / approve ─────────────

        public async Task<PlanDocument> UpdateItemAsync(string providerId, string type, PlanItemPatch patch, TenantContext actor)
        {
            var plan = await GetAsync(providerId) ?? throw new ContentGenerationException("plan_not_found");
            var item = plan.Items.FirstOrDefault(i => i.Type == type) ?? throw new ContentGenerationException("item_not_found");

            if (!ContentTypes.IsGeneratable(type)) throw new ContentGenerationException("item_locked");

            var title = patch.Title != null ? DocumentParser.Clean(patch.Title, 180) : item.Title;
            var angle = patch.Angle != null ? DocumentParser.Clean(patch.Angle, 500) : item.Angle;

            if (title.Length < 5) throw new ContentGenerationException("title_too_short");
            if (angle.Length < 10) throw new ContentGenerationException("angle_too_short");

            var points = patch.KeyPoints != null
                ? patch.KeyPoints.Select(p => DocumentParser.Clean(p, 200)).Where(p => p.Length > 2).Take(6).ToList()
                : item.KeyPoints.ToList();

            if (points.Count < 2) throw new ContentGenerationException("key_points_too_few");

            var updated = item with
            {
                Title = title,
                Angle = angle,
                Audience = patch.Audience != null ? DocumentParser.Clean(patch.Audience, 200) : item.Audience,
                KeyPoints = points,
                Instruction = patch.Instruction != null ? DocumentParser.Clean(patch.Instruction, 1000) : item.Instruction,
                Status = patch.Removed switch
                {
                    true => PlanItemStatus.Removed,
                    false => PlanItemStatus.Proposed,
                    _ => item.Status
                }
            };

            var next = Replace(plan, updated) with { Status = PlanStatus.Draft };   // any edit needs a fresh approval
            await SaveAsync(providerId, next);

            await _audit.LogAsync(actor, AuditActions.ContentPlanUpdated, providerId, null, null,
                new Dictionary<string, object> { ["type"] = type, ["removed"] = updated.Status == PlanItemStatus.Removed });

            return next;
        }

        public async Task<PlanDocument> RegenerateItemAsync(
            ProviderContext provider, string type, string? instruction, TenantContext actor, CancellationToken ct)
        {
            if (!ContentTypes.IsGeneratable(type)) throw new ContentGenerationException("item_locked");
            if (!_llm.IsConfigured) throw new ContentGenerationException("ai_not_configured");

            var plan = await GetAsync(provider.Id, ct) ?? throw new ContentGenerationException("plan_not_found");
            var item = plan.Items.FirstOrDefault(i => i.Type == type) ?? throw new ContentGenerationException("item_not_found");

            var hits = await _search.SearchManyAsync(provider.Id, PlanQueries, perQuery: 4, maxTotal: 8, maxPerPage: 2, null, ct);
            var excerpts = ContentContext.BuildExcerpts(hits, 10_000, 900);
            if (excerpts.Count == 0) throw new ContentGenerationException("no_knowledge");

            var user = ContentPrompts.BuildItemPlannerUser(
                provider.Language, provider.Name, provider.Profile, excerpts, type, plan.Items.ToList(),
                DocumentParser.Clean(instruction, 600));

            var text = await CompleteLightAsync(provider.Id, "plan_item", ContentPrompts.PlannerSystem, user, 1500, ct);
            var proposed = PlanParser.ParseSingle(text, type);

            if (proposed == null)
            {
                var repaired = await CompleteLightAsync(provider.Id, "repair_json", ContentPrompts.RepairSystem,
                    ContentPrompts.BuildRepairUser(text, "ungültige Syntax"), 1500, ct);
                proposed = PlanParser.ParseSingle(repaired, type);
            }

            if (proposed == null) throw new ContentGenerationException("ai_invalid_output");

            var updated = proposed with { Instruction = item.Instruction, ContentId = item.ContentId, Status = PlanItemStatus.Proposed };
            var next = Replace(plan, updated) with { Status = PlanStatus.Draft };
            await SaveAsync(provider.Id, next);

            await _audit.LogAsync(actor, AuditActions.ContentPlanUpdated, provider.Id, null, null,
                new Dictionary<string, object> { ["type"] = type, ["regenerated"] = true });

            return next;
        }

        public async Task<PlanDocument> ApproveAsync(string providerId, TenantContext actor)
        {
            var plan = await GetAsync(providerId) ?? throw new ContentGenerationException("plan_not_found");

            if (!plan.Items.Any(i => ContentTypes.IsGeneratable(i.Type) && i.Status == PlanItemStatus.Proposed))
                throw new ContentGenerationException("plan_empty");

            var approved = plan with { Status = PlanStatus.Approved };

            await SaveAsync(providerId, approved, new Dictionary<string, object>
            {
                ["approvedAt"] = Timestamp.GetCurrentTimestamp(),
                ["approvedBy"] = actor.UserId
            });

            await _audit.LogAsync(actor, AuditActions.ContentPlanApproved, providerId, null, null,
                new Dictionary<string, object> { ["version"] = plan.Version });

            return approved;
        }

        // ───────────── content links (used by the generation job and deletes) ─────────────

        public async Task SetItemContentAsync(string providerId, string type, string? contentId)
        {
            var planRef = PlanRef(providerId);

            await _firestore.RunTransactionAsync(async tx =>
            {
                var snap = await tx.GetSnapshotAsync(planRef);
                if (!snap.Exists) return;

                var plan = FromData(snap.ToDictionary());
                var item = plan.Items.FirstOrDefault(i => i.Type == type);
                if (item == null) return;

                var data = ToData(Replace(plan, item with { ContentId = contentId }));
                data["updatedAt"] = Timestamp.GetCurrentTimestamp();
                tx.Set(planRef, data, SetOptions.MergeAll);
            });
        }

        public async Task ClearContentLinkAsync(string providerId, string contentId)
        {
            var plan = await GetAsync(providerId);
            var item = plan?.Items.FirstOrDefault(i => i.ContentId == contentId);

            if (item != null)
                await SetItemContentAsync(providerId, item.Type, null);
        }

        // ───────────── mapping ─────────────

        public static PlanItem ComingSoonTutorial() =>
            new(ContentTypes.Tutorial, string.Empty, string.Empty, string.Empty, Array.Empty<string>(),
                string.Empty, PlanItemStatus.ComingSoon, null);

        private static PlanDocument Replace(PlanDocument plan, PlanItem updated) =>
            plan with { Items = plan.Items.Select(i => i.Type == updated.Type ? updated : i).ToList() };

        private static Dictionary<string, object> ToData(PlanDocument plan) => new()
        {
            ["status"] = plan.Status,
            ["llmProvider"] = plan.LlmProvider,
            ["model"] = plan.Model,
            ["version"] = plan.Version,
            ["items"] = plan.Items.Select(i => new Dictionary<string, object>
            {
                ["type"] = i.Type,
                ["title"] = i.Title,
                ["angle"] = i.Angle,
                ["audience"] = i.Audience,
                ["keyPoints"] = i.KeyPoints.ToList(),
                ["instruction"] = i.Instruction,
                ["status"] = i.Status,
                ["contentId"] = i.ContentId ?? string.Empty
            }).ToList()
        };

        private static PlanDocument FromData(Dictionary<string, object> data)
        {
            var items = new List<PlanItem>();

            if (data.TryGetValue("items", out var raw) && raw is IEnumerable<object> list)
            {
                foreach (var map in list.OfType<Dictionary<string, object>>())
                {
                    var points = map.TryGetValue("keyPoints", out var kp) && kp is IEnumerable<object> pl
                        ? pl.Select(p => p?.ToString() ?? string.Empty).ToList()
                        : new List<string>();

                    var contentId = FirestoreApi.GetString(map, "contentId");

                    items.Add(new PlanItem(
                        FirestoreApi.GetString(map, "type"),
                        FirestoreApi.GetString(map, "title"),
                        FirestoreApi.GetString(map, "angle"),
                        FirestoreApi.GetString(map, "audience"),
                        points,
                        FirestoreApi.GetString(map, "instruction"),
                        FirestoreApi.GetString(map, "status", PlanItemStatus.Proposed),
                        contentId.Length > 0 ? contentId : null));
                }
            }

            if (items.All(i => i.Type != ContentTypes.Tutorial))
                items.Add(ComingSoonTutorial());

            return new PlanDocument(
                FirestoreApi.GetString(data, "status", PlanStatus.Draft),
                items,
                FirestoreApi.GetString(data, "llmProvider"),
                FirestoreApi.GetString(data, "model"),
                (int)FirestoreApi.GetLong(data, "version", 1));
        }
    }
}
