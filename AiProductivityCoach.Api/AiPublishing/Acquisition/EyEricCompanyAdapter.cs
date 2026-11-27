using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Google.Cloud.Firestore;
using AiProductivityCoach.Api.AiPublishing.Content;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Profile;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.AiPublishing.Acquisition
{
    /// <summary>
    /// Sends a provider to the real, live EY ERIC "companies" collection (see
    /// <c>CompanyController</c>/<c>AdminController</c>) as a private, non-public record: always
    /// created or kept in <c>moderationState = "draft"</c>, never approved and never given an
    /// <c>approvedSnapshot</c> - the two things the public provider page actually reads. Re-sending
    /// an already-sent provider updates the same company record in place (tracked via
    /// <c>eyEricCompanyId</c> on the provider) rather than creating duplicates.
    /// Only admin-approved or published content pieces are mirrored in: a draft/pending/rejected
    /// piece the admin has not signed off on never reaches the real system.
    /// </summary>
    public sealed class EyEricCompanyAdapter : ICompanyPublishAdapter
    {
        private static readonly string[] ContentStatusesSynced = { ContentStatus.Approved, ContentStatus.Published };

        private readonly FirestoreDb _firestore;

        public EyEricCompanyAdapter(FirestoreDb firestore)
        {
            _firestore = firestore;
        }

        public string Platform => Platforms.EyEric;

        private CollectionReference Companies => _firestore.Collection("companies");

        public async Task<CompanySendResult> SendAsync(string providerId, CancellationToken ct)
        {
            var providerRef = _firestore.Collection(AiCollections.Providers).Document(providerId);
            var providerDoc = await providerRef.GetSnapshotAsync(ct);
            if (!providerDoc.Exists)
                throw new InvalidOperationException("Provider not found.");

            var data = providerDoc.ToDictionary();
            var profile = ProfileFieldsMapper.Effective(data);
            var name = FirestoreApi.GetString(data, "name");

            var existingCompanyId = FirestoreApi.GetString(data, "eyEricCompanyId");
            var existingCompanyDoc = existingCompanyId.Length > 0
                ? await Companies.Document(existingCompanyId).GetSnapshotAsync(ct)
                : null;

            var created = existingCompanyDoc is not { Exists: true };
            var companyRef = created ? Companies.Document() : existingCompanyDoc!.Reference;
            var now = Timestamp.GetCurrentTimestamp();

            var slug = created
                ? await GenerateUniqueSlugAsync(Slugify(name), null, ct)
                : FirestoreApi.GetString(existingCompanyDoc!.ToDictionary(), "slug");

            var companyFields = new Dictionary<string, object>
            {
                ["name"] = name,
                ["shortDescription"] = profile.ShortDescription,
                ["websiteUrl"] = FirestoreApi.GetString(data, "website"),
                ["email"] = profile.Email,
                ["phone"] = profile.Phone,
                ["address"] = profile.Address,
                ["categories"] = profile.Categories,
                ["logoUrl"] = FirestoreApi.GetString(data, "logoUrl"),
                ["bannerUrl"] = FirestoreApi.GetString(data, "headerImageUrl"),
                ["sourcePlatform"] = Platform,
                ["sourceProviderId"] = providerId,
                ["updatedAt"] = now
            };

            if (created)
            {
                companyFields["slug"] = slug;
                companyFields["ownerUid"] = string.Empty; // unclaimed until a publisher account takes it over (acquisition phase)
                companyFields["status"] = "draft";
                companyFields["moderationState"] = "draft";
                companyFields["createdBy"] = "ai-publishing-admin";
                companyFields["createdAt"] = now;
                await companyRef.SetAsync(companyFields, cancellationToken: ct);
            }
            else
            {
                // Never touch moderationState/status/ownerUid here: a profile the admin already
                // reviewed, or a company a publisher has since claimed, keeps its own workflow state.
                await companyRef.UpdateAsync(companyFields, cancellationToken: ct);
            }

            await SaveAboutAsync(companyRef, profile, now, ct);
            var synced = await SyncContentAsync(companyRef, providerId, ct);

            await providerRef.UpdateAsync(new Dictionary<string, object>
            {
                ["eyEricCompanyId"] = companyRef.Id,
                ["eyEricSlug"] = slug,
                ["eyEricSentAt"] = now,
                ["eyEricSentCount"] = FieldValue.Increment(1)
            }, cancellationToken: ct);

            return new CompanySendResult(companyRef.Id, slug, created, synced);
        }

        public async Task<CompanySendStatus> GetStatusAsync(string providerId, CancellationToken ct)
        {
            var providerDoc = await _firestore.Collection(AiCollections.Providers).Document(providerId).GetSnapshotAsync(ct);
            if (!providerDoc.Exists) throw new InvalidOperationException("Provider not found.");

            var data = providerDoc.ToDictionary();
            var companyId = FirestoreApi.GetString(data, "eyEricCompanyId");

            return new CompanySendStatus(
                companyId.Length > 0,
                companyId,
                FirestoreApi.GetString(data, "eyEricSlug"),
                FirestoreApi.GetDate(data, "eyEricSentAt"));
        }

        private static async Task SaveAboutAsync(DocumentReference companyRef, ProfileFields profile, Timestamp now, CancellationToken ct)
        {
            var aboutRef = companyRef.Collection("about").Document("profile");
            var existing = await aboutRef.GetSnapshotAsync(ct);

            var aboutFields = new Dictionary<string, object>
            {
                ["headline"] = profile.Headline,
                ["overview"] = profile.Overview,
                ["foundedYear"] = profile.FoundedYear,
                ["employeeRange"] = profile.EmployeeRange,
                ["headquarters"] = profile.Headquarters,
                ["specialties"] = profile.Specialties,
                ["updatedAt"] = now
            };

            if (!existing.Exists)
            {
                aboutFields["mission"] = string.Empty;
                aboutFields["vision"] = string.Empty;
                aboutFields["createdAt"] = now;
                aboutFields["createdBy"] = "ai-publishing-admin";
            }

            await aboutRef.SetAsync(aboutFields, SetOptions.MergeAll, ct);
        }

        /// <summary>Mirrors every admin-approved/published piece into the matching company subcollection, by content type.</summary>
        private async Task<int> SyncContentAsync(DocumentReference companyRef, string providerId, CancellationToken ct)
        {
            var pieces = await _firestore.Collection(AiCollections.Content)
                .WhereEqualTo("providerId", providerId)
                .GetSnapshotAsync(ct);

            var synced = 0;

            foreach (var piece in pieces.Documents)
            {
                // Only the live (approved) version goes out; a pending edit waits for approval.
                var data = await Review.VersionApproval.LiveDataAsync(piece, ct);
                var status = FirestoreApi.GetString(data, "status");
                if (!ContentStatusesSynced.Contains(status)) continue;

                var collectionName = CollectionFor(FirestoreApi.GetString(data, "type"));
                if (collectionName == null) continue;

                var existing = await companyRef.Collection(collectionName)
                    .WhereEqualTo("sourceContentId", piece.Id)
                    .Limit(1)
                    .GetSnapshotAsync(ct);

                var targetRef = existing.Count > 0 ? existing.Documents[0].Reference : companyRef.Collection(collectionName).Document();
                var now = Timestamp.GetCurrentTimestamp();

                var fields = FieldsFor(collectionName, data);
                fields["sourceContentId"] = piece.Id;
                fields["updatedAt"] = now;
                if (existing.Count == 0)
                {
                    fields["createdAt"] = now;
                    fields["createdBy"] = "ai-publishing-admin";
                }

                await targetRef.SetAsync(fields, SetOptions.MergeAll, ct);
                synced++;
            }

            return synced;
        }

        public static string? CollectionFor(string contentType) => contentType switch
        {
            ContentTypes.Article => "posts",
            ContentTypes.Whitepaper => "whitepapers",
            ContentTypes.Webinar => "webinars",
            _ => null
        };

        private static Dictionary<string, object> FieldsFor(string collectionName, IDictionary<string, object> data)
        {
            var title = FirestoreApi.GetString(data, "title");
            var bodyHtml = FirestoreApi.GetString(data, "bodyHtml");
            var coverUrl = FirestoreApi.GetString(data, "coverUrl");
            var subtitle = FirestoreApi.GetString(data, "subtitle");

            return collectionName switch
            {
                "posts" => new Dictionary<string, object>
                {
                    ["title"] = title,
                    ["subHeading"] = subtitle,
                    ["excerpt"] = FirestoreApi.GetString(data, "excerpt"),
                    ["body"] = bodyHtml,
                    ["videoEmbedUrl"] = string.Empty,
                    ["imageUrl"] = coverUrl,
                    ["galleryMedia"] = new List<Dictionary<string, object>>(),
                    ["contentMedia"] = new List<Dictionary<string, object>>()
                },
                "whitepapers" => new Dictionary<string, object>
                {
                    ["title"] = title,
                    ["content"] = bodyHtml,
                    ["imageUrl"] = coverUrl
                },
                "webinars" => new Dictionary<string, object>
                {
                    ["title"] = title,
                    ["subTitle"] = subtitle,
                    ["content"] = bodyHtml,
                    ["speakerName"] = string.Empty,
                    ["bannerUrl"] = coverUrl,
                    ["speakerImageUrl"] = string.Empty
                },
                _ => new Dictionary<string, object>()
            };
        }

        // ───────────── slug (same style as CompanyController, kept local since that controller is publisher-scoped) ─────────────

        public static string Slugify(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return $"company-{Guid.NewGuid():N}"[..16];

            var normalized = value.Normalize(NormalizationForm.FormD);
            var builder = new StringBuilder();

            foreach (var ch in normalized)
            {
                if (CharUnicodeInfo.GetUnicodeCategory(ch) != UnicodeCategory.NonSpacingMark)
                    builder.Append(ch);
            }

            var withoutDiacritics = builder.ToString().Normalize(NormalizationForm.FormC).ToLowerInvariant();
            var slug = Regex.Replace(withoutDiacritics, @"[^a-z0-9]+", "-");
            slug = Regex.Replace(slug, @"-+", "-").Trim('-');

            return slug.Length > 0 ? slug : $"company-{Guid.NewGuid():N}"[..16];
        }

        private async Task<string> GenerateUniqueSlugAsync(string baseSlug, string? currentCompanyId, CancellationToken ct)
        {
            var candidate = baseSlug;
            var suffix = 2;

            while (true)
            {
                var existing = await Companies.WhereEqualTo("slug", candidate).Limit(5).GetSnapshotAsync(ct);

                var conflict = existing.Documents.Any(doc =>
                    string.IsNullOrWhiteSpace(currentCompanyId) || doc.Id != currentCompanyId);

                if (!conflict) return candidate;

                candidate = $"{baseSlug}-{suffix}";
                suffix++;
            }
        }
    }
}
