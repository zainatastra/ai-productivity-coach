using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.AiPublishing.Review
{
    /// <summary>
    /// Which platforms a provider has actually been sent to. Each platform has its own preview and
    /// access, so a company can only be invited to a platform where its profile already exists - and
    /// sending to one platform never implies the other.
    /// </summary>
    public static class PlatformAccess
    {
        /// <summary>The field the platform's adapter stores the created record's id in, on the provider.</summary>
        public static string SentField(string platform) => platform?.Trim().ToLowerInvariant() switch
        {
            Platforms.EyEric => "eyEricCompanyId",
            Platforms.Midrange => "midrangeCompanyId",
            _ => string.Empty
        };

        public static bool IsSentTo(IDictionary<string, object> provider, string platform)
        {
            var field = SentField(platform);
            return field.Length > 0 && FirestoreApi.GetString(provider, field).Length > 0;
        }

        public static Dictionary<string, bool> SentStates(IDictionary<string, object> provider) =>
            Platforms.All.ToDictionary(platform => platform, platform => IsSentTo(provider, platform));
    }
}
