using FirebaseAdmin.Auth;
using Google.Cloud.Firestore;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;
using System.Security.Claims;
using System.Text.Encodings.Web;

namespace AiProductivityCoach.Api.Auth
{
    public class FirebaseAuthenticationHandler
        : AuthenticationHandler<AuthenticationSchemeOptions>
    {
        private static readonly TimeSpan PublisherSessionLifetime = TimeSpan.FromMinutes(60);

        private readonly IConfiguration _configuration;
        private readonly FirestoreDb _firestore;

        public FirebaseAuthenticationHandler(
            IOptionsMonitor<AuthenticationSchemeOptions> options,
            ILoggerFactory logger,
            UrlEncoder encoder,
            ISystemClock clock,
            IConfiguration configuration,
            FirestoreDb firestore)
            : base(options, logger, encoder, clock)
        {
            _configuration = configuration;
            _firestore = firestore;
        }

        protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Request.Headers.ContainsKey("Authorization"))
                return AuthenticateResult.Fail("Missing Authorization Header");

            var authorizationHeader = Request.Headers["Authorization"].ToString();

            if (!authorizationHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
                return AuthenticateResult.Fail("Invalid Authorization Header");

            var token = authorizationHeader["Bearer ".Length..].Trim();

            if (string.IsNullOrWhiteSpace(token))
                return AuthenticateResult.Fail("Invalid Authorization Header");

            try
            {
                var decodedToken = await FirebaseAuth.DefaultInstance.VerifyIdTokenAsync(token, checkRevoked: true);

                var claims = new List<Claim>
                {
                    new Claim(ClaimTypes.NameIdentifier, decodedToken.Uid)
                };

                // Resolve email from the verified token first, then Firebase Auth as fallback.
                var email = decodedToken.Claims.TryGetValue("email", out var tokenEmail)
                    ? tokenEmail?.ToString() ?? string.Empty
                    : string.Empty;

                if (string.IsNullOrWhiteSpace(email))
                {
                    var userRecord = await FirebaseAuth.DefaultInstance.GetUserAsync(decodedToken.Uid);
                    email = userRecord.Email ?? string.Empty;
                }

                if (!string.IsNullOrWhiteSpace(email))
                {
                    claims.Add(new Claim(ClaimTypes.Email, email));
                }

                // =====================================================
                // TRUSTED RBAC ROLE RESOLUTION
                // =====================================================
                // Security source of truth:
                //   1) Existing configured admin email remains a trusted bootstrap/fallback.
                //   2) Otherwise, use the Firebase custom claim "role".
                //   3) Unknown/missing values always fall back to "user".
                //
                // Firestore users/{uid}.role is application metadata only and is never
                // trusted here for authorization decisions.
                var role = ResolveTrustedRole(decodedToken, email);
                claims.Add(new Claim(ClaimTypes.Role, role));

                // Publisher sessions have a hard 60-minute lifetime measured from
                // Firebase's original auth_time claim. Refreshing the Firebase ID
                // token does not extend this window. Missing/invalid auth_time fails
                // closed for publishers. Admin and standard-user session behavior is
                // intentionally unchanged.
                if (string.Equals(role, "publisher", StringComparison.OrdinalIgnoreCase) &&
                    IsPublisherSessionExpired(decodedToken))
                {
                    return AuthenticateResult.Fail("Publisher session expired");
                }

                // =====================================================
                // TRUSTED ACCOUNT STATUS RESOLUTION
                // =====================================================
                // Account status is read from Firestore by the trusted backend.
                // Existing users that pre-date this field are treated as active
                // for backward compatibility. Any explicit suspended/disabled
                // state blocks protected API access.
                var accountStatus = await ResolveAccountStatusAsync(decodedToken.Uid);

                if (!string.Equals(accountStatus, "active", StringComparison.OrdinalIgnoreCase))
                {
                    return AuthenticateResult.Fail(
                        accountStatus == "suspended"
                            ? "Account is suspended"
                            : "Account is disabled"
                    );
                }

                claims.Add(new Claim("account_status", accountStatus));

                var identity = new ClaimsIdentity(claims, Scheme.Name);
                var principal = new ClaimsPrincipal(identity);
                var ticket = new AuthenticationTicket(principal, Scheme.Name);

                return AuthenticateResult.Success(ticket);
            }
            catch (Exception)
            {
                return AuthenticateResult.Fail("Invalid Firebase Token");
            }
        }

        private static bool IsPublisherSessionExpired(FirebaseToken decodedToken)
        {
            if (!decodedToken.Claims.TryGetValue("auth_time", out var rawAuthTime) ||
                rawAuthTime is null ||
                !long.TryParse(rawAuthTime.ToString(), out var authTimeSeconds))
            {
                return true;
            }

            try
            {
                var authenticatedAt = DateTimeOffset.FromUnixTimeSeconds(authTimeSeconds);
                var expiresAt = authenticatedAt.Add(PublisherSessionLifetime);
                return DateTimeOffset.UtcNow >= expiresAt;
            }
            catch (ArgumentOutOfRangeException)
            {
                return true;
            }
        }

        private async Task<string> ResolveAccountStatusAsync(string uid)
        {
            var userSnapshot = await _firestore
                .Collection("users")
                .Document(uid)
                .GetSnapshotAsync();

            // Backward compatibility for accounts created before status existed,
            // including the current configured admin bootstrap account.
            if (!userSnapshot.Exists)
                return "active";

            var data = userSnapshot.ToDictionary();

            if (!data.TryGetValue("status", out var rawStatus) ||
                string.IsNullOrWhiteSpace(rawStatus?.ToString()))
            {
                return "active";
            }

            var status = rawStatus.ToString()!.Trim().ToLowerInvariant();

            return status switch
            {
                "active" => "active",
                "suspended" => "suspended",
                "disabled" => "disabled",

                // Unknown status values fail closed instead of granting access.
                _ => "disabled"
            };
        }


        private string ResolveTrustedRole(FirebaseToken decodedToken, string email)
        {
            // Preserve the currently working Matthias/admin bootstrap path.
            var adminEmails = _configuration
                .GetSection("AdminEmails")
                .Get<List<string>>() ?? new List<string>();

            if (!string.IsNullOrWhiteSpace(email) &&
                adminEmails.Any(adminEmail =>
                    string.Equals(adminEmail, email, StringComparison.OrdinalIgnoreCase)))
            {
                return "admin";
            }

            // Publisher/Admin roles created later will be stored as trusted Firebase
            // custom claims by privileged server-side code.
            var requestedRole = decodedToken.Claims.TryGetValue("role", out var roleClaim)
                ? roleClaim?.ToString()?.Trim().ToLowerInvariant()
                : null;

            if (string.IsNullOrWhiteSpace(requestedRole))
                return "user";

            var allowedRoles = _configuration
                .GetSection("Rbac:AllowedRoles")
                .Get<string[]>()
                ?.Select(role => role.Trim().ToLowerInvariant())
                .ToHashSet(StringComparer.OrdinalIgnoreCase)
                ?? new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                {
                    "user",
                    "publisher",
                    "admin"
                };

            return allowedRoles.Contains(requestedRole)
                ? requestedRole
                : "user";
        }
    }
}
