using System.Collections.Concurrent;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Google.Cloud.Firestore;
using AiProductivityCoach.Api.AiPublishing.Ai;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Knowledge;
using AiProductivityCoach.Api.AiPublishing.Security;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.AiPublishing.Jobs
{
    /// <summary>
    /// The research pipeline (spec sections 8-10):
    /// crawl sources -> extract text -> chunk + embed (company knowledge base) ->
    /// grounded AI profile -> knowledge readiness. Everything is stored below the provider.
    /// </summary>
    public sealed class ResearchJobHandler : IAiJobHandler
    {
        public const int MaxPagesPerRun = 40;
        public const int MaxChunksPerProvider = 500;
        private const int CrawlParallelism = 3;
        private const int ContextCharLimit = 24_000;

        private readonly FirestoreDb _firestore;
        private readonly SafeHttpFetcher _fetcher;
        private readonly OpenAiClient _openAi;
        private readonly KnowledgeStore _store;
        private readonly AiRunService _runs;
        private readonly AiAuditService _audit;
        private readonly ILogger<ResearchJobHandler> _logger;

        public ResearchJobHandler(
            FirestoreDb firestore,
            SafeHttpFetcher fetcher,
            OpenAiClient openAi,
            KnowledgeStore store,
            AiRunService runs,
            AiAuditService audit,
            ILogger<ResearchJobHandler> logger)
        {
            _firestore = firestore;
            _fetcher = fetcher;
            _openAi = openAi;
            _store = store;
            _runs = runs;
            _audit = audit;
            _logger = logger;
        }

        public string Type => JobTypes.Research;
        public string ActiveStatus => JobStatus.Researching;

        public static List<Dictionary<string, object>> InitialSteps() => new()
        {
            Step("crawl", "Quellen lesen", "Reading sources"),
            Step("index", "Wissensbasis aufbauen", "Building knowledge base"),
            Step("profile", "Anbieterprofil analysieren", "Analysing provider profile"),
            Step("readiness", "Wissensbereitschaft berechnen", "Calculating knowledge readiness"),
        };

        private static Dictionary<string, object> Step(string key, string de, string en) => new()
        {
            ["key"] = key, ["labelDe"] = de, ["labelEn"] = en, ["status"] = "pending"
        };

        // ───────────── internal models ─────────────

        private sealed class Crawled
        {
            public string Url = string.Empty;
            public string SourceId = string.Empty;
            public bool IsSeed;
            public FetchResult Meta = null!;
            public ExtractedPage? Page;
            public string? ErrorOverride;
        }

        public async Task<JobOutcome> RunAsync(JobContext context, CancellationToken cancellationToken)
        {
            var actor = TenantContext.SystemActor(context.Platform);
            var providerRef = _firestore.Collection(AiCollections.Providers).Document(context.ProviderId);
            var provider = await providerRef.GetSnapshotAsync(cancellationToken);

            if (!provider.Exists)
                return JobOutcome.Failed("provider_not_found", "Der Anbieter wurde nicht gefunden.", "The provider was not found.");

            if (!_openAi.IsConfigured)
                return JobOutcome.Failed("ai_not_configured", "Die KI ist nicht konfiguriert.", "The AI is not configured.");

            var providerName = provider.GetValue<string>("name");
            var language = FirestoreApi.GetString(provider.ToDictionary(), "defaultLanguage", "de");

            var sourceDocs = (await providerRef.Collection(AiCollections.Sources).GetSnapshotAsync(cancellationToken))
                .Documents
                .OrderByDescending(d => d.TryGetValue<bool>("isPrimary", out var p) && p)
                .ThenBy(d => FirestoreApi.GetDate(d.ToDictionary(), "createdAt") ?? DateTime.MinValue)
                .ToList();

            if (sourceDocs.Count == 0)
                return JobOutcome.Failed("no_sources", $"Für „{providerName}“ sind keine Quellen vorhanden.", $"No sources exist for \"{providerName}\".");

            await _audit.LogAsync(actor, AuditActions.ResearchStarted, context.ProviderId, null, null,
                new Dictionary<string, object> { ["jobId"] = context.JobId, ["sources"] = sourceDocs.Count });

            using var scope = new JobCancellationScope(context, cancellationToken);
            var ct = scope.Token;

            try
            {
                // ═════════ 1. CRAWL ═════════
                await context.ReportAsync(2, "crawl", "running", $"0/{sourceDocs.Count}");

                foreach (var source in sourceDocs)
                {
                    await source.Reference.UpdateAsync(new Dictionary<string, object>
                    {
                        ["status"] = SourceStatus.Checking,
                        ["updatedAt"] = Timestamp.GetCurrentTimestamp()
                    }, cancellationToken: ct);
                }

                var crawled = await CrawlAsync(context, sourceDocs, ct);
                ct.ThrowIfCancellationRequested();

                var seeds = crawled.Where(c => c.IsSeed).ToList();
                var seedsUnavailable = seeds.Count(c => !c.Meta.Ok);
                var okPages = crawled.Where(c => c.Page != null && c.Meta.Ok).ToList();

                await context.ReportAsync(45, "crawl", "done", $"{okPages.Count}");

                if (okPages.Count == 0 && (await _store.GetPagesAsync(context.ProviderId, ct)).Count == 0)
                {
                    await _audit.LogAsync(actor, AuditActions.ResearchFailed, context.ProviderId, null, null,
                        new Dictionary<string, object> { ["jobId"] = context.JobId, ["reason"] = "no_readable_content" });

                    return JobOutcome.Failed(
                        "no_readable_content",
                        $"Aus den Quellen von „{providerName}“ konnte kein lesbarer Text gewonnen werden. Bitte weitere Links hinzufügen.",
                        $"No readable text could be read from the sources of \"{providerName}\". Please add more links.");
                }

                // ═════════ 2. INDEX (chunk + embed) ═════════
                await context.SetStatusAsync(JobStatus.Indexing);
                await context.ReportAsync(46, "index", "running");

                var indexStats = await IndexAsync(context, crawled, ct);
                ct.ThrowIfCancellationRequested();

                await context.ReportAsync(70, "index", "done", $"{indexStats.ChunksTotal}");

                // ═════════ 3. PROFILE (grounded AI summary) ═════════
                await context.ReportAsync(72, "profile", "running");

                var chunks = await _store.LoadChunksAsync(context.ProviderId, ct);
                var profile = await BuildProfileAsync(context, chunks, language, ct);
                ct.ThrowIfCancellationRequested();

                await context.ReportAsync(88, "profile", profile != null ? "done" : "failed");

                // ═════════ 4. READINESS ═════════
                await context.ReportAsync(90, "readiness", "running");

                var allPages = await _store.GetPagesAsync(context.ProviderId, ct);

                var evidence = allPages.Values
                    .Where(p => FirestoreApi.GetString(p.ToDictionary(), "status") == "ok")
                    .Select(p =>
                    {
                        var d = p.ToDictionary();
                        var cats = p.TryGetValue<List<string>>("categories", out var list) ? list : new List<string>();
                        return new PageEvidence(FirestoreApi.GetString(d, "url"), cats.ToHashSet(), (int)FirestoreApi.GetLong(d, "textLength"));
                    })
                    .ToList();

                var productsFound = profile?.Products.Count ?? 0;
                var readiness = ReadinessEvaluator.Evaluate(evidence, productsFound);

                var okTotal = allPages.Values.Count(p => FirestoreApi.GetString(p.ToDictionary(), "status") == "ok");
                var unavailableTotal = allPages.Count - okTotal;

                var update = new Dictionary<string, object>
                {
                    ["readiness"] = ReadinessToMap(readiness),
                    ["pageSummary"] = new Dictionary<string, object>
                    {
                        ["total"] = allPages.Count,
                        ["ok"] = okTotal,
                        ["unavailable"] = unavailableTotal,
                        ["chunks"] = indexStats.ChunksTotal
                    },
                    ["knowledgeVersion"] = FieldValue.Increment(1),
                    ["knowledgeStale"] = false,
                    ["knowledgeUpdatedAt"] = Timestamp.GetCurrentTimestamp(),
                    ["lastResearchAt"] = Timestamp.GetCurrentTimestamp(),
                    ["updatedAt"] = Timestamp.GetCurrentTimestamp()
                };

                if (profile != null)
                    update["knowledgeProfile"] = ProfileToMap(profile);

                await providerRef.UpdateAsync(update, cancellationToken: ct);
                await RefreshSourceSummaryAsync(providerRef, ct);

                await context.ReportAsync(98, "readiness", "done", $"{readiness.Score}%");

                await _audit.LogAsync(actor, AuditActions.KnowledgeUpdated, context.ProviderId, null, null,
                    new Dictionary<string, object>
                    {
                        ["jobId"] = context.JobId,
                        ["pages"] = okTotal,
                        ["chunks"] = indexStats.ChunksTotal,
                        ["readiness"] = readiness.Score
                    });

                var result = new Dictionary<string, object>
                {
                    ["pages"] = okTotal,
                    ["chunks"] = indexStats.ChunksTotal,
                    ["readiness"] = readiness.Score,
                    ["profile"] = profile != null
                };

                await _audit.LogAsync(actor, AuditActions.ResearchCompleted, context.ProviderId, null, null,
                    new Dictionary<string, object> { ["jobId"] = context.JobId, ["readiness"] = readiness.Score });

                var summaryDe = $"Recherche für „{providerName}“ abgeschlossen: {okTotal} Seiten gelesen, {indexStats.ChunksTotal} Wissensabschnitte, Wissensbereitschaft {readiness.Score} %.";
                var summaryEn = $"Research for \"{providerName}\" finished: {okTotal} pages read, {indexStats.ChunksTotal} knowledge chunks, readiness {readiness.Score}%.";

                if (seedsUnavailable > 0 || profile == null)
                {
                    var notes = new List<string>();
                    var notesEn = new List<string>();
                    if (seedsUnavailable > 0) { notes.Add($"{seedsUnavailable} Quelle(n) nicht verfügbar"); notesEn.Add($"{seedsUnavailable} source(s) unavailable"); }
                    if (profile == null) { notes.Add("KI-Zusammenfassung nicht erstellt"); notesEn.Add("AI summary not created"); }

                    return JobOutcome.Partial(result,
                        seedsUnavailable > 0 ? "some_sources_unavailable" : "profile_unavailable",
                        summaryDe + " (" + string.Join(", ", notes) + ")",
                        summaryEn + " (" + string.Join(", ", notesEn) + ")");
                }

                return JobOutcome.Completed(result, summaryDe, summaryEn);
            }
            catch (OperationCanceledException) when (scope.Cancelled && !cancellationToken.IsCancellationRequested)
            {
                foreach (var source in sourceDocs)
                {
                    var current = await source.Reference.GetSnapshotAsync(CancellationToken.None);
                    if (current.Exists && current.GetValue<string>("status") == SourceStatus.Checking)
                        await source.Reference.UpdateAsync("status", SourceStatus.Pending);
                }

                return JobOutcome.Failed("cancelled", "Abgebrochen.", "Cancelled.");
            }
        }

        // ───────────────────────── CRAWL ─────────────────────────

        private async Task<List<Crawled>> CrawlAsync(JobContext context, List<DocumentSnapshot> sourceDocs, CancellationToken ct)
        {
            var results = new ConcurrentBag<Crawled>();
            var visited = new ConcurrentDictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
            var robotsCache = new ConcurrentDictionary<string, Lazy<Task<RobotsTxt>>>();
            var gate = new SemaphoreSlim(CrawlParallelism);
            var done = 0;
            var totalPlanned = sourceDocs.Count;
            var discoveryPlanned = false;

            // Seeds fill 4-10%; once the page list is known, all pages fill 10-44%.
            async Task Progress()
            {
                var finished = Interlocked.Increment(ref done);

                var pct = discoveryPlanned
                    ? 10 + (int)(34.0 * Math.Min(1.0, (double)finished / Math.Max(1, totalPlanned)))
                    : 4 + (int)(6.0 * Math.Min(1.0, (double)finished / Math.Max(1, sourceDocs.Count)));

                await context.ReportAsync(pct, "crawl", "running", $"{finished}/{totalPlanned}");
            }

            Task<RobotsTxt> Robots(string url)
            {
                var uri = new Uri(url);
                var key = uri.Scheme + "://" + uri.Host;
                return robotsCache.GetOrAdd(key, k => new Lazy<Task<RobotsTxt>>(async () =>
                {
                    var text = await _fetcher.FetchTextAsync(k + "/robots.txt", ct);
                    return RobotsTxt.Parse(text);
                })).Value;
            }

            async Task<Crawled> One(string url, string sourceId, bool isSeed, string seedHost)
            {
                await gate.WaitAsync(ct);
                try
                {
                    var robots = await Robots(url);
                    var uri = new Uri(url);

                    FetchResult meta;
                    ExtractedPage? page = null;
                    string? errorOverride = null;

                    if (!robots.IsAllowed(uri.PathAndQuery))
                    {
                        meta = new FetchResult(false, null, url, null, null, null, null, 0, "blocked_by_robots");
                        errorOverride = "blocked_by_robots";
                    }
                    else
                    {
                        var doc = await _fetcher.FetchDocumentAsync(url, ct);
                        meta = doc.Meta;

                        if (!isSeed && meta.Ok && !CrawlUrlRules.IsSameSite(new Uri(meta.FinalUrl).Host, seedHost))
                        {
                            // A redirect left the provider's own site: do not learn from it.
                            meta = new FetchResult(false, meta.HttpStatus, meta.FinalUrl, meta.ContentType, null, null, null, 0, "unsafe_url");
                        }
                        else if (doc.Body != null)
                        {
                            page = HtmlTextExtractor.Extract(doc.Body, new Uri(meta.FinalUrl));
                        }
                    }

                    await Task.Delay(300, ct); // politeness delay per slot
                    return new Crawled { Url = url, SourceId = sourceId, IsSeed = isSeed, Meta = meta, Page = page, ErrorOverride = errorOverride };
                }
                finally
                {
                    gate.Release();
                }
            }

            // ── A) seed sources (the links the admin entered) ──
            var seedTasks = sourceDocs.Select(async source =>
            {
                var url = source.GetValue<string>("url");
                visited.TryAdd(NormalizeKey(url), true);

                var seedHost = new Uri(url).Host;
                var crawl = await One(url, source.Id, true, seedHost);
                results.Add(crawl);

                // Update the source row exactly like the quick check does.
                var ok = crawl.Meta.Ok;
                await source.Reference.UpdateAsync(new Dictionary<string, object>
                {
                    ["status"] = ok ? SourceStatus.Available : SourceStatus.Unavailable,
                    ["httpStatus"] = crawl.Meta.HttpStatus ?? 0,
                    ["errorCode"] = crawl.Meta.ErrorCode ?? string.Empty,
                    ["title"] = crawl.Page?.Title ?? crawl.Meta.Title ?? string.Empty,
                    ["language"] = crawl.Page?.Language ?? crawl.Meta.Language ?? string.Empty,
                    ["contentType"] = crawl.Meta.ContentType ?? string.Empty,
                    ["contentHash"] = crawl.Page?.Hash ?? crawl.Meta.Hash ?? string.Empty,
                    ["textLength"] = crawl.Page?.Text.Length ?? crawl.Meta.TextLength,
                    ["finalUrl"] = crawl.Meta.FinalUrl,
                    ["checkedAt"] = Timestamp.GetCurrentTimestamp(),
                    ["updatedAt"] = Timestamp.GetCurrentTimestamp()
                }, cancellationToken: ct);

                await Progress();
                return crawl;
            }).ToList();

            var seedResults = await Task.WhenAll(seedTasks);
            ct.ThrowIfCancellationRequested();

            // ── B) discovery: expand homepage-type sources via sitemap and menu links ──
            var discovered = new List<(string Url, string SourceId, string Host, int Score)>();
            var seedBudget = Math.Max(0, MaxPagesPerRun - seedResults.Length);

            foreach (var seed in seedResults.Where(s => s.Meta.Ok && s.Page != null))
            {
                var sourceDoc = sourceDocs.First(d => d.Id == seed.SourceId);
                var type = FirestoreApi.GetString(sourceDoc.ToDictionary(), "type");
                if (type != SourceTypes.Homepage) continue;

                var origin = new Uri(seed.Url);
                var seedHost = origin.Host;
                var robots = await Robots(seed.Url);

                var candidates = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                foreach (var link in seed.Page!.Links)
                    candidates.Add(link);

                foreach (var sitemapUrl in await DiscoverSitemapUrlsAsync(origin, robots, ct))
                    candidates.Add(sitemapUrl);

                foreach (var candidate in candidates)
                {
                    var normalized = CrawlUrlRules.NormalizeCandidate(candidate, seedHost);
                    if (normalized == null) continue;
                    if (!robots.IsAllowed(new Uri(normalized).PathAndQuery)) continue;
                    if (!visited.TryAdd(NormalizeKey(normalized), true)) continue;

                    discovered.Add((normalized, seed.SourceId, seedHost, CrawlUrlRules.Score(normalized, seed.Page.Language)));
                }
            }

            var byUrl = discovered
                .GroupBy(d => d.Url, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

            var homepageLanguage = seedResults.FirstOrDefault(s => s.Page?.Language != null)?.Page?.Language;

            var selected = CrawlUrlRules
                .SelectDiverse(discovered.Select(d => d.Url), seedBudget, homepageLanguage)
                .Select(url => byUrl[url])
                .ToList();

            totalPlanned = sourceDocs.Count + selected.Count;
            discoveryPlanned = true;
            await context.ReportAsync(10, "crawl", "running", $"{done}/{totalPlanned}");

            // ── C) fetch the discovered pages ──
            var pageTasks = selected.Select(async item =>
            {
                var crawl = await One(item.Url, item.SourceId, false, item.Host);
                results.Add(crawl);
                await Progress();
            }).ToList();

            await Task.WhenAll(pageTasks);

            // Seeds first, then discovered pages (stable order for later steps).
            return seedResults.Concat(results.Where(r => !r.IsSeed)).ToList();
        }

        private async Task<List<string>> DiscoverSitemapUrlsAsync(Uri origin, RobotsTxt robots, CancellationToken ct)
        {
            var baseUrl = origin.GetLeftPart(UriPartial.Authority);
            var queue = new Queue<string>();

            foreach (var declared in robots.Sitemaps)
            {
                if (Uri.TryCreate(declared, UriKind.Absolute, out var u) && CrawlUrlRules.IsSameSite(u.Host, origin.Host))
                    queue.Enqueue(declared);
            }

            if (queue.Count == 0)
            {
                queue.Enqueue(baseUrl + "/sitemap.xml");
                queue.Enqueue(baseUrl + "/sitemap_index.xml");
            }

            var urls = new List<string>();
            var seenSitemaps = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var fetched = 0;

            while (queue.Count > 0 && fetched < 6 && urls.Count < 3000)
            {
                var sitemapUrl = queue.Dequeue();
                if (!seenSitemaps.Add(sitemapUrl)) continue;

                fetched++;
                var xml = await _fetcher.FetchTextAsync(sitemapUrl, ct);
                if (xml == null) continue;

                var parsed = SitemapParser.Parse(xml);
                urls.AddRange(parsed.PageUrls);

                foreach (var child in parsed.ChildSitemaps)
                {
                    if (Uri.TryCreate(child, UriKind.Absolute, out var cu) &&
                        CrawlUrlRules.IsSameSite(cu.Host, origin.Host) &&
                        !child.EndsWith(".gz", StringComparison.OrdinalIgnoreCase))
                        queue.Enqueue(child);
                }
            }

            return urls;
        }

        private static string NormalizeKey(string url) =>
            (UrlSafety.Normalize(url).Normalized ?? url).TrimEnd('/').ToLowerInvariant();

        // ───────────────────────── INDEX ─────────────────────────

        private sealed record IndexStats(int ChunksTotal, int PagesIndexed, int PagesReused);

        private async Task<IndexStats> IndexAsync(JobContext context, List<Crawled> crawled, CancellationToken ct)
        {
            var existing = await _store.GetPagesAsync(context.ProviderId, ct);
            var now = Timestamp.GetCurrentTimestamp();

            var toEmbed = new List<(Crawled Item, string PageId, List<TextChunk> Chunks, List<string> Categories, bool HadChunks)>();
            var reused = 0;
            var totalChunks = existing.Values.Sum(p => (int)FirestoreApi.GetLong(p.ToDictionary(), "chunkCount"));
            var seenPageIds = new HashSet<string>();

            // Page documents are written in parallel after the loop (Firestore latency adds up).
            var pending = new List<(string PageId, Dictionary<string, object> Data)>();
            void Queue(string pid, Dictionary<string, object> data, CancellationToken _ = default) => pending.Add((pid, data));

            foreach (var item in crawled)
            {
                var finalKey = NormalizeKey(item.Meta.FinalUrl);
                var pageId = KnowledgeStore.PageId(finalKey);

                if (!seenPageIds.Add(pageId)) continue; // redirect duplicate

                existing.TryGetValue(pageId, out var old);
                var oldChunks = old != null ? (int)FirestoreApi.GetLong(old.ToDictionary(), "chunkCount") : 0;

                if (item.Page == null || !item.Meta.Ok)
                {
                    var error = item.ErrorOverride ?? item.Meta.ErrorCode ?? "http_error";

                    if (old != null && oldChunks > 0)
                    {
                        // Keep what was learned earlier; only note the failed refresh.
                        Queue(pageId, new Dictionary<string, object>
                        {
                            ["lastError"] = error,
                            ["lastAttemptAt"] = now
                        }, ct);
                    }
                    else
                    {
                        Queue(pageId, new Dictionary<string, object>
                        {
                            ["url"] = item.Meta.FinalUrl,
                            ["sourceId"] = item.SourceId,
                            ["isSeed"] = item.IsSeed,
                            ["status"] = "unavailable",
                            ["errorCode"] = error,
                            ["httpStatus"] = item.Meta.HttpStatus ?? 0,
                            ["chunkCount"] = 0,
                            ["textLength"] = item.Meta.TextLength,
                            ["categories"] = new List<string>(),
                            ["lastAttemptAt"] = now,
                            ["updatedAt"] = now
                        }, ct);
                    }

                    continue;
                }

                var page = item.Page;
                var categories = PageClassifier.Classify(item.Meta.FinalUrl, page.Title, page.Text).ToList();

                var baseData = new Dictionary<string, object>
                {
                    ["url"] = item.Meta.FinalUrl,
                    ["sourceId"] = item.SourceId,
                    ["isSeed"] = item.IsSeed,
                    ["status"] = "ok",
                    ["errorCode"] = string.Empty,
                    ["lastError"] = FieldValue.Delete,
                    ["httpStatus"] = item.Meta.HttpStatus ?? 0,
                    ["title"] = page.Title,
                    ["description"] = page.Description ?? string.Empty,
                    ["language"] = page.Language ?? string.Empty,
                    ["hash"] = page.Hash,
                    ["textLength"] = page.Text.Length,
                    ["categories"] = categories,
                    ["fetchedAt"] = now,
                    ["updatedAt"] = now
                };

                var unchanged = old != null &&
                                FirestoreApi.GetString(old.ToDictionary(), "hash") == page.Hash &&
                                oldChunks > 0 &&
                                FirestoreApi.GetString(old.ToDictionary(), "status") == "ok";

                if (unchanged)
                {
                    // Same content as last time: keep the existing chunks and embeddings (saves AI cost).
                    Queue(pageId, baseData, ct);
                    reused++;
                    continue;
                }

                var chunks = TextChunker.Chunk(page.Title, page.Text);
                totalChunks -= oldChunks;

                if (chunks.Count == 0)
                {
                    await _store.DeleteChunksForPageAsync(context.ProviderId, pageId, ct);
                    baseData["chunkCount"] = 0;
                    Queue(pageId, baseData, ct);
                    continue;
                }

                if (totalChunks + chunks.Count > MaxChunksPerProvider)
                {
                    baseData["chunkCount"] = oldChunks;
                    baseData["lastError"] = "chunk_limit";
                    Queue(pageId, baseData, ct);
                    totalChunks += oldChunks;
                    continue;
                }

                totalChunks += chunks.Count;
                baseData["chunkCount"] = chunks.Count;
                toEmbed.Add((item, pageId, chunks, categories, oldChunks > 0));
                // The new hash and chunk count are written only after the embeddings succeeded,
                // so a failed run is retried instead of leaving stale chunks marked "up to date".
                var interim = new Dictionary<string, object>(baseData) { ["chunkCount"] = oldChunks };
                interim.Remove("hash");
                Queue(pageId, interim, ct);
            }

            await ForEachParallelAsync(pending, 6,
                item => _store.UpsertPageAsync(context.ProviderId, item.PageId, item.Data, ct), ct);

            var indexed = 0;

            if (toEmbed.Count > 0)
            {
                var texts = toEmbed
                    .SelectMany(entry => entry.Chunks.Select(c => $"{entry.Item.Page!.Title}\n{c.Heading}\n{c.Text}"))
                    .ToList();

                var started = DateTime.UtcNow;
                EmbeddingResult embedding;

                try
                {
                    embedding = await _openAi.EmbedAsync(texts, ct);
                }
                catch (OpenAiException ex)
                {
                    await _runs.RecordAsync(context.ProviderId, context.JobId, "embedding", _openAi.EmbeddingModel, "failed",
                        started, 0, 0, texts.Count, ex.Message);
                    throw;
                }

                await _runs.RecordAsync(context.ProviderId, context.JobId, "embedding", _openAi.EmbeddingModel, "completed",
                    started, embedding.TotalTokens, 0, texts.Count);

                // Slice the vectors per page up front, then write the pages in parallel.
                var slices = new List<(int Index, int Offset)>();
                var running = 0;
                for (var i = 0; i < toEmbed.Count; i++)
                {
                    slices.Add((i, running));
                    running += toEmbed[i].Chunks.Count;
                }

                await context.ReportAsync(52, "index", "running", $"0/{toEmbed.Count}");

                await ForEachParallelAsync(slices, 5, async slice =>
                {
                    var entry = toEmbed[slice.Index];
                    var vectors = embedding.Vectors.Skip(slice.Offset).Take(entry.Chunks.Count).ToList();

                    await _store.ReplaceChunksAsync(
                        context.ProviderId, entry.PageId, entry.Item.SourceId, entry.Item.Meta.FinalUrl,
                        entry.Item.Page!.Title, entry.Chunks, vectors, _openAi.EmbeddingModel, entry.HadChunks, ct);

                    await _store.UpsertPageAsync(context.ProviderId, entry.PageId, new Dictionary<string, object>
                    {
                        ["chunkCount"] = entry.Chunks.Count,
                        ["hash"] = entry.Item.Page!.Hash,
                        ["indexedAt"] = Timestamp.GetCurrentTimestamp()
                    }, ct);

                    var finished = Interlocked.Increment(ref indexed);
                    await context.ReportAsync(52 + (int)(18.0 * finished / toEmbed.Count), "index", "running", $"{finished}/{toEmbed.Count}");
                }, ct);
            }

            var finalPages = await _store.GetPagesAsync(context.ProviderId, ct);
            var total = finalPages.Values.Sum(p => (int)FirestoreApi.GetLong(p.ToDictionary(), "chunkCount"));

            return new IndexStats(total, indexed, reused);
        }

        private static async Task ForEachParallelAsync<T>(
            IEnumerable<T> items,
            int parallelism,
            Func<T, Task> body,
            CancellationToken ct)
        {
            using var gate = new SemaphoreSlim(parallelism);

            var tasks = items.Select(async item =>
            {
                await gate.WaitAsync(ct);
                try { await body(item); }
                finally { gate.Release(); }
            }).ToList();

            await Task.WhenAll(tasks);
        }

        // ───────────────────────── PROFILE ─────────────────────────

        public sealed record ProductInfo(string Name, string Summary);

        public sealed record ProviderProfile(
            string Description,
            List<ProductInfo> Products,
            List<string> Topics,
            List<string> Industries,
            string Email,
            string Phone,
            string Address,
            bool HasSoftwareProduct,
            string Model);

        private static readonly string[] ProfileQueries =
        {
            "Über das Unternehmen, Mission, Geschichte und Standort",
            "Produkte, Software und Lösungen des Unternehmens",
            "Produktname, Eigenentwicklung, Software-Produkt im Überblick",
            "Kontakt, Adresse, E-Mail und Telefon",
            "Branchen, Zielgruppen, Kunden und Referenzen"
        };

        private async Task<ProviderProfile?> BuildProfileAsync(
            JobContext context,
            List<StoredChunk> chunks,
            string language,
            CancellationToken ct)
        {
            if (chunks.Count == 0) return null;

            try
            {
                var started = DateTime.UtcNow;
                var queryEmbedding = await _openAi.EmbedAsync(ProfileQueries, ct);

                await _runs.RecordAsync(context.ProviderId, context.JobId, "embedding", _openAi.EmbeddingModel, "completed",
                    started, queryEmbedding.TotalTokens, 0, ProfileQueries.Length);

                var picked = SelectProfileChunks(chunks, queryEmbedding.Vectors);

                var context_ = new StringBuilder();
                foreach (var chunk in picked)
                {
                    var block = $"[Quelle: {chunk.Url}]\n{chunk.Text}\n\n---\n\n";
                    if (context_.Length + block.Length > ContextCharLimit) break;
                    context_.Append(block);
                }

                var excerpts = context_.ToString();
                var outputLanguage = language == "en" ? "English" : "Deutsch";

                var system =
                    "Du bist ein sorgfältiger Recherche-Assistent für B2B-Anbieterprofile. " +
                    "Verwende AUSSCHLIESSLICH Informationen, die wörtlich in den Textauszügen stehen. " +
                    "Erfinde nichts: keine Produkte, Kunden, Zahlen, Zertifizierungen oder Kontaktdaten. " +
                    "Wenn etwas nicht in den Auszügen vorkommt, gib ein leeres Feld bzw. eine leere Liste zurück. " +
                    "Antworte ausschließlich mit einem JSON-Objekt.";

                var user =
                    $"Ausgabesprache: {outputLanguage}\n\n" +
                    "Textauszüge der Anbieter-Website:\n\n" + excerpts + "\n\n" +
                    "Erstelle dieses JSON:\n" +
                    "{\n" +
                    "  \"companyDescription\": \"2-3 sachliche Sätze, nur aus den Auszügen\",\n" +
                    "  \"products\": [{\"name\": \"Produktname laut Text\", \"summary\": \"1 Satz laut Text\"}],\n" +
                    "  \"topics\": [\"Themenschwerpunkte\"],\n" +
                    "  \"industries\": [\"Zielbranchen, falls genannt\"],\n" +
                    "  \"contact\": {\"email\": \"\", \"phone\": \"\", \"address\": \"\"},\n" +
                    "  \"hasSoftwareProduct\": false\n" +
                    "}";

                started = DateTime.UtcNow;
                ChatResult chat;

                try
                {
                    chat = await _openAi.ChatJsonAsync(system, user, 900, ct);
                }
                catch (OpenAiException ex)
                {
                    await _runs.RecordAsync(context.ProviderId, context.JobId, "profile", _openAi.AnalysisModel, "failed",
                        started, 0, 0, 1, ex.Message);
                    throw;
                }

                await _runs.RecordAsync(context.ProviderId, context.JobId, "profile", _openAi.AnalysisModel, "completed",
                    started, chat.PromptTokens, chat.CompletionTokens, 1);

                return ParseProfile(chat.Content, excerpts, _openAi.AnalysisModel);
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                // The profile is a bonus: the knowledge base is still valid without it.
                _logger.LogWarning(ex, "[Research] Profile step failed for {ProviderId}.", context.ProviderId);
                return null;
            }
        }

        /// <summary>
        /// Chooses the excerpts the AI summary is built from: the homepage opening, the first chunk
        /// of every shallow product page (so product NAMES are always present), and the best
        /// semantic hits for company, contact and reference questions.
        /// </summary>
        public static List<StoredChunk> SelectProfileChunks(
            IReadOnlyList<StoredChunk> chunks,
            IReadOnlyList<double[]> queryVectors,
            int hitsPerQuery = 4,
            int maxProductPages = 20)
        {
            var picked = new List<StoredChunk>();
            var seen = new HashSet<string>();

            void Add(StoredChunk chunk)
            {
                if (seen.Add(chunk.Id)) picked.Add(chunk);
            }

            // Order matters: the context is cut at the end when it gets too long, so the
            // essentials (identity, contact, references) come first and product pages last.
            foreach (var chunk in chunks.Where(c => IsHomepage(c.Url)).OrderBy(c => c.Id).Take(2))
                Add(chunk);

            foreach (var vector in queryVectors)
            {
                foreach (var hit in KnowledgeSearchService.Rank(chunks, vector, hitsPerQuery))
                    Add(chunks.First(c => c.Id == hit.ChunkId));
            }

            // Pages below /produkte/... are the actual products, so they rank before general product-ish pages.
            var productPages = chunks
                .Where(c => c.Id.EndsWith("_000", StringComparison.Ordinal))
                .Select(c => (Chunk: c, Depth: Depth(c.Url), Detail: IsProductDetail(c.Url)))
                .Where(x => x.Depth is >= 1 and <= 2 &&
                            PageClassifier.Classify(x.Chunk.Url, x.Chunk.Title, string.Empty).Contains(KnowledgeCategories.Products))
                .OrderByDescending(x => x.Detail)
                .ThenBy(x => x.Depth)
                .ThenBy(x => x.Chunk.Url, StringComparer.Ordinal)
                .Take(maxProductPages);

            foreach (var page in productPages)
                Add(page.Chunk);

            return picked;
        }

        private static bool IsProductDetail(string url)
        {
            if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return false;

            var segments = uri.AbsolutePath.Split('/', StringSplitOptions.RemoveEmptyEntries);
            return segments.Length == 2 &&
                   (segments[0].StartsWith("produkt", StringComparison.OrdinalIgnoreCase) ||
                    segments[0].StartsWith("product", StringComparison.OrdinalIgnoreCase));
        }

        private static int Depth(string url) =>
            Uri.TryCreate(url, UriKind.Absolute, out var uri)
                ? uri.AbsolutePath.Split('/', StringSplitOptions.RemoveEmptyEntries).Length
                : 0;

        private static bool IsHomepage(string url)
        {
            if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return false;
            return uri.AbsolutePath is "" or "/";
        }

        /// <summary>Parses and VERIFIES the AI answer: anything not backed by the excerpts is dropped.</summary>
        public static ProviderProfile? ParseProfile(string json, string excerpts, string model)
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                string Str(JsonElement el, string name, int max)
                {
                    if (!el.TryGetProperty(name, out var v) || v.ValueKind != JsonValueKind.String) return string.Empty;
                    var text = Regex.Replace(v.GetString() ?? string.Empty, @"<[^>]+>", " ");
                    text = Regex.Replace(text, @"[\p{C}]", " ");
                    text = Regex.Replace(text, @"\s+", " ").Trim();
                    return text.Length > max ? text[..max].TrimEnd() : text;
                }

                List<string> StrList(JsonElement el, string name, int maxItems, int maxLen)
                {
                    var list = new List<string>();
                    if (!el.TryGetProperty(name, out var arr) || arr.ValueKind != JsonValueKind.Array) return list;

                    foreach (var item in arr.EnumerateArray())
                    {
                        if (item.ValueKind != JsonValueKind.String) continue;
                        var text = Regex.Replace(item.GetString() ?? string.Empty, @"<[^>]+>|[\p{C}]", " ");
                        text = Regex.Replace(text, @"\s+", " ").Trim();
                        if (text.Length > 0 && list.Count < maxItems && !list.Contains(text, StringComparer.OrdinalIgnoreCase))
                            list.Add(text.Length > maxLen ? text[..maxLen] : text);
                    }

                    return list;
                }

                var lowerExcerpts = excerpts.ToLowerInvariant();
                var excerptDigits = new string(excerpts.Where(char.IsDigit).ToArray());

                var products = new List<ProductInfo>();
                if (root.TryGetProperty("products", out var prodArr) && prodArr.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in prodArr.EnumerateArray())
                    {
                        if (item.ValueKind != JsonValueKind.Object) continue;

                        var name = Str(item, "name", 80);
                        // Never keep a product whose name does not appear in the sources.
                        if (name.Length < 2 || !lowerExcerpts.Contains(name.ToLowerInvariant())) continue;
                        if (products.Count >= 12 || products.Any(p => p.Name.Equals(name, StringComparison.OrdinalIgnoreCase))) continue;

                        products.Add(new ProductInfo(name, Str(item, "summary", 240)));
                    }
                }

                var email = string.Empty;
                var phone = string.Empty;
                var address = string.Empty;

                if (root.TryGetProperty("contact", out var contact) && contact.ValueKind == JsonValueKind.Object)
                {
                    var e = Str(contact, "email", 120);
                    if (e.Length > 0 && lowerExcerpts.Contains(e.ToLowerInvariant())) email = e;

                    var ph = Str(contact, "phone", 40);
                    var phDigits = new string(ph.Where(char.IsDigit).ToArray());
                    if (phDigits.Length >= 6 && excerptDigits.Contains(phDigits)) phone = ph;

                    var ad = Str(contact, "address", 200);
                    if (ad.Length >= 12 && lowerExcerpts.Contains(ad[..Math.Min(ad.Length, 15)].ToLowerInvariant())) address = ad;
                }

                var description = Str(root, "companyDescription", 600);
                var hasSoftware = root.TryGetProperty("hasSoftwareProduct", out var sw) && sw.ValueKind == JsonValueKind.True;

                return new ProviderProfile(
                    description, products,
                    StrList(root, "topics", 12, 80), StrList(root, "industries", 12, 80),
                    email, phone, address, hasSoftware, model);
            }
            catch (JsonException)
            {
                return null;
            }
        }

        // ───────────────────────── persistence helpers ─────────────────────────

        private static Dictionary<string, object> ProfileToMap(ProviderProfile profile) => new()
        {
            ["description"] = profile.Description,
            ["products"] = profile.Products.Select(p => new Dictionary<string, object>
            {
                ["name"] = p.Name, ["summary"] = p.Summary
            }).ToList(),
            ["topics"] = profile.Topics,
            ["industries"] = profile.Industries,
            ["contact"] = new Dictionary<string, object>
            {
                ["email"] = profile.Email, ["phone"] = profile.Phone, ["address"] = profile.Address
            },
            ["hasSoftwareProduct"] = profile.HasSoftwareProduct,
            ["model"] = profile.Model,
            ["generatedAt"] = Timestamp.GetCurrentTimestamp()
        };

        private static Dictionary<string, object> ReadinessToMap(ReadinessResult result) => new()
        {
            ["score"] = result.Score,
            ["categories"] = result.Categories.Select(c => new Dictionary<string, object>
            {
                ["key"] = c.Key, ["status"] = c.Status, ["evidence"] = c.Evidence,
                ["needed"] = c.Needed, ["weight"] = c.Weight
            }).ToList(),
            ["recommendations"] = result.Recommendations.Select(r => new Dictionary<string, object>
            {
                ["code"] = r.Code, ["category"] = r.Category
            }).ToList(),
            ["gates"] = result.Gates.ToDictionary(
                g => g.Key,
                g => (object)new Dictionary<string, object>
                {
                    ["state"] = g.Value.State, ["reasons"] = g.Value.Reasons.ToList()
                }),
            ["evaluatedAt"] = Timestamp.GetCurrentTimestamp()
        };

        private static async Task RefreshSourceSummaryAsync(DocumentReference providerRef, CancellationToken ct)
        {
            var all = await providerRef.Collection(AiCollections.Sources).GetSnapshotAsync(ct);

            int Count(string s) => all.Documents.Count(d => d.GetValue<string>("status") == s);

            await providerRef.UpdateAsync(new Dictionary<string, object>
            {
                ["sourceCount"] = all.Count,
                ["sourceSummary"] = new Dictionary<string, object>
                {
                    ["total"] = all.Count,
                    ["available"] = Count(SourceStatus.Available),
                    ["unavailable"] = Count(SourceStatus.Unavailable)
                },
                ["lastSourceCheckAt"] = Timestamp.GetCurrentTimestamp()
            }, cancellationToken: ct);
        }
    }
}
