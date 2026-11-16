using System.Net.Http.Json;
using Google.Cloud.Firestore;
using AiProductivityCoach.Api.AiPublishing.Content;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Profile;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.AiPublishing.Acquisition
{
    /// <summary>
    /// Sends a provider to the real MIDRANGE WordPress site via its REST API, using the
    /// "AI Publishing Connector Auth" plugin installed there (custom X-API-Key header, plus a
    /// lookup endpoint for create-or-update-in-place). Writes are always to a draft "Company" post
    /// (post type <c>aipc_company</c>) - nothing here publishes it on the live site; that stays a
    /// separate, deliberate action on the WordPress side. Only admin-approved or published content
    /// pieces are mirrored in, same rule as <see cref="EyEricCompanyAdapter"/>.
    /// </summary>
    public sealed class MidrangeCompanyAdapter : ICompanyPublishAdapter
    {
        private static readonly string[] ContentStatusesSynced = { ContentStatus.Approved, ContentStatus.Published };

        private readonly FirestoreDb _firestore;
        private readonly HttpClient _http;

        public MidrangeCompanyAdapter(FirestoreDb firestore, IHttpClientFactory httpClientFactory)
        {
            _firestore = firestore;
            _http = httpClientFactory.CreateClient(MidrangeOptions.HttpClientName);
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

            var existingId = await LookupAsync("aipc_company", "aipc_source_provider_id", providerId, ct);
            var created = existingId == null;

            var meta = new Dictionary<string, object?>
            {
                ["aipc_source_provider_id"] = providerId,
                ["aipc_source_platform"] = "ai-publishing",
                ["aipc_short_description"] = profile.ShortDescription,
                ["aipc_website_url"] = FirestoreApi.GetString(data, "website"),
                ["aipc_email"] = profile.Email,
                ["aipc_phone"] = profile.Phone,
                ["aipc_address"] = profile.Address,
                ["aipc_logo_url"] = FirestoreApi.GetString(data, "logoUrl"),
                ["aipc_banner_url"] = FirestoreApi.GetString(data, "headerImageUrl"),
                ["aipc_headline"] = profile.Headline,
                ["aipc_overview"] = profile.Overview,
                ["aipc_founded_year"] = profile.FoundedYear,
                ["aipc_employee_range"] = profile.EmployeeRange,
                ["aipc_headquarters"] = profile.Headquarters,
                ["aipc_categories"] = profile.Categories,
                ["aipc_specialties"] = profile.Specialties
            };

            var payload = new Dictionary<string, object?> { ["title"] = name, ["meta"] = meta };
            if (created) payload["status"] = "draft";

            var post = created
                ? await CreateAsync("aipc-companies", payload, ct)
                : await UpdateAsync("aipc-companies", existingId!.Value, payload, ct);

            var synced = await SyncContentAsync(providerId, post.Id, ct);
            var now = Timestamp.GetCurrentTimestamp();

            await providerRef.UpdateAsync(new Dictionary<string, object>
            {
                ["midrangeCompanyId"] = post.Id.ToString(),
                ["midrangeSlug"] = post.Slug ?? string.Empty,
                ["midrangeSentAt"] = now,
                ["midrangeSentCount"] = FieldValue.Increment(1)
            }, cancellationToken: ct);

            return new CompanySendResult(post.Id.ToString(), post.Slug ?? string.Empty, created, synced);
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
                FirestoreApi.GetString(data, "midrangeSlug"),
                FirestoreApi.GetDate(data, "midrangeSentAt"));
        }

        /// <summary>Mirrors every admin-approved/published piece into the matching WordPress post type.</summary>
        private async Task<int> SyncContentAsync(string providerId, int companyPostId, CancellationToken ct)
        {
            var pieces = await _firestore.Collection(AiCollections.Content)
                .WhereEqualTo("providerId", providerId)
                .GetSnapshotAsync(ct);

            var synced = 0;

            foreach (var piece in pieces.Documents)
            {
                var data = piece.ToDictionary();
                var status = FirestoreApi.GetString(data, "status");
                if (!ContentStatusesSynced.Contains(status)) continue;

                var contentType = FirestoreApi.GetString(data, "type");
                var restBase = RestBaseFor(contentType);
                var postType = PostTypeFor(contentType);
                if (restBase == null) continue;

                var existingId = await LookupAsync(postType, "aipc_source_content_id", piece.Id, ct);

                var meta = new Dictionary<string, object?>
                {
                    ["aipc_source_content_id"] = piece.Id,
                    ["aipc_source_provider_id"] = providerId,
                    ["aipc_source_platform"] = "ai-publishing",
                    ["aipc_company_id"] = companyPostId.ToString()
                };

                var payload = new Dictionary<string, object?>
                {
                    ["title"] = FirestoreApi.GetString(data, "title"),
                    ["content"] = FirestoreApi.GetString(data, "bodyHtml"),
                    ["meta"] = meta
                };
                if (existingId == null) payload["status"] = "draft";

                if (existingId == null)
                    await CreateAsync(restBase, payload, ct);
                else
                    await UpdateAsync(restBase, existingId.Value, payload, ct);

                synced++;
            }

            return synced;
        }

        public static string? RestBaseFor(string contentType) => contentType switch
        {
            ContentTypes.Article => "posts",
            ContentTypes.Whitepaper => "aipc-whitepapers",
            ContentTypes.Webinar => "aipc-webinars",
            _ => null
        };

        public static string PostTypeFor(string contentType) => contentType switch
        {
            ContentTypes.Article => "post",
            ContentTypes.Whitepaper => "aipc_whitepaper",
            ContentTypes.Webinar => "aipc_webinar",
            _ => string.Empty
        };

        // ───────────── WordPress REST calls ─────────────

        private sealed record LookupResponse(bool Found, int? Id);

        private sealed record WpPostResponse(int Id, string? Slug, string? Link);

        private async Task<int?> LookupAsync(string postType, string metaKey, string metaValue, CancellationToken ct)
        {
            var url = $"/wp-json/aipc/v1/lookup?type={Uri.EscapeDataString(postType)}&metaKey={Uri.EscapeDataString(metaKey)}&metaValue={Uri.EscapeDataString(metaValue)}";
            using var response = await _http.GetAsync(url, ct);
            response.EnsureSuccessStatusCode();

            var result = await response.Content.ReadFromJsonAsync<LookupResponse>(cancellationToken: ct);
            return result is { Found: true } ? result.Id : null;
        }

        private async Task<WpPostResponse> CreateAsync(string restBase, object payload, CancellationToken ct)
        {
            using var response = await _http.PostAsJsonAsync($"/wp-json/wp/v2/{restBase}", payload, ct);
            response.EnsureSuccessStatusCode();

            return await response.Content.ReadFromJsonAsync<WpPostResponse>(cancellationToken: ct)
                ?? throw new InvalidOperationException("WordPress did not return the created post.");
        }

        private async Task<WpPostResponse> UpdateAsync(string restBase, int id, object payload, CancellationToken ct)
        {
            using var response = await _http.PostAsJsonAsync($"/wp-json/wp/v2/{restBase}/{id}", payload, ct);
            response.EnsureSuccessStatusCode();

            return await response.Content.ReadFromJsonAsync<WpPostResponse>(cancellationToken: ct)
                ?? throw new InvalidOperationException("WordPress did not return the updated post.");
        }
    }
}
