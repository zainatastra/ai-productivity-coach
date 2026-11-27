using System.Net.Http.Json;
using Google.Cloud.Firestore;
using AiProductivityCoach.Api.AiPublishing.Content;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Pdf;
using AiProductivityCoach.Api.AiPublishing.Profile;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.AiPublishing.Acquisition
{
    /// <summary>
    /// Sends a provider to the real MIDRANGE WordPress site via its REST API, using the
    /// "AI Publishing Connector" plugin installed there (custom X-API-Key header, plus two
    /// write endpoints: /wp-json/aipc/v1/anbieter and /wp-json/aipc/v1/content).
    ///
    /// This writes into MIDRANGE's own, pre-existing "anbieter" (Provider) post type and its real
    /// ACF fields - not a post type of our own. Whitepaper/webinar sync intentionally leaves their
    /// real-world artifact fields blank (a real PDF file, a real scheduled date and meeting link);
    /// MIDRANGE's whitepaper/webinar are real documents/events, which our content engine does not
    /// produce yet (the PDF side is a separate, later phase) - only the text content and the link
    /// back to the provider are synced for now, by the user's explicit choice.
    ///
    /// Always created as a draft, and the real site's own approval flag (anbieter_freigegeben) is
    /// always left at "0" and never touched again on update - the client's own moderation stays in
    /// control, same rule as <see cref="EyEricCompanyAdapter"/>.
    /// </summary>
    public sealed class MidrangeCompanyAdapter : ICompanyPublishAdapter
    {
        private static readonly string[] ContentStatusesSynced = { ContentStatus.Approved, ContentStatus.Published };

        private readonly FirestoreDb _firestore;
        private readonly HttpClient _http;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Media.WhitepaperDiagramService _diagrams;
        private readonly ILogger<MidrangeCompanyAdapter> _logger;

        public MidrangeCompanyAdapter(
            FirestoreDb firestore, IHttpClientFactory httpClientFactory, Media.WhitepaperDiagramService diagrams, ILogger<MidrangeCompanyAdapter> logger)
        {
            _firestore = firestore;
            _http = httpClientFactory.CreateClient(MidrangeOptions.HttpClientName);
            _httpClientFactory = httpClientFactory;
            _diagrams = diagrams;
            _logger = logger;
        }

        public string Platform => Platforms.Midrange;

        public async Task<CompanySendResult> SendAsync(string providerId, CancellationToken ct)
        {
            var providerRef = _firestore.Collection(AiCollections.Providers).Document(providerId);
            var providerDoc = await providerRef.GetSnapshotAsync(ct);
            if (!providerDoc.Exists) throw new InvalidOperationException("Provider not found.");

            var data = providerDoc.ToDictionary();
            var profile = ProfileFieldsMapper.Effective(data);
            var name = FirestoreApi.GetString(data, "name");

            var payload = new Dictionary<string, object?>
            {
                ["sourceProviderId"] = providerId,
                ["name"] = name,
                ["shortDescription"] = profile.ShortDescription,
                ["overview"] = profile.Overview,
                ["website"] = FirestoreApi.GetString(data, "website"),
                ["email"] = profile.Email,
                ["phone"] = profile.Phone,
                ["address"] = profile.Address,
                ["categories"] = profile.Categories,
                ["logoUrl"] = FirestoreApi.GetString(data, "logoUrl"),
                ["bannerUrl"] = FirestoreApi.GetString(data, "headerImageUrl")
            };

            var result = await PostAsync("/wp-json/aipc/v1/anbieter", payload, ct);
            var synced = await SyncContentAsync(providerId, result.Id, name, FirestoreApi.GetString(data, "logoUrl"), ct);
            var now = Timestamp.GetCurrentTimestamp();

            await providerRef.UpdateAsync(new Dictionary<string, object>
            {
                ["midrangeCompanyId"] = result.Id.ToString(),
                ["midrangeSentAt"] = now,
                ["midrangeSentCount"] = FieldValue.Increment(1)
            }, cancellationToken: ct);

            return new CompanySendResult(result.Id.ToString(), string.Empty, result.Created, synced);
        }

        public sealed record LinkUserResult(int UserId, bool Created, string Email, string? ResetUrl);

        /// <summary>
        /// Links this provider to a real WordPress user by email, so that person can log in
        /// (midrange.de/login-2/) and manage their own profile - the same mechanism every
        /// pre-existing real provider already uses. Admin-triggered only, from a company contact
        /// already accepted through the AI Publishing engine's own invitation flow; never automatic.
        /// </summary>
        public async Task<LinkUserResult> LinkUserAsync(string providerId, string email, CancellationToken ct)
        {
            var providerRef = _firestore.Collection(AiCollections.Providers).Document(providerId);
            var providerDoc = await providerRef.GetSnapshotAsync(ct);
            if (!providerDoc.Exists) throw new InvalidOperationException("Provider not found.");

            var data = providerDoc.ToDictionary();
            var companyId = FirestoreApi.GetString(data, "midrangeCompanyId");
            if (companyId.Length == 0)
                throw new InvalidOperationException("Send this provider to MIDRANGE before granting access.");

            var result = await PostAsync<LinkUserResponse>(
                $"/wp-json/aipc/v1/anbieter/{companyId}/link-user",
                new Dictionary<string, object?> { ["email"] = email },
                ct);

            await providerRef.UpdateAsync(new Dictionary<string, object>
            {
                ["midrangeUserLinkedEmail"] = email,
                ["midrangeUserLinkedAt"] = Timestamp.GetCurrentTimestamp()
            }, cancellationToken: ct);

            return new LinkUserResult(result.UserId, result.Created, result.Email, result.ResetUrl);
        }

        public async Task<CompanySendStatus> GetStatusAsync(string providerId, CancellationToken ct)
        {
            var providerDoc = await _firestore.Collection(AiCollections.Providers).Document(providerId).GetSnapshotAsync(ct);
            if (!providerDoc.Exists) throw new InvalidOperationException("Provider not found.");

            var data = providerDoc.ToDictionary();
            var companyId = FirestoreApi.GetString(data, "midrangeCompanyId");

            return new CompanySendStatus(
                companyId.Length > 0,
                companyId,
                string.Empty,
                FirestoreApi.GetDate(data, "midrangeSentAt"));
        }

        /// <summary>Mirrors every admin-approved/published piece into the matching real post type, linked to its provider.</summary>
        private async Task<int> SyncContentAsync(string providerId, int anbieterId, string companyName, string? logoUrl, CancellationToken ct)
        {
            var pieces = await _firestore.Collection(AiCollections.Content)
                .WhereEqualTo("providerId", providerId)
                .GetSnapshotAsync(ct);

            var synced = 0;
            byte[]? logoBytes = null;
            var logoFetchAttempted = false;

            foreach (var piece in pieces.Documents)
            {
                // Only the live (approved) version goes out; a pending edit waits for approval.
                var data = await Review.VersionApproval.LiveDataAsync(piece, ct);
                var status = FirestoreApi.GetString(data, "status");
                if (!ContentStatusesSynced.Contains(status)) continue;

                var contentType = FirestoreApi.GetString(data, "type");
                if (!ContentTypes.IsGeneratable(contentType)) continue;

                var title = FirestoreApi.GetString(data, "title");
                var bodyHtml = FirestoreApi.GetString(data, "bodyHtml");

                var payload = new Dictionary<string, object?>
                {
                    ["type"] = contentType,
                    ["sourceContentId"] = piece.Id,
                    ["sourceProviderId"] = providerId,
                    ["anbieterId"] = anbieterId,
                    ["title"] = title,
                    ["excerpt"] = FirestoreApi.GetString(data, "excerpt"),
                    ["bodyHtml"] = bodyHtml
                };

                if (contentType == ContentTypes.Whitepaper)
                {
                    if (!logoFetchAttempted)
                    {
                        logoFetchAttempted = true;
                        logoBytes = await TryFetchLogoAsync(logoUrl, ct);
                    }

                    try
                    {
                        var diagrams = await _diagrams.GetOrGenerateAsync(piece.Id, ct);

                        // The real document MIDRANGE expects for whitepaper_pdf, not a personalized
                        // per-lead copy (no recipient to watermark for yet) - generic copy-restriction
                        // only, same as any other master file on their site.
                        var pdfBytes = WhitepaperPdfService.Generate(new WhitepaperPdfRequest(
                            CompanyName: companyName,
                            WhitepaperTitle: title,
                            BodyHtml: bodyHtml,
                            LogoBytes: logoBytes,
                            WatermarkText: null,
                            DiagramImages: diagrams,
                            Restricted: true,
                            AccentColor: BrandColorExtractor.ExtractAccentColor(logoBytes)), _logger);

                        payload["pdfBase64"] = Convert.ToBase64String(pdfBytes);
                        payload["pdfFileName"] = $"{SlugifyFileName(title)}.pdf";
                    }
                    catch (Exception ex)
                    {
                        // The text content sync must still go through even if the PDF render fails -
                        // the client can always fill whitepaper_pdf manually, same as before this phase.
                        _logger.LogWarning(ex, "[Midrange] Could not render the whitepaper PDF for {ContentId}; syncing text only.", piece.Id);
                    }
                }

                await PostAsync("/wp-json/aipc/v1/content", payload, ct);
                synced++;
            }

            return synced;
        }

        private async Task<byte[]?> TryFetchLogoAsync(string? logoUrl, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(logoUrl)) return null;

            try
            {
                using var client = _httpClientFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(25);
                return await client.GetByteArrayAsync(logoUrl, ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[Midrange] Could not fetch the provider logo for the whitepaper PDF header.");
                return null;
            }
        }

        private static string SlugifyFileName(string title)
        {
            var slug = new string((title ?? string.Empty).Select(c => char.IsLetterOrDigit(c) ? c : '-').ToArray());
            while (slug.Contains("--")) slug = slug.Replace("--", "-");
            slug = slug.Trim('-');
            return string.IsNullOrEmpty(slug) ? "whitepaper" : slug;
        }

        private sealed record WriteResponse(int Id, bool Created);
        private sealed record LinkUserResponse(int UserId, bool Created, string Email, string? ResetUrl);

        private Task<WriteResponse> PostAsync(string path, object payload, CancellationToken ct) =>
            PostAsync<WriteResponse>(path, payload, ct);

        private async Task<T> PostAsync<T>(string path, object payload, CancellationToken ct)
        {
            using var response = await _http.PostAsJsonAsync(path, payload, ct);
            response.EnsureSuccessStatusCode();

            return await response.Content.ReadFromJsonAsync<T>(cancellationToken: ct)
                ?? throw new InvalidOperationException("WordPress did not return the expected response.");
        }
    }
}
