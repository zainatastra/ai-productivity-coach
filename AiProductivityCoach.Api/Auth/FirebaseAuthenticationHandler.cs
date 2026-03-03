using FirebaseAdmin.Auth;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;
using System.Security.Claims;
using System.Text.Encodings.Web;

namespace AiProductivityCoach.Api.Auth
{
    public class FirebaseAuthenticationHandler 
        : AuthenticationHandler<AuthenticationSchemeOptions>
    {
        private readonly IConfiguration _configuration;

        public FirebaseAuthenticationHandler(
            IOptionsMonitor<AuthenticationSchemeOptions> options,
            ILoggerFactory logger,
            UrlEncoder encoder,
            ISystemClock clock,
            IConfiguration configuration)
            : base(options, logger, encoder, clock)
        {
            _configuration = configuration;
        }

        protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Request.Headers.ContainsKey("Authorization"))
                return AuthenticateResult.Fail("Missing Authorization Header");

            var token = Request.Headers["Authorization"]
                .ToString()
                .Replace("Bearer ", "");

            if (string.IsNullOrWhiteSpace(token))
                return AuthenticateResult.Fail("Invalid Authorization Header");

            try
            {
                var decodedToken =
                    await FirebaseAuth.DefaultInstance.VerifyIdTokenAsync(token);

                var claims = new List<Claim>
                {
                    new Claim(ClaimTypes.NameIdentifier, decodedToken.Uid)
                };

                // ✅ Extract email safely
string email = "";

// First try token claims
if (decodedToken.Claims.ContainsKey("email"))
{
    email = decodedToken.Claims["email"]?.ToString() ?? "";
}

// Fallback: fetch from Firebase if missing
if (string.IsNullOrEmpty(email))
{
    var userRecord = await FirebaseAuth.DefaultInstance.GetUserAsync(decodedToken.Uid);
    email = userRecord.Email ?? "";
}

if (!string.IsNullOrEmpty(email))
{
    claims.Add(new Claim(ClaimTypes.Email, email));
}

                // ✅ Admin check from appsettings.json
                var adminEmails = _configuration
                    .GetSection("AdminEmails")
                    .Get<List<string>>();

                if (!string.IsNullOrEmpty(email) &&
                    adminEmails != null &&
                    adminEmails.Contains(email))
                {
                    claims.Add(new Claim(ClaimTypes.Role, "admin"));
                }

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
    }
}