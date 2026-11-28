using FirebaseAdmin.Auth;
using Google.Cloud.Firestore;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AiProductivityCoach.Api.AiPublishing.Claims;
using AiProductivityCoach.Api.AiPublishing.Content;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Review;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.Controllers
{
    /// <summary>
    /// The admin decides on claim requests. Approving makes the claimant's existing company account the owner of
    /// the profile; nothing else ever grants ownership, and a profile that already has an owner cannot be taken.
    /// </summary>
    [ApiController]
    [Route("api/ai/claims")]
    [Authorize(Policy = "AdminOnly")]
    public class AiClaimsController : AiControllerBase
    {
        private readonly FirestoreDb _firestore;
        private readonly ClaimStore _claims;
        private readonly InvitationMailer _mailer;
        private readonly AiAuditService _audit;
        private readonly ILogger<AiClaimsController> _logger;

        public AiClaimsController(FirestoreDb firestore, ClaimStore claims, InvitationMailer mailer, AiAuditService audit, ILogger<AiClaimsController> logger)
        {
            _firestore = firestore;
            _claims = claims;
            _mailer = mailer;
            _audit = audit;
            _logger = logger;
        }

        public class DecisionDto
        {
            public string? Decision { get; set; }
            public string? Note { get; set; }
        }

        [HttpGet]
        public async Task<IActionResult> List([FromQuery] string? state)
        {
            var wanted = state is ClaimStates.Approved or ClaimStates.Rejected ? state : ClaimStates.Pending;
            return Ok(await _claims.ListAsync(wanted));
        }

        /// <summary>Does this email belong to a company (publisher) account that can take over a profile?</summary>
        private static async Task<string?> PublisherUidAsync(string email)
        {
            try
            {
                var user = await FirebaseAuth.DefaultInstance.GetUserByEmailAsync(email);

                var isPublisher = user.CustomClaims != null &&
                                  user.CustomClaims.TryGetValue("role", out var role) &&
                                  string.Equals(role?.ToString(), "publisher", StringComparison.OrdinalIgnoreCase);

                return !user.Disabled && isPublisher ? user.Uid : null;
            }
            catch (FirebaseAuthException)
            {
                return null;
            }
        }

        [HttpPost("{claimId}/decision")]
        public async Task<IActionResult> Decide(string claimId, [FromBody] DecisionDto? request)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var decision = request?.Decision?.Trim().ToLowerInvariant();
            if (!ClaimRules.IsValidDecision(decision)) return Error(400, "invalid_decision", "Unknown decision.");

            var note = DocumentParser.Clean(request?.Note, 1500);
            if (decision == "reject" && note.Length < 3) return Error(400, "note_required", "Please add a short reason.");

            var claimRef = _claims.Ref(claimId);
            var claimSnap = await claimRef.GetSnapshotAsync();
            if (!claimSnap.Exists) return Error(404, "claim_not_found", "Claim not found.");

            var claim = claimSnap.ToDictionary();
            if (!ClaimRules.CanDecide(FirestoreApi.GetString(claim, "state")))
                return Error(409, "claim_already_decided", "This claim was already decided.");

            var companyId = FirestoreApi.GetString(claim, "companyId");
            var companyName = FirestoreApi.GetString(claim, "companyName");
            var email = FirestoreApi.GetString(claim, "email");
            var companyRef = _firestore.Collection("companies").Document(companyId);
            var now = Timestamp.GetCurrentTimestamp();

            if (decision == "approve")
            {
                var uid = await PublisherUidAsync(email);
                if (uid == null)
                    return Error(409, "no_publisher_account", "No company account exists for this email yet.");

                try
                {
                    // Ownership is only handed over if the profile still has no owner at this very moment.
                    await _firestore.RunTransactionAsync(async tx =>
                    {
                        var company = await tx.GetSnapshotAsync(companyRef);
                        if (!company.Exists) throw new InvalidOperationException("company_not_found");
                        if (!string.IsNullOrWhiteSpace(FirestoreApi.GetString(company.ToDictionary(), "ownerUid")))
                            throw new InvalidOperationException("already_claimed");

                        tx.Update(companyRef, new Dictionary<string, object> { ["ownerUid"] = uid, ["claimedAt"] = now, ["updatedAt"] = now });
                        tx.Update(claimRef, new Dictionary<string, object>
                        {
                            ["state"] = ClaimStates.Approved, ["decidedBy"] = actor.UserId, ["decidedAt"] = now, ["ownerUid"] = uid
                        });
                    });
                }
                catch (InvalidOperationException ex) when (ex.Message == "already_claimed")
                {
                    return Error(409, "already_claimed", "This profile already has an owner.");
                }
                catch (InvalidOperationException ex) when (ex.Message == "company_not_found")
                {
                    return Error(404, "company_not_found", "The profile no longer exists.");
                }

                // Any other open request for the same profile is settled by this one.
                var others = await _firestore.Collection("company_claims")
                    .WhereEqualTo("companyId", companyId).WhereEqualTo("state", ClaimStates.Pending).GetSnapshotAsync();
                foreach (var other in others.Documents)
                {
                    await other.Reference.UpdateAsync(new Dictionary<string, object>
                    {
                        ["state"] = ClaimStates.Rejected, ["decidedBy"] = actor.UserId, ["decidedAt"] = now,
                        ["decisionNote"] = "Another request for this profile was approved."
                    });
                }
            }
            else
            {
                await claimRef.UpdateAsync(new Dictionary<string, object>
                {
                    ["state"] = ClaimStates.Rejected, ["decidedBy"] = actor.UserId, ["decidedAt"] = now, ["decisionNote"] = note
                });
            }

            await _audit.LogAsync(actor, AuditActions.ClaimDecided, string.Empty, null, null,
                new Dictionary<string, object> { ["claimId"] = claimId, ["companyId"] = companyId, ["decision"] = decision! });

            var mail = await _mailer.SendClaimDecisionAsync(email, companyName, decision == "approve", note);
            if (!mail.Sent) _logger.LogWarning("[Claim] Decision email could not be sent: {Error}", mail.Error);

            return Ok(new { decision, emailSent = mail.Sent });
        }
    }
}
