using Google.Cloud.Firestore;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AiProductivityCoach.Api.AiPublishing.Content;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Review;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.Controllers
{
    /// <summary>
    /// Admin side of the review workflow: company access (invitations, members), handing a draft to
    /// the company, the admin decision, comments and the review queue. Every status change goes
    /// through the state machine in <see cref="ContentWorkflow"/>.
    /// </summary>
    [ApiController]
    [Route("api/ai")]
    [Authorize(Policy = "AdminOnly")]
    public class AiReviewController : AiControllerBase
    {
        private readonly FirestoreDb _firestore;
        private readonly InvitationService _invitations;
        private readonly MembershipService _members;
        private readonly InvitationMailer _mailer;
        private readonly ReviewStore _review;
        private readonly ContentStore _store;
        private readonly AiAuditService _audit;

        public AiReviewController(
            FirestoreDb firestore,
            InvitationService invitations,
            MembershipService members,
            InvitationMailer mailer,
            ReviewStore review,
            ContentStore store,
            AiAuditService audit)
        {
            _firestore = firestore;
            _invitations = invitations;
            _members = members;
            _mailer = mailer;
            _review = review;
            _store = store;
            _audit = audit;
        }

        public class InviteDto
        {
            public string? Email { get; set; }
            public bool SendEmail { get; set; }
        }

        public class HandoverDto
        {
            public bool Notify { get; set; }
            public string? Note { get; set; }
        }

        public class DecisionDto
        {
            public string? Decision { get; set; }
            public string? Note { get; set; }
        }

        private sealed record DecisionPlan(string[] From, string To, bool NoteRequired);

        public class CommentDto
        {
            public string? Text { get; set; }
        }

        // ───────────── company access ─────────────

        private async Task<DocumentSnapshot?> ProviderAsync(string providerId)
        {
            var snap = await _firestore.Collection(AiCollections.Providers).Document(providerId).GetSnapshotAsync();
            return snap.Exists ? snap : null;
        }

        [HttpGet("providers/{providerId}/access")]
        public async Task<IActionResult> GetAccess(string providerId)
        {
            if (await ProviderAsync(providerId) == null) return Error(404, "provider_not_found", "Provider not found.");

            return Ok(new
            {
                invitations = await _invitations.ListAsync(providerId),
                members = await _members.ListAsync(providerId),
                emailConfigured = _mailer.IsConfigured
            });
        }

        [HttpPost("providers/{providerId}/invitations")]
        public async Task<IActionResult> Invite(string providerId, [FromBody] InviteDto? request)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var provider = await ProviderAsync(providerId);
            if (provider == null) return Error(404, "provider_not_found", "Provider not found.");

            var data = provider.ToDictionary();
            if (FirestoreApi.GetString(data, "status") == ProviderStatus.Archived)
                return Error(409, "provider_archived", "Archived providers cannot be changed.");

            var email = InvitationTokens.NormalizeEmail(request?.Email);
            if (email == null) return Error(400, "invalid_email", "Please enter a valid email address.");

            var (id, token) = await _invitations.CreateAsync(providerId, email, actor.Platform, actor.UserId);
            var link = _mailer.InviteLink(token);

            await _audit.LogAsync(actor, AuditActions.InvitationCreated, providerId, null, null,
                new Dictionary<string, object> { ["invitationId"] = id, ["email"] = email });

            var emailed = new MailResult(false, null);

            if (request?.SendEmail == true)
            {
                emailed = await _mailer.SendInvitationAsync(email, FirestoreApi.GetString(data, "name"), link, FirestoreApi.GetString(data, "defaultLanguage", "de"));

                if (emailed.Sent)
                    await _audit.LogAsync(actor, AuditActions.InvitationEmailSent, providerId, null, null,
                        new Dictionary<string, object> { ["invitationId"] = id });
            }

            // The link is only ever shown here: afterwards just its hash exists.
            return StatusCode(201, new { id, email, acceptUrl = link, emailSent = emailed.Sent, emailError = emailed.Error });
        }

        [HttpPost("providers/{providerId}/invitations/{invitationId}/revoke")]
        public async Task<IActionResult> Revoke(string providerId, string invitationId)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            if (!await _invitations.RevokeAsync(providerId, invitationId))
                return Error(404, "invitation_not_found", "No open invitation found.");

            await _audit.LogAsync(actor, AuditActions.InvitationRevoked, providerId, null, null,
                new Dictionary<string, object> { ["invitationId"] = invitationId });

            return NoContent();
        }

        [HttpDelete("providers/{providerId}/members/{uid}")]
        public async Task<IActionResult> RemoveMember(string providerId, string uid)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            if (!await _members.RemoveAsync(providerId, uid))
                return Error(404, "member_not_found", "This person has no access.");

            await _audit.LogAsync(actor, AuditActions.MemberRemoved, providerId, null, null,
                new Dictionary<string, object> { ["uid"] = uid });

            return NoContent();
        }

        // ───────────── handing over and deciding ─────────────

        [HttpPost("content/{contentId}/send-to-company")]
        public async Task<IActionResult> SendToCompany(string contentId, [FromBody] HandoverDto? request)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var doc = await _store.GetAsync(contentId);
            if (doc == null) return Error(404, "content_not_found", "Content not found.");

            var data = doc.ToDictionary();
            var providerId = FirestoreApi.GetString(data, "providerId");

            var members = await _members.ListAsync(providerId);
            if (members.Count == 0)
                return Error(409, "no_company_access", "Invite a company contact first.");

            return await Guard(async () =>
            {
                await _review.TransitionAsync(contentId, new[] { ContentStatus.Draft, ContentStatus.ChangesRequested },
                    ContentStatus.CompanyReview, actor, request?.Note, CommentKinds.Handover);

                await _audit.LogAsync(actor, AuditActions.ContentSentToCompany, providerId, contentId, null,
                    new Dictionary<string, object> { ["members"] = members.Count });

                var emailed = 0;
                var failed = 0;

                if (request?.Notify == true && _mailer.IsConfigured)
                {
                    var provider = await ProviderAsync(providerId);
                    var name = provider == null ? string.Empty : FirestoreApi.GetString(provider.ToDictionary(), "name");
                    var language = provider == null ? "de" : FirestoreApi.GetString(provider.ToDictionary(), "defaultLanguage", "de");

                    foreach (var member in members)
                    {
                        var email = member.GetValueOrDefault("email")?.ToString() ?? string.Empty;
                        var result = await _mailer.SendReviewRequestAsync(email, name, FirestoreApi.GetString(data, "title"), FirestoreApi.GetString(data, "type"), language);
                        if (result.Sent) emailed++; else failed++;
                    }
                }

                return Ok(new { status = ContentStatus.CompanyReview, emailed, failed });
            });
        }

        [HttpPost("content/{contentId}/decision")]
        public async Task<IActionResult> Decide(string contentId, [FromBody] DecisionDto? request)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var decision = request?.Decision?.Trim().ToLowerInvariant();
            var note = request?.Note?.Trim();

            var plan = decision switch
            {
                "approve" => new DecisionPlan(new[] { ContentStatus.PendingAdminReview, ContentStatus.Draft }, ContentStatus.Approved, false),
                "request_changes" => new DecisionPlan(new[] { ContentStatus.PendingAdminReview }, ContentStatus.ChangesRequested, true),
                "reject" => new DecisionPlan(new[] { ContentStatus.PendingAdminReview }, ContentStatus.Rejected, true),
                "reopen" => new DecisionPlan(new[] { ContentStatus.Rejected }, ContentStatus.Draft, false),
                _ => new DecisionPlan(Array.Empty<string>(), string.Empty, false)
            };

            if (plan.To.Length == 0) return Error(400, "invalid_decision", "Unknown decision.");
            if (plan.NoteRequired && (note?.Length ?? 0) < 3) return Error(400, "note_required", "Please add a short reason.");

            var doc = await _store.GetAsync(contentId);
            if (doc == null) return Error(404, "content_not_found", "Content not found.");

            var providerId = FirestoreApi.GetString(doc.ToDictionary(), "providerId");

            return await Guard(async () =>
            {
                await _review.TransitionAsync(contentId, plan.From, plan.To, actor, note, CommentKinds.Decision);

                await _audit.LogAsync(actor, AuditActions.ContentDecision, providerId, contentId, null,
                    new Dictionary<string, object> { ["decision"] = decision!, ["status"] = plan.To });

                return Ok(new { status = plan.To });
            });
        }

        // ───────────── trail and queue ─────────────

        [HttpGet("content/{contentId}/review")]
        public async Task<IActionResult> GetReview(string contentId)
        {
            var doc = await _store.GetAsync(contentId);
            if (doc == null) return Error(404, "content_not_found", "Content not found.");

            var data = doc.ToDictionary();

            return Ok(new
            {
                status = FirestoreApi.GetString(data, "status"),
                reviewRound = FirestoreApi.GetLong(data, "reviewRound"),
                companyRevisions = FirestoreApi.GetLong(data, "companyRevisions"),
                maxCompanyRevisions = ReviewStore.MaxCompanyRevisionsPerRound,
                comments = await _review.ListCommentsAsync(contentId),
                statusLog = await _review.ListStatusLogAsync(contentId)
            });
        }

        [HttpPost("content/{contentId}/comments")]
        public async Task<IActionResult> Comment(string contentId, [FromBody] CommentDto? request)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var doc = await _store.GetAsync(contentId);
            if (doc == null) return Error(404, "content_not_found", "Content not found.");

            return await Guard(async () =>
            {
                await _review.AddCommentAsync(contentId, actor, request?.Text ?? string.Empty);

                await _audit.LogAsync(actor, AuditActions.ContentCommented, FirestoreApi.GetString(doc.ToDictionary(), "providerId"), contentId);

                return NoContent();
            });
        }

        [HttpGet("review-queue")]
        public async Task<IActionResult> Queue()
        {
            var snapshot = await _firestore.Collection(AiCollections.Content)
                .WhereEqualTo("status", ContentStatus.PendingAdminReview)
                .Limit(50)
                .GetSnapshotAsync();

            var names = new Dictionary<string, string>();
            var rows = new List<Dictionary<string, object?>>();

            foreach (var doc in snapshot.Documents)
            {
                var row = FirestoreApi.ToApi(doc, "blocks", "bodyHtml", "data", "sources", "quality", "notes");
                var providerId = row.GetValueOrDefault("providerId")?.ToString() ?? string.Empty;

                if (!names.TryGetValue(providerId, out var name))
                {
                    var provider = await ProviderAsync(providerId);
                    name = provider == null ? string.Empty : FirestoreApi.GetString(provider.ToDictionary(), "name");
                    names[providerId] = name;
                }

                row["providerName"] = name;
                rows.Add(row);
            }

            return Ok(rows.OrderByDescending(r => r.GetValueOrDefault("updatedAt")?.ToString()).ToList());
        }

        private async Task<IActionResult> Guard(Func<Task<IActionResult>> action)
        {
            try
            {
                return await action();
            }
            catch (ContentGenerationException ex)
            {
                return ex.Code switch
                {
                    "content_not_found" => Error(404, ex.Code, "Content not found."),
                    "invalid_transition" => Error(409, ex.Code, "This step is not possible in the current status."),
                    "comment_required" => Error(400, ex.Code, "Please write a comment."),
                    _ => Error(400, ex.Code, "The request is not valid.")
                };
            }
        }
    }
}
