using Google.Cloud.Firestore;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AiProductivityCoach.Api.AiPublishing.Content;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Pdf;
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
        private readonly ContentPdfBuilder _pdfs;
        private readonly ILogger<AiReviewController> _logger;

        public AiReviewController(
            FirestoreDb firestore,
            InvitationService invitations,
            MembershipService members,
            InvitationMailer mailer,
            ReviewStore review,
            ContentStore store,
            AiAuditService audit,
            ContentPdfBuilder pdfs,
            ILogger<AiReviewController> logger)
        {
            _firestore = firestore;
            _invitations = invitations;
            _members = members;
            _mailer = mailer;
            _review = review;
            _store = store;
            _audit = audit;
            _pdfs = pdfs;
            _logger = logger;
        }

        public class InviteDto
        {
            public string? Email { get; set; }
            public string? Platform { get; set; }
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
            var provider = await ProviderAsync(providerId);
            if (provider == null) return Error(404, "provider_not_found", "Provider not found.");

            return Ok(new
            {
                invitations = await _invitations.ListAsync(providerId),
                members = await _members.ListAsync(providerId),
                emailConfigured = _mailer.IsConfigured,
                sentTo = PlatformAccess.SentStates(provider.ToDictionary())
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

            // The company is invited to ONE platform, chosen here - not to whichever one the admin belongs to.
            var platform = request?.Platform?.Trim().ToLowerInvariant();
            if (!Platforms.IsValid(platform)) return Error(400, "invalid_platform", "Choose the platform to invite the company to.");

            // Each platform has its own preview: nobody can be invited before the profile was sent there.
            if (!PlatformAccess.IsSentTo(data, platform!))
                return Error(409, "not_sent_to_platform", "Send the profile to this platform first.");

            var (id, token) = await _invitations.CreateAsync(providerId, email, platform!, actor.UserId);
            var link = _mailer.InviteLink(token);

            await _audit.LogAsync(actor, AuditActions.InvitationCreated, providerId, null, null,
                new Dictionary<string, object> { ["invitationId"] = id, ["email"] = email, ["platform"] = platform! });

            var emailed = new MailResult(false, null);

            if (request?.SendEmail == true)
            {
                emailed = await _mailer.SendInvitationAsync(email, FirestoreApi.GetString(data, "name"), link, FirestoreApi.GetString(data, "defaultLanguage", "de"), platform);

                if (emailed.Sent)
                    await _audit.LogAsync(actor, AuditActions.InvitationEmailSent, providerId, null, null,
                        new Dictionary<string, object> { ["invitationId"] = id });
            }

            // The link is only ever shown here: afterwards just its hash exists.
            return StatusCode(201, new { id, email, platform, acceptUrl = link, emailSent = emailed.Sent, emailError = emailed.Error });
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
                    var providerData = provider?.ToDictionary() ?? new Dictionary<string, object>();
                    var name = FirestoreApi.GetString(providerData, "name");
                    var language = FirestoreApi.GetString(providerData, "defaultLanguage", "de");
                    var title = FirestoreApi.GetString(data, "title");
                    var type = FirestoreApi.GetString(data, "type");

                    // Fetched once for everybody; a failure here only means the email goes out with the link alone.
                    PreparedContentPdf? prepared = null;
                    try
                    {
                        prepared = await _pdfs.PrepareAsync(providerData, contentId, data, language, HttpContext.RequestAborted);
                    }
                    catch (Exception ex) when (ex is not OperationCanceledException)
                    {
                        _logger.LogWarning(ex, "[Review] Could not prepare the PDF for {ContentId}; sending the link only.", contentId);
                    }

                    var link = $"{_mailer.ReviewLink}?content={Uri.EscapeDataString(contentId)}";

                    foreach (var member in members)
                    {
                        var email = member.GetValueOrDefault("email")?.ToString() ?? string.Empty;
                        var memberPlatform = member.GetValueOrDefault("platform")?.ToString();

                        InvitationMailer.MailAttachment? attachment = null;
                        if (prepared != null)
                        {
                            try
                            {
                                var watermark = $"{email} \u2022 {DateTime.UtcNow:yyyy-MM-dd HH:mm} UTC";
                                attachment = new InvitationMailer.MailAttachment(ContentPdfBuilder.FileName(title), ContentPdfBuilder.Render(prepared, watermark, _logger));
                            }
                            catch (Exception ex)
                            {
                                _logger.LogWarning(ex, "[Review] Could not render the PDF for {ContentId}; sending the link only.", contentId);
                            }
                        }

                        var result = await _mailer.SendReviewRequestAsync(email, name, title, type, language, link, attachment, memberPlatform);
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
                currentVersion = VersionApproval.CurrentVersion(data),
                approvedVersion = VersionApproval.ApprovedVersion(data),
                hasPendingChanges = VersionApproval.HasPendingChanges(data),
                approvalRequest = data.TryGetValue(VersionApproval.RequestField, out var rawRequest) && rawRequest is Dictionary<string, object> requestMap
                    ? FirestoreApi.Convert(requestMap)
                    : null,
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

        public class ApprovalDecisionDto
        {
            public string? Decision { get; set; }
            public string? Note { get; set; }
        }

        /// <summary>Approve, send back or reject the pending changes of a live piece.</summary>
        [HttpPost("content/{contentId}/approval-decision")]
        public async Task<IActionResult> DecideApproval(string contentId, [FromBody] ApprovalDecisionDto? request)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var decision = request?.Decision?.Trim().ToLowerInvariant();
            if (!VersionApproval.IsValidDecision(decision)) return Error(400, "invalid_decision", "Unknown decision.");

            var doc = await _store.GetAsync(contentId);
            if (doc == null) return Error(404, "content_not_found", "Content not found.");

            var providerId = FirestoreApi.GetString(doc.ToDictionary(), "providerId");

            return await Guard(async () =>
            {
                var live = await _review.DecideApprovalAsync(contentId, decision!, actor, request?.Note);

                await _audit.LogAsync(actor, AuditActions.ApprovalDecided, providerId, contentId, null,
                    new Dictionary<string, object> { ["decision"] = decision!, ["liveVersion"] = live });

                return Ok(new { liveVersion = live, decision });
            });
        }

        /// <summary>Live pieces whose changes wait for an admin decision.</summary>
        [HttpGet("approval-queue")]
        public async Task<IActionResult> ApprovalQueue()
        {
            var snapshot = await _firestore.Collection(AiCollections.Content)
                .WhereEqualTo($"{VersionApproval.RequestField}.state", ApprovalStates.Requested)
                .Limit(50)
                .GetSnapshotAsync();

            var names = new Dictionary<string, string>();
            var rows = new List<Dictionary<string, object?>>();

            foreach (var doc in snapshot.Documents)
            {
                var data = doc.ToDictionary();
                var providerId = FirestoreApi.GetString(data, "providerId");

                if (!names.TryGetValue(providerId, out var name))
                {
                    var provider = await ProviderAsync(providerId);
                    name = provider == null ? string.Empty : FirestoreApi.GetString(provider.ToDictionary(), "name");
                    names[providerId] = name;
                }

                var request = data.TryGetValue(VersionApproval.RequestField, out var raw) && raw is IDictionary<string, object> map
                    ? FirestoreApi.Convert(new Dictionary<string, object>(map))
                    : null;

                rows.Add(new Dictionary<string, object?>
                {
                    ["id"] = doc.Id, ["providerId"] = providerId, ["providerName"] = name,
                    ["type"] = FirestoreApi.GetString(data, "type"), ["title"] = FirestoreApi.GetString(data, "title"),
                    ["status"] = FirestoreApi.GetString(data, "status"),
                    ["liveVersion"] = VersionApproval.ApprovedVersion(data), ["requestedVersion"] = VersionApproval.RequestedVersion(data),
                    ["request"] = request
                });
            }

            return Ok(rows.OrderByDescending(r => (r["request"] as Dictionary<string, object?>)?.GetValueOrDefault("requestedAt")?.ToString()).ToList());
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
                    "no_pending_approval" => Error(409, ex.Code, "There are no pending changes to decide on."),
                    "note_required" => Error(400, ex.Code, "Please add a short reason."),
                    "invalid_decision" => Error(400, ex.Code, "Unknown decision."),
                    _ => Error(400, ex.Code, "The request is not valid.")
                };
            }
        }
    }
}
