using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Google.Cloud.Firestore;

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

                var response = new Dictionary<string, object?>
                {
                    ["id"] = doc.Id,
                    ["approvedVersion"] = GetLong(data, "approvedVersion"),
                    ["approvedAt"] = GetTimestampIso(data, "approvedAt"),
                    ["company"] = ConvertForApi(company),
                    ["about"] = TryGetMap(approvedSnapshot, "about", out var about)
                        ? ConvertForApi(about)
                        : new Dictionary<string, object?>(),
                    ["posts"] = GetListOfMaps(approvedSnapshot, "posts"),
                    ["whitepapers"] = GetListOfMaps(approvedSnapshot, "whitepapers"),
                    ["products"] = GetListOfMaps(approvedSnapshot, "products"),
                    ["contacts"] = GetListOfMaps(approvedSnapshot, "contacts"),
                    ["appointments"] = GetListOfMaps(approvedSnapshot, "appointments"),
                    ["webinars"] = GetListOfMaps(approvedSnapshot, "webinars"),
                    ["events"] = GetListOfMaps(approvedSnapshot, "events")
                };

                return Ok(response);
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
