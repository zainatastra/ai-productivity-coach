using System.Text.RegularExpressions;
using Google.Cloud.Firestore;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Security;

namespace AiProductivityCoach.Api.AiPublishing.Services
{
    public sealed record CreateProviderResult(bool Ok, string? Code, string? ProviderId);

    /// <summary>
    /// Creates one provider (the record plus its website as primary source). One place for the rules, so the
    /// single "create provider" form and the CSV import can never drift apart.
    /// </summary>
    public sealed class ProviderCreationService
    {
        public const int MaxNameLength = 160;

        private readonly FirestoreDb _firestore;
        private readonly AiAuditService _audit;

        public ProviderCreationService(FirestoreDb firestore, AiAuditService audit)
        {
            _firestore = firestore;
            _audit = audit;
        }

        private CollectionReference Providers => _firestore.Collection(AiCollections.Providers);

        public static string CleanName(string? value) => Regex.Replace(value ?? string.Empty, @"\s+", " ").Trim();

        /// <summary>The first problem with a name, or null.</summary>
        public static string? NameProblem(string cleanName) =>
            cleanName.Length < 2 ? "provider_name_required" : cleanName.Length > MaxNameLength ? "provider_name_too_long" : null;

        public async Task<bool> WebsiteInUseAsync(string host, string? excludeProviderId)
        {
            // "www.example.com" and "example.com" are the same website.
            var bare = host.StartsWith("www.", StringComparison.Ordinal) ? host[4..] : host;
            var variants = new[] { bare, "www." + bare };

            var snapshot = await Providers.WhereIn("websiteHost", variants).GetSnapshotAsync();

            return snapshot.Documents.Any(doc =>
                doc.Id != excludeProviderId &&
                FirestoreApi.GetString(doc.ToDictionary(), "status") != ProviderStatus.Archived);
        }

        /// <summary>The websites (without "www.") of every provider that is not archived, for checking a whole file at once.</summary>
        public async Task<HashSet<string>> ExistingHostsAsync()
        {
            var snapshot = await Providers.GetSnapshotAsync();
            var hosts = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var doc in snapshot.Documents)
            {
                var data = doc.ToDictionary();
                if (FirestoreApi.GetString(data, "status") == ProviderStatus.Archived) continue;

                var host = FirestoreApi.GetString(data, "websiteHost");
                if (host.Length > 0) hosts.Add(host.StartsWith("www.", StringComparison.Ordinal) ? host[4..] : host);
            }

            return hosts;
        }

        public async Task<string> UniqueSlugAsync(string baseSlug)
        {
            if (string.IsNullOrWhiteSpace(baseSlug)) baseSlug = "provider";

            var candidate = baseSlug;
            var suffix = 2;

            while ((await Providers.WhereEqualTo("slug", candidate).Limit(1).GetSnapshotAsync()).Count > 0)
            {
                candidate = $"{baseSlug}-{suffix}";
                suffix++;
            }

            return candidate;
        }

        public static Dictionary<string, object> NewSource(string url, string type, string userId, bool isPrimary)
        {
            var now = Timestamp.GetCurrentTimestamp();

            return new Dictionary<string, object>
            {
                ["url"] = url,
                ["normalizedUrl"] = url,
                ["type"] = type,
                ["isPrimary"] = isPrimary,
                ["status"] = SourceStatus.Pending,
                ["title"] = string.Empty,
                ["httpStatus"] = 0,
                ["errorCode"] = string.Empty,
                ["language"] = string.Empty,
                ["addedBy"] = userId,
                ["createdAt"] = now,
                ["updatedAt"] = now
            };
        }

        public async Task<CreateProviderResult> CreateAsync(Security.TenantContext actor, string? rawName, string? rawWebsite)
        {
            var name = CleanName(rawName);

            var nameProblem = NameProblem(name);
            if (nameProblem != null) return new(false, nameProblem, null);

            var website = UrlSafety.Normalize(rawWebsite);
            if (!website.Ok) return new(false, website.Error!, null);

            if (await WebsiteInUseAsync(website.Host!, null)) return new(false, "provider_website_exists", null);

            var slug = await UniqueSlugAsync(SlugHelper.Create(name));
            var now = Timestamp.GetCurrentTimestamp();
            var providerRef = Providers.Document();

            await providerRef.SetAsync(new Dictionary<string, object>
            {
                ["name"] = name,
                ["slug"] = slug,
                ["website"] = website.Normalized!,
                ["websiteHost"] = website.Host!,
                ["status"] = ProviderStatus.Created,
                ["publisherType"] = "company",
                ["defaultLanguage"] = "de",
                ["createdBy"] = actor.UserId,
                ["createdOnPlatform"] = actor.Platform,
                ["sourceCount"] = 1,
                ["sourceSummary"] = new Dictionary<string, object> { ["total"] = 1, ["available"] = 0, ["unavailable"] = 0 },
                ["createdAt"] = now,
                ["updatedAt"] = now
            });

            // The website itself is the first (primary) source.
            await providerRef.Collection(AiCollections.Sources).Document().SetAsync(
                NewSource(website.Normalized!, SourceTypes.Homepage, actor.UserId, isPrimary: true));

            await _audit.LogAsync(actor, AuditActions.ProviderCreated, providerRef.Id, null, null,
                new Dictionary<string, object> { ["name"] = name, ["website"] = website.Normalized! });

            return new(true, null, providerRef.Id);
        }
    }
}
