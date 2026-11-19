namespace AiProductivityCoach.Api.AiPublishing.Media
{
    /// <summary>
    /// The illustrative images a whitepaper PDF embeds are the same per-draft image gallery the
    /// admin's own "Add media" button fills (<see cref="MediaStore"/>/<see cref="MediaGenerationService"/>)
    /// - not a separate pipeline. If the piece has none yet, one is generated on first use and then
    /// reused by every later PDF (download or MIDRANGE sync) for that same piece.
    /// </summary>
    public sealed class WhitepaperDiagramService
    {
        private const int MaxDiagramsPerPdf = 2;

        private readonly MediaStore _media;
        private readonly MediaGenerationService _generation;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ILogger<WhitepaperDiagramService> _logger;

        public WhitepaperDiagramService(
            MediaStore media, MediaGenerationService generation, IHttpClientFactory httpClientFactory, ILogger<WhitepaperDiagramService> logger)
        {
            _media = media;
            _generation = generation;
            _httpClientFactory = httpClientFactory;
            _logger = logger;
        }

        public async Task<List<byte[]>> GetOrGenerateAsync(string contentId, CancellationToken ct)
        {
            var images = new List<byte[]>();
            if (string.IsNullOrWhiteSpace(contentId)) return images;

            try
            {
                var existing = await _media.ListAsync(contentId);

                if (existing.Count == 0 && _generation.IsConfigured)
                {
                    // Best-effort: a whitepaper with no illustrations yet gets exactly one, not two,
                    // to keep first-download latency reasonable; later downloads reuse it instantly.
                    await _generation.GenerateAsync(contentId, instruction: null, createdBy: "ai-publishing-system", jobId: null, step: null, ct);
                    existing = await _media.ListAsync(contentId);
                }

                var client = _httpClientFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(10);

                foreach (var item in existing.Take(MaxDiagramsPerPdf))
                {
                    var url = item.TryGetValue("url", out var rawUrl) ? rawUrl?.ToString() : null;
                    if (string.IsNullOrWhiteSpace(url)) continue;

                    try
                    {
                        images.Add(await client.GetByteArrayAsync(url, ct));
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "[WhitepaperDiagrams] Could not fetch image {Url} for {ContentId}.", url, contentId);
                    }
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // Diagrams are a nice-to-have on top of the PDF, never a reason to fail generating
                // or sending it at all.
                _logger.LogWarning(ex, "[WhitepaperDiagrams] Could not get/generate diagrams for {ContentId}.", contentId);
            }

            return images;
        }
    }
}
