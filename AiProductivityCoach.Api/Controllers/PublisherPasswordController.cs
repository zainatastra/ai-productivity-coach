using FirebaseAdmin.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AiProductivityCoach.Api.AiPublishing.Review;

namespace AiProductivityCoach.Api.Controllers
{
    /// <summary>
    /// "Forgot password" for company (publisher) logins. The answer is always the same, so the
    /// form can never be used to find out which email addresses have an account.
    /// </summary>
    [ApiController]
    [Route("api/auth/publisher")]
    [AllowAnonymous]
    public class PublisherPasswordController : AiControllerBase
    {
        private readonly InvitationMailer _mailer;
        private readonly ILogger<PublisherPasswordController> _logger;

        public PublisherPasswordController(InvitationMailer mailer, ILogger<PublisherPasswordController> logger)
        {
            _mailer = mailer;
            _logger = logger;
        }

        public class ForgotDto
        {
            public string? Email { get; set; }
            public string? Language { get; set; }
        }

        [HttpPost("forgot-password")]
        public async Task<IActionResult> Forgot([FromBody] ForgotDto? request)
        {
            var caller = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
            var email = InvitationTokens.NormalizeEmail(request?.Email);

            if (!AttemptLimiter.Allow($"pw-reset-ip:{caller}", 10, TimeSpan.FromHours(1)))
                return Error(429, "too_many_attempts", "Too many attempts. Please try again later.");

            // Same answer in every case from here on.
            var answer = Ok(new { ok = true });

            if (email == null || !AttemptLimiter.Allow($"pw-reset-mail:{email}", 3, TimeSpan.FromHours(1)))
                return answer;

            try
            {
                var user = await FirebaseAuth.DefaultInstance.GetUserByEmailAsync(email);

                var isPublisher = user.CustomClaims != null &&
                                  user.CustomClaims.TryGetValue("role", out var role) &&
                                  string.Equals(role?.ToString(), "publisher", StringComparison.OrdinalIgnoreCase);

                if (user.Disabled || !isPublisher) return answer;

                var link = await CreateLinkAsync(email);
                if (link == null) return answer;

                var result = await _mailer.SendPasswordResetAsync(email, link, request?.Language ?? "de");
                if (!result.Sent) _logger.LogWarning("[PasswordReset] Email could not be sent: {Error}", result.Error);
            }
            catch (FirebaseAuthException)
            {
                // unknown address: nothing to do, and nothing to tell
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[PasswordReset] Unexpected error.");
            }

            return answer;
        }

        private async Task<string?> CreateLinkAsync(string email)
        {
            try
            {
                // After choosing the new password the person is sent back to the company login.
                return await FirebaseAuth.DefaultInstance.GeneratePasswordResetLinkAsync(email,
                    new ActionCodeSettings { Url = _mailer.LoginLink, HandleCodeInApp = false });
            }
            catch (FirebaseAuthException)
            {
                // The website address is not an authorised domain of the project: use the plain link.
            }

            try
            {
                return await FirebaseAuth.DefaultInstance.GeneratePasswordResetLinkAsync(email);
            }
            catch (FirebaseAuthException ex)
            {
                _logger.LogWarning("[PasswordReset] Could not create a reset link: {Code}", ex.AuthErrorCode);
                return null;
            }
        }
    }
}
