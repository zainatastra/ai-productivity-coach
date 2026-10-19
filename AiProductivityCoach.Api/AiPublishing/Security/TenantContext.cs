using System.Security.Claims;
using AiProductivityCoach.Api.AiPublishing.Domain;

namespace AiProductivityCoach.Api.AiPublishing.Security
{
    /// <summary>
    /// Trusted identity of the caller. Resolved ONLY from the claims created by
    /// FirebaseAuthenticationHandler after token verification - never from request
    /// bodies, query strings or AI output. The AI cannot pick or change a company.
    /// </summary>
    public sealed record TenantContext(
        string UserId,
        string Email,
        string Role,
        string Platform)
    {
        public bool IsAdmin => Role == AiRoles.Admin;

        public static TenantContext? From(ClaimsPrincipal? user)
        {
            var uid = user?.FindFirst(ClaimTypes.NameIdentifier)?.Value;

            if (string.IsNullOrWhiteSpace(uid))
                return null;

            var backendRole = user!.FindFirst(ClaimTypes.Role)?.Value ?? "user";

            var role = backendRole switch
            {
                "admin" => AiRoles.Admin,
                "publisher" => AiRoles.CompanyPublisher,
                _ => string.Empty
            };

            var platform = user.FindFirst("platform")?.Value;
            if (!Platforms.IsValid(platform))
                platform = Platforms.EyEric;

            return new TenantContext(
                uid,
                user.FindFirst(ClaimTypes.Email)?.Value ?? string.Empty,
                role,
                platform!.Trim().ToLowerInvariant());
        }

        /// <summary>Actor used for background work (job worker).</summary>
        public static TenantContext SystemActor(string platform = Platforms.EyEric) =>
            new("system", string.Empty, AiRoles.System, platform);
    }
}
