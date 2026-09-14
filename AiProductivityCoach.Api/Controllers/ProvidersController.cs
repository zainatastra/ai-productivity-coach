using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Google.Cloud.Firestore;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace AiProductivityCoach.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ProvidersController : ControllerBase
    {
        private readonly FirestoreDb _firestore;

        public ProvidersController(FirestoreDb firestore)
        {
            _firestore = firestore;
        }

        // =====================================================
        // 🌍 PUBLIC PROVIDER DIRECTORY
        // Returns ONLY administrator-approved snapshot data.
        // =====================================================
        [HttpGet]
        [AllowAnonymous]
        public async Task<IActionResult> GetProviders()
        {
            var snapshot = await _firestore
                .Collection("companies")
                .WhereEqualTo("status", "published")
                .GetSnapshotAsync();

            var providers = new List<Dictionary<string, object?>>();

            Response.Headers.CacheControl = "public,max-age=60,stale-while-revalidate=300";

            foreach (var doc in snapshot.Documents)
            {
                var data = doc.ToDictionary();

                if (!IsPubliclyVisible(data))
                    continue;

                if (!TryGetApprovedSnapshot(data, out var approvedSnapshot))
                    continue;

                if (!TryGetMap(approvedSnapshot, "company", out var company))
                    continue;

                var slug = GetString(company, "slug");
                var name = GetString(company, "name");

                if (string.IsNullOrWhiteSpace(slug) || string.IsNullOrWhiteSpace(name))
                    continue;

                var about = TryGetMap(approvedSnapshot, "about", out var aboutMap)
                    ? aboutMap
                    : new Dictionary<string, object>();

                providers.Add(new Dictionary<string, object?>
                {
                    ["id"] = doc.Id,
                    ["name"] = name,
                    ["slug"] = slug,
                    ["shortDescription"] = GetString(company, "shortDescription"),
                    ["websiteUrl"] = GetString(company, "websiteUrl"),
                    ["address"] = GetString(company, "address"),
                    ["categories"] = GetStringList(company, "categories"),
                    ["logoUrl"] = GetString(company, "logoUrl"),
                    ["bannerUrl"] = GetString(company, "bannerUrl"),
                    ["headline"] = GetString(about, "headline"),
                    ["headquarters"] = GetString(about, "headquarters"),
                    ["specialties"] = GetStringList(about, "specialties"),
                    ["approvedVersion"] = GetLong(data, "approvedVersion"),
                    ["approvedAt"] = GetTimestampIso(data, "approvedAt")
                });
            }

            return Ok(providers
                .OrderBy(provider => provider["name"]?.ToString(), StringComparer.OrdinalIgnoreCase)
                .ToList());
        }

        // =====================================================
        // 🌍 PUBLIC PROVIDER PROFILE
        // Looks up by APPROVED slug and exposes ONLY snapshot.
        // =====================================================
        [HttpGet("{slug}")]
        [AllowAnonymous]
        public async Task<IActionResult> GetProviderBySlug(string slug)
        {
            var normalizedSlug = slug?.Trim().ToLowerInvariant() ?? string.Empty;

            if (string.IsNullOrWhiteSpace(normalizedSlug))
                return BadRequest(new { message = "Provider slug is required." });

            // We intentionally query only published companies first, then match
            // against the slug stored inside approvedSnapshot.company.
            // This prevents draft/current company data from becoming public.
            var snapshot = await _firestore
                .Collection("companies")
                .WhereEqualTo("status", "published")
                .GetSnapshotAsync();

            Response.Headers.CacheControl = "public,max-age=60,stale-while-revalidate=300";

            foreach (var doc in snapshot.Documents)
            {
                var data = doc.ToDictionary();

                if (!IsPubliclyVisible(data))
                    continue;

                if (!TryGetApprovedSnapshot(data, out var approvedSnapshot))
                    continue;

                if (!TryGetMap(approvedSnapshot, "company", out var company))
                    continue;

                var approvedSlug = GetString(company, "slug");

                if (!string.Equals(
                        approvedSlug,
                        normalizedSlug,
                        StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var posts = EnsurePublicPostSlugs(
                    GetListOfMaps(approvedSnapshot, "posts"));

                var response = new Dictionary<string, object?>
                {
                    ["id"] = doc.Id,
                    ["approvedVersion"] = GetLong(data, "approvedVersion"),
                    ["approvedAt"] = GetTimestampIso(data, "approvedAt"),
                    ["company"] = ConvertForApi(company),
                    ["about"] = TryGetMap(approvedSnapshot, "about", out var about)
                        ? ConvertForApi(about)
                        : new Dictionary<string, object?>(),
                    ["posts"] = posts,
                    ["whitepapers"] = EnsurePublicWhitepaperSlugs(
                        GetListOfMaps(approvedSnapshot, "whitepapers")),
                    ["products"] = GetListOfMaps(approvedSnapshot, "products"),
                    ["contacts"] = GetListOfMaps(approvedSnapshot, "contacts"),
                    ["appointments"] = GetListOfMaps(approvedSnapshot, "appointments"),
                    ["webinars"] = EnsurePublicWebinarSlugs(
                        GetListOfMaps(approvedSnapshot, "webinars")),
                    ["events"] = GetListOfMaps(approvedSnapshot, "events")
                };

                return Ok(response);
            }

            return NotFound(new { message = "Provider profile not found." });
        }


        // =====================================================
        // 🌍 PUBLIC APPROVED POST
        // Dedicated article endpoint sourced only from approvedSnapshot.
        // =====================================================
        [HttpGet("{slug}/posts/{postSlug}")]
        [AllowAnonymous]
        public async Task<IActionResult> GetApprovedPost(string slug, string postSlug)
        {
            var normalizedSlug = slug?.Trim().ToLowerInvariant() ?? string.Empty;
            var requestedPostKey = postSlug?.Trim() ?? string.Empty;
            var normalizedPostSlug = requestedPostKey.ToLowerInvariant();

            if (string.IsNullOrWhiteSpace(normalizedSlug) ||
                string.IsNullOrWhiteSpace(requestedPostKey))
            {
                return BadRequest(new { message = "Provider slug and post slug are required." });
            }

            var snapshot = await _firestore
                .Collection("companies")
                .WhereEqualTo("status", "published")
                .GetSnapshotAsync();

            Response.Headers.CacheControl = "public,max-age=60,stale-while-revalidate=300";

            foreach (var doc in snapshot.Documents)
            {
                var data = doc.ToDictionary();

                if (!IsPubliclyVisible(data) ||
                    !TryGetApprovedSnapshot(data, out var approvedSnapshot) ||
                    !TryGetMap(approvedSnapshot, "company", out var company))
                {
                    continue;
                }

                if (!string.Equals(
                        GetString(company, "slug"),
                        normalizedSlug,
                        StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var posts = EnsurePublicPostSlugs(
                    GetListOfMaps(approvedSnapshot, "posts"));

                var post = posts.FirstOrDefault(item =>
                {
                    var itemSlug = GetNullableString(item, "slug");
                    var itemId = GetNullableString(item, "id");

                    return string.Equals(
                               itemSlug,
                               normalizedPostSlug,
                               StringComparison.OrdinalIgnoreCase) ||
                           string.Equals(
                               itemId,
                               requestedPostKey,
                               StringComparison.Ordinal);
                });

                if (post == null)
                    return NotFound(new { message = "Post not found." });

                var resolvedPostSlug = GetNullableString(post, "slug");
                var resolvedPostId = GetNullableString(post, "id");

                var about = TryGetMap(approvedSnapshot, "about", out var aboutMap)
                    ? ConvertForApi(aboutMap)
                    : new Dictionary<string, object?>();

                var relatedPosts = posts
                    .Where(item =>
                        !string.Equals(
                            GetNullableString(item, "slug"),
                            resolvedPostSlug,
                            StringComparison.OrdinalIgnoreCase) &&
                        !string.Equals(
                            GetNullableString(item, "id"),
                            resolvedPostId,
                            StringComparison.Ordinal))
                    .Take(3)
                    .ToList();

                return Ok(new Dictionary<string, object?>
                {
                    ["providerId"] = doc.Id,
                    ["approvedVersion"] = GetLong(data, "approvedVersion"),
                    ["approvedAt"] = GetTimestampIso(data, "approvedAt"),
                    ["company"] = ConvertForApi(company),
                    ["about"] = about,
                    ["post"] = post,
                    ["canonicalPostSlug"] = resolvedPostSlug,
                    ["relatedPosts"] = relatedPosts
                });
            }

            return NotFound(new { message = "Provider profile not found." });
        }


        // =====================================================
        // 🌍 PUBLIC APPROVED WHITEPAPER
        // Dedicated whitepaper endpoint sourced only from approvedSnapshot.
        // =====================================================
        [HttpGet("{slug}/whitepapers/{whitepaperSlug}")]
        [AllowAnonymous]
        public async Task<IActionResult> GetApprovedWhitepaper(
            string slug,
            string whitepaperSlug)
        {
            var normalizedSlug = slug?.Trim().ToLowerInvariant() ?? string.Empty;
            var requestedWhitepaperKey = whitepaperSlug?.Trim() ?? string.Empty;
            var normalizedWhitepaperSlug = requestedWhitepaperKey.ToLowerInvariant();

            if (string.IsNullOrWhiteSpace(normalizedSlug) ||
                string.IsNullOrWhiteSpace(requestedWhitepaperKey))
            {
                return BadRequest(new
                {
                    message = "Provider slug and whitepaper slug are required."
                });
            }

            var snapshot = await _firestore
                .Collection("companies")
                .WhereEqualTo("status", "published")
                .GetSnapshotAsync();

            Response.Headers.CacheControl = "public,max-age=60,stale-while-revalidate=300";

            foreach (var doc in snapshot.Documents)
            {
                var data = doc.ToDictionary();

                if (!IsPubliclyVisible(data) ||
                    !TryGetApprovedSnapshot(data, out var approvedSnapshot) ||
                    !TryGetMap(approvedSnapshot, "company", out var company))
                {
                    continue;
                }

                if (!string.Equals(
                        GetString(company, "slug"),
                        normalizedSlug,
                        StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var whitepapers = EnsurePublicWhitepaperSlugs(
                    GetListOfMaps(approvedSnapshot, "whitepapers"));

                var whitepaper = whitepapers.FirstOrDefault(item =>
                {
                    var itemSlug = GetNullableString(item, "slug");
                    var itemId = GetNullableString(item, "id");

                    return string.Equals(
                               itemSlug,
                               normalizedWhitepaperSlug,
                               StringComparison.OrdinalIgnoreCase) ||
                           string.Equals(
                               itemId,
                               requestedWhitepaperKey,
                               StringComparison.Ordinal);
                });

                if (whitepaper == null)
                    return NotFound(new { message = "Whitepaper not found." });

                var resolvedWhitepaperSlug = GetNullableString(whitepaper, "slug");

                var about = TryGetMap(approvedSnapshot, "about", out var aboutMap)
                    ? ConvertForApi(aboutMap)
                    : new Dictionary<string, object?>();

                return Ok(new Dictionary<string, object?>
                {
                    ["providerId"] = doc.Id,
                    ["approvedVersion"] = GetLong(data, "approvedVersion"),
                    ["approvedAt"] = GetTimestampIso(data, "approvedAt"),
                    ["company"] = ConvertForApi(company),
                    ["about"] = about,
                    ["whitepaper"] = whitepaper,
                    ["canonicalWhitepaperSlug"] = resolvedWhitepaperSlug
                });
            }

            return NotFound(new { message = "Provider profile not found." });
        }


        // =====================================================
        // 🌍 PUBLIC APPROVED WEBINAR
        // Dedicated webinar endpoint sourced only from approvedSnapshot.
        // =====================================================
        [HttpGet("{slug}/webinars/{webinarSlug}")]
        [AllowAnonymous]
        public async Task<IActionResult> GetApprovedWebinar(
            string slug,
            string webinarSlug)
        {
            var normalizedSlug = slug?.Trim().ToLowerInvariant() ?? string.Empty;
            var requestedWebinarKey = webinarSlug?.Trim() ?? string.Empty;
            var normalizedWebinarSlug = requestedWebinarKey.ToLowerInvariant();

            if (string.IsNullOrWhiteSpace(normalizedSlug) ||
                string.IsNullOrWhiteSpace(requestedWebinarKey))
            {
                return BadRequest(new
                {
                    message = "Provider slug and webinar slug are required."
                });
            }

            var snapshot = await _firestore
                .Collection("companies")
                .WhereEqualTo("status", "published")
                .GetSnapshotAsync();

            Response.Headers.CacheControl = "public,max-age=60,stale-while-revalidate=300";

            foreach (var doc in snapshot.Documents)
            {
                var data = doc.ToDictionary();

                if (!IsPubliclyVisible(data) ||
                    !TryGetApprovedSnapshot(data, out var approvedSnapshot) ||
                    !TryGetMap(approvedSnapshot, "company", out var company))
                {
                    continue;
                }

                if (!string.Equals(
                        GetString(company, "slug"),
                        normalizedSlug,
                        StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var webinars = EnsurePublicWebinarSlugs(
                    GetListOfMaps(approvedSnapshot, "webinars"));

                var webinar = webinars.FirstOrDefault(item =>
                {
                    var itemSlug = GetNullableString(item, "slug");
                    var itemId = GetNullableString(item, "id");

                    return string.Equals(
                               itemSlug,
                               normalizedWebinarSlug,
                               StringComparison.OrdinalIgnoreCase) ||
                           string.Equals(
                               itemId,
                               requestedWebinarKey,
                               StringComparison.Ordinal);
                });

                if (webinar == null)
                    return NotFound(new { message = "Webinar not found." });

                var resolvedWebinarSlug = GetNullableString(webinar, "slug");

                var about = TryGetMap(approvedSnapshot, "about", out var aboutMap)
                    ? ConvertForApi(aboutMap)
                    : new Dictionary<string, object?>();

                return Ok(new Dictionary<string, object?>
                {
                    ["providerId"] = doc.Id,
                    ["approvedVersion"] = GetLong(data, "approvedVersion"),
                    ["approvedAt"] = GetTimestampIso(data, "approvedAt"),
                    ["company"] = ConvertForApi(company),
                    ["about"] = about,
                    ["webinar"] = webinar,
                    ["canonicalWebinarSlug"] = resolvedWebinarSlug
                });
            }

            return NotFound(new { message = "Provider profile not found." });
        }


        // =====================================================
        // 🔐 SNAPSHOT HELPERS
        // =====================================================
        private static bool IsPubliclyVisible(Dictionary<string, object> data)
        {
            if (!string.Equals(
                    GetString(data, "status", "draft"),
                    "published",
                    StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            if (GetLong(data, "approvedVersion") <= 0)
                return false;

            return data.ContainsKey("approvedSnapshot");
        }

        private static bool TryGetApprovedSnapshot(
            Dictionary<string, object> companyData,
            out Dictionary<string, object> snapshot)
        {
            snapshot = new Dictionary<string, object>();

            if (!companyData.TryGetValue("approvedSnapshot", out var rawSnapshot) ||
                rawSnapshot is not Dictionary<string, object> map)
            {
                return false;
            }

            snapshot = map;
            return true;
        }

        private static bool TryGetMap(
            Dictionary<string, object> data,
            string key,
            out Dictionary<string, object> map)
        {
            map = new Dictionary<string, object>();

            if (!data.TryGetValue(key, out var raw) ||
                raw is not Dictionary<string, object> dictionary)
            {
                return false;
            }

            map = dictionary;
            return true;
        }

        private static List<Dictionary<string, object?>> GetListOfMaps(
            Dictionary<string, object> snapshot,
            string key)
        {
            if (!snapshot.TryGetValue(key, out var raw) ||
                raw is not IEnumerable<object> items)
            {
                return new List<Dictionary<string, object?>>();
            }

            var result = new List<Dictionary<string, object?>>();

            foreach (var item in items)
            {
                if (item is Dictionary<string, object> map)
                    result.Add(ConvertForApi(map));
            }

            return result
                .OrderByDescending(item =>
                {
                    foreach (var keyName in new[] { "scheduledAt", "startAt", "createdAt", "updatedAt" })
                    {
                        if (item.TryGetValue(keyName, out var raw) &&
                            DateTimeOffset.TryParse(raw?.ToString(), out var parsed))
                        {
                            return parsed;
                        }
                    }

                    return DateTimeOffset.MinValue;
                })
                .ToList();
        }

        private static List<Dictionary<string, object?>> EnsurePublicPostSlugs(
            List<Dictionary<string, object?>> posts)
        {
            var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var post in posts)
            {
                var storedSlug = GetNullableString(post, "slug");
                var title = GetNullableString(post, "title");
                var id = GetNullableString(post, "id");

                var baseSlug = !string.IsNullOrWhiteSpace(storedSlug)
                    ? storedSlug
                    : CreateSlug(title);

                if (string.IsNullOrWhiteSpace(baseSlug))
                    baseSlug = !string.IsNullOrWhiteSpace(id)
                        ? $"post-{id.ToLowerInvariant()}"
                        : "post";

                var candidate = baseSlug;
                var suffix = 2;

                while (used.Contains(candidate))
                {
                    candidate = $"{baseSlug}-{suffix}";
                    suffix++;
                }

                used.Add(candidate);
                post["slug"] = candidate;
            }

            return posts;
        }

        private static List<Dictionary<string, object?>> EnsurePublicWhitepaperSlugs(
            List<Dictionary<string, object?>> whitepapers)
        {
            var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var whitepaper in whitepapers)
            {
                var storedSlug = GetNullableString(whitepaper, "slug");
                var title = GetNullableString(whitepaper, "title");
                var id = GetNullableString(whitepaper, "id");

                var baseSlug = !string.IsNullOrWhiteSpace(storedSlug)
                    ? storedSlug
                    : CreateSlug(title);

                if (string.IsNullOrWhiteSpace(baseSlug))
                    baseSlug = !string.IsNullOrWhiteSpace(id)
                        ? $"whitepaper-{id.ToLowerInvariant()}"
                        : "whitepaper";

                var candidate = baseSlug;
                var suffix = 2;

                while (used.Contains(candidate))
                {
                    candidate = $"{baseSlug}-{suffix}";
                    suffix++;
                }

                used.Add(candidate);
                whitepaper["slug"] = candidate;
            }

            return whitepapers;
        }

        private static List<Dictionary<string, object?>> EnsurePublicWebinarSlugs(
            List<Dictionary<string, object?>> webinars)
        {
            var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var webinar in webinars)
            {
                var storedSlug = GetNullableString(webinar, "slug");
                var title = GetNullableString(webinar, "title");
                var id = GetNullableString(webinar, "id");

                var baseSlug = !string.IsNullOrWhiteSpace(storedSlug)
                    ? storedSlug
                    : CreateSlug(title);

                if (string.IsNullOrWhiteSpace(baseSlug))
                    baseSlug = !string.IsNullOrWhiteSpace(id)
                        ? $"webinar-{id.ToLowerInvariant()}"
                        : "webinar";

                var candidate = baseSlug;
                var suffix = 2;

                while (used.Contains(candidate))
                {
                    candidate = $"{baseSlug}-{suffix}";
                    suffix++;
                }

                used.Add(candidate);
                webinar["slug"] = candidate;
            }

            return webinars;
        }

        private static string GetNullableString(
            Dictionary<string, object?> data,
            string key)
        {
            return data.TryGetValue(key, out var value)
                ? value?.ToString() ?? string.Empty
                : string.Empty;
        }

        private static string CreateSlug(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return string.Empty;

            var normalized = value.Normalize(NormalizationForm.FormD);
            var builder = new StringBuilder();

            foreach (var ch in normalized)
            {
                if (CharUnicodeInfo.GetUnicodeCategory(ch) != UnicodeCategory.NonSpacingMark)
                    builder.Append(ch);
            }

            var withoutDiacritics = builder
                .ToString()
                .Normalize(NormalizationForm.FormC)
                .ToLowerInvariant();

            var slug = Regex.Replace(withoutDiacritics, @"[^a-z0-9]+", "-");
            return Regex.Replace(slug, @"-+", "-").Trim('-');
        }

        private static Dictionary<string, object?> ConvertForApi(
            Dictionary<string, object> map)
        {
            return map
                .Where(pair =>
                    !pair.Key.EndsWith("ObjectPath", StringComparison.Ordinal) &&
                    pair.Key is not "createdBy" and not "ownerUid")
                .ToDictionary(
                    pair => pair.Key,
                    pair => ConvertValue(pair.Value));
        }

        private static object? ConvertValue(object? value)
        {
            if (value is Timestamp timestamp)
                return timestamp.ToDateTime().ToString("O");

            if (value is Dictionary<string, object> map)
                return ConvertForApi(map);

            if (value is IEnumerable<object> items && value is not string)
                return items.Select(ConvertValue).ToList();

            return value;
        }

        private static string GetString(
            Dictionary<string, object> data,
            string key,
            string fallback = "")
        {
            return data.TryGetValue(key, out var value)
                ? value?.ToString() ?? fallback
                : fallback;
        }

        private static List<string> GetStringList(
            Dictionary<string, object> data,
            string key)
        {
            if (!data.TryGetValue(key, out var value) ||
                value is not IEnumerable<object> items)
            {
                return new List<string>();
            }

            return items
                .Select(item => item?.ToString() ?? string.Empty)
                .Where(item => !string.IsNullOrWhiteSpace(item))
                .ToList();
        }

        private static long GetLong(
            Dictionary<string, object> data,
            string key)
        {
            if (!data.TryGetValue(key, out var value))
                return 0;

            if (value is long longValue)
                return longValue;

            return long.TryParse(value?.ToString(), out var parsed)
                ? parsed
                : 0;
        }

        private static string GetTimestampIso(
            Dictionary<string, object> data,
            string key)
        {
            return data.TryGetValue(key, out var value) &&
                   value is Timestamp timestamp
                ? timestamp.ToDateTime().ToString("O")
                : string.Empty;
        }
    }
}
