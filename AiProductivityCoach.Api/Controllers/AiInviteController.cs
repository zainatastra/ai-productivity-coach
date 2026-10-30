using FirebaseAdmin.Auth;
using Google.Cloud.Firestore;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AiProductivityCoach.Api.AiPublishing.Content;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Review;
using AiProductivityCoach.Api.AiPublishing.Security;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.Controllers
{
    /// <summary>
    /// Public side of an invitation. Everything here needs the secret token from the email; the
    /// token is checked by its hash, belongs to ONE email address and can be used once.
    /// </summary>
    [ApiController]
    [Route("api/ai/invitations")]
    [AllowAnonymous]
    public class AiInviteController : AiControllerBase
    {
        private static readonly TimeSpan Window = TimeSpan.FromHours(1);

        private readonly FirestoreDb _firestore;
        private readonly InvitationService _invitations;
        private readonly MembershipService _members;
        private readonly InvitationMailer _mailer;
        private readonly AiAuditService _audit;

        public AiInviteController(
            FirestoreDb firestore, InvitationService invitations, MembershipService members,
            InvitationMailer mailer, AiAuditService audit)
        {
            _firestore = firestore;
            _invitations = invitations;
            _members = members;
            _mailer = mailer;
            _audit = audit;
        }

        public class AcceptNewDto
        {
            public string? Token { get; set; }
            public string? Password { get; set; }
            public string? FullName { get; set; }
        }

        private string Caller => HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";

        private async Task<string> ProviderNameAsync(string providerId)
        {
            var snap = await _firestore.Collection(AiCollections.Providers).Document(providerId).GetSnapshotAsync();
            return snap.Exists ? FirestoreApi.GetString(snap.ToDictionary(), "name") : string.Empty;
        }

        [HttpGet("preview")]
        public async Task<IActionResult> Preview([FromQuery] string? token)
        {
            if (!AttemptLimiter.Allow($"inv-preview:{Caller}", 60, Window))
                return Error(429, "too_many_attempts", "Too many attempts. Please try again later.");

            var info = await _invitations.FindByTokenAsync(token ?? string.Empty);

            // An unknown, used, revoked or expired link all look the same from outside.
            if (info == null || !info.IsUsable) return Ok(new { valid = false });

            var accountExists = false;
            try
            {
                await FirebaseAuth.DefaultInstance.GetUserByEmailAsync(info.Email);
                accountExists = true;
            }
            catch (FirebaseAuthException)
            {
            }

            return Ok(new { valid = true, email = info.Email, providerName = await ProviderNameAsync(info.ProviderId), accountExists });
        }

        [HttpPost("accept-new")]
        public async Task<IActionResult> AcceptNew([FromBody] AcceptNewDto? request)
        {
            if (!AttemptLimiter.Allow($"inv-accept:{Caller}", 10, Window))
                return Error(429, "too_many_attempts", "Too many attempts. Please try again later.");

            var info = await _invitations.FindByTokenAsync(request?.Token ?? string.Empty);
            if (info == null || !info.IsUsable)
                return Error(400, "invalid_invitation", "This invitation is not valid any more.");

            if (!InvitationTokens.IsAcceptablePassword(request?.Password))
                return Error(400, "weak_password", "Use at least 10 characters with letters and numbers.");

            var fullName = DocumentParser.Clean(request?.FullName, 100);
            if (fullName.Length == 0) fullName = info.Email.Split('@')[0];

            // An existing account must sign in instead: a link must never reset someone else's password.
            try
            {
                await FirebaseAuth.DefaultInstance.GetUserByEmailAsync(info.Email);
                return Error(409, "account_exists", "An account with this email already exists. Please sign in.");
            }
            catch (FirebaseAuthException)
            {
            }

            UserRecord? user = null;

            try
            {
                user = await FirebaseAuth.DefaultInstance.CreateUserAsync(new UserRecordArgs
                {
                    Email = info.Email,
                    Password = request!.Password,
                    DisplayName = fullName,
                    EmailVerified = true,   // the invitation was delivered to this address
                    Disabled = false
                });

                await FirebaseAuth.DefaultInstance.SetCustomUserClaimsAsync(user.Uid, new Dictionary<string, object>
                {
                    ["role"] = "publisher",
                    ["platform"] = info.Platform
                });

                await _firestore.Collection("users").Document(user.Uid).SetAsync(new Dictionary<string, object>
                {
                    ["email"] = info.Email,
                    ["fullName"] = fullName,
                    ["role"] = "publisher",
                    ["status"] = "active",
                    ["createdBy"] = "invitation",
                    ["createdAt"] = Timestamp.GetCurrentTimestamp(),
                    ["updatedAt"] = Timestamp.GetCurrentTimestamp()
                });

                if (!await _invitations.MarkAcceptedAsync(info.Id, user.Uid))
                {
                    await FirebaseAuth.DefaultInstance.DeleteUserAsync(user.Uid);
                    return Error(409, "invalid_invitation", "This invitation was already used.");
                }

                await _members.AddAsync(info.ProviderId, user.Uid, info.Email, info.Platform, info.Id);

                var actor = new TenantContext(user.Uid, info.Email, AiRoles.CompanyPublisher, info.Platform);
                await _audit.LogAsync(actor, AuditActions.InvitationAccepted, info.ProviderId, null, null,
                    new Dictionary<string, object> { ["invitationId"] = info.Id, ["existingAccount"] = false });

                return Ok(new { email = info.Email, loginUrl = $"{_mailer.FrontendBaseUrl}/publisher/login" });
            }
            catch (FirebaseAuthException ex)
            {
                return Error(409, "account_failed", $"The account could not be created ({ex.AuthErrorCode}).");
            }
            catch (Exception)
            {
                // Do not leave a half-created account behind.
                if (user != null)
                {
                    try { await FirebaseAuth.DefaultInstance.DeleteUserAsync(user.Uid); } catch { }
                }

                return Error(500, "account_failed", "The account could not be created.");
            }
        }
    }
}
