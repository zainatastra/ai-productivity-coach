using Google.Cloud.Firestore;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AiProductivityCoach.Api.AiPublishing.Ai;
using AiProductivityCoach.Api.AiPublishing.Content;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Jobs;
using AiProductivityCoach.Api.AiPublishing.Media;
using AiProductivityCoach.Api.AiPublishing.Review;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.Controllers
{
    /// <summary>
    /// What an invited company may do: read the drafts handed to it, comment, ask the AI to
    /// improve a draft (limited per round) and submit it to the admin. A company can NEVER edit
    /// text directly, see other providers, publish or approve. Access comes only from
    /// ai_provider_members, which the admin controls.
    /// </summary>
    [ApiController]
    [Route("api/ai/company")]
    [Authorize(Policy = "PublisherOnly")]
    public class AiCompanyController : AiControllerBase
    {
        private static readonly string[] VisibleStatuses =
        {
            ContentStatus.CompanyReview, ContentStatus.PendingAdminReview, ContentStatus.ChangesRequested,
            ContentStatus.Rejected, ContentStatus.Approved, ContentStatus.Published
        };

        private static readonly string[] CommentStatuses =
        {
            ContentStatus.CompanyReview, ContentStatus.PendingAdminReview, ContentStatus.ChangesRequested
        };

        private static readonly string[] HiddenFields =
        {
            "model", "llmProvider", "jobId", "createdBy", "createdByAI", "quality", "notes", "bodyHtml",
            "platforms", "sources", "language"
        };

        private readonly FirestoreDb _firestore;
        private readonly MembershipService _members;
        private readonly InvitationService _invitations;
        private readonly ContentStore _store;
        private readonly MediaStore _media;
        private readonly ReviewStore _review;
        private readonly AiJobService _jobs;
        private readonly AiAuditService _audit;
        private readonly AiNotificationService _notifications;
        private readonly ILlmClient _llm;

        public AiCompanyController(
            FirestoreDb firestore,
            MembershipService members,
            InvitationService invitations,
            ContentStore store,
            MediaStore media,
            ReviewStore review,
            AiJobService jobs,
            AiAuditService audit,
            AiNotificationService notifications,
            ILlmClient llm)
        {
            _firestore = firestore;
            _members = members;
            _invitations = invitations;
            _store = store;
            _media = media;
            _review = review;
            _jobs = jobs;
            _audit = audit;
            _notifications = notifications;
            _llm = llm;
        }

        public class ReviseDto { public string? Instruction { get; set; } }
        public class CommentDto { public string? Text { get; set; } }
        public class SubmitDto { public string? Note { get; set; } }
        public class AcceptDto { public string? Token { get; set; } }

        // ───────────── helpers ─────────────

        private async Task<string> ProviderNameAsync(string providerId)
        {
            var snap = await _firestore.Collection(AiCollections.Providers).Document(providerId).GetSnapshotAsync();
            return snap.Exists ? FirestoreApi.GetString(snap.ToDictionary(), "name") : string.Empty;
        }

        /// <summary>Loads a draft only when the caller belongs to its provider and it was handed over.</summary>
        private async Task<(DocumentSnapshot? Doc, string ProviderId, string Status, IActionResult? Error)> LoadAsync(string contentId)
        {
            var actor = Actor;
            if (actor == null || actor.Role != AiRoles.CompanyPublisher)
                return (null, string.Empty, string.Empty, Unauthorized());

            var doc = await _store.GetAsync(contentId);
            var notFound = Error(404, "content_not_found", "Content not found.");
            if (doc == null) return (null, string.Empty, string.Empty, notFound);

            var data = doc.ToDictionary();
            var providerId = FirestoreApi.GetString(data, "providerId");
            var status = FirestoreApi.GetString(data, "status");

            // Same answer for "does not exist", "not yours" and "not handed over": nothing is revealed.
            if (!await _members.IsMemberAsync(providerId, actor.UserId) || !VisibleStatuses.Contains(status))
                return (null, providerId, status, notFound);

            return (doc, providerId, status, null);
        }

        // ───────────── overview ─────────────

        [HttpGet("me")]
        public async Task<IActionResult> Me()
        {
            var actor = Actor;
            if (actor == null) return Unauthorized();

            var providers = new List<object>();
            foreach (var id in await _members.ProviderIdsOfAsync(actor.UserId))
                providers.Add(new { id, name = await ProviderNameAsync(id) });

            return Ok(new { email = actor.Email, providers });
        }

        [HttpGet("contents")]
        public async Task<IActionResult> List()
        {
            var actor = Actor;
            if (actor == null || actor.Role != AiRoles.CompanyPublisher) return Unauthorized();

            var rows = new List<Dictionary<string, object?>>();

            foreach (var providerId in await _members.ProviderIdsOfAsync(actor.UserId))
            {
                var providerName = await ProviderNameAsync(providerId);

                foreach (var row in await _store.ListAsync(providerId))
                {
                    var status = row.GetValueOrDefault("status")?.ToString() ?? string.Empty;
                    if (!VisibleStatuses.Contains(status)) continue;

                    var slim = new Dictionary<string, object?>
                    {
                        ["id"] = row["id"], ["type"] = row.GetValueOrDefault("type"), ["title"] = row.GetValueOrDefault("title"),
                        ["status"] = status, ["wordCount"] = row.GetValueOrDefault("wordCount"),
                        ["currentVersion"] = row.GetValueOrDefault("currentVersion"), ["updatedAt"] = row.GetValueOrDefault("updatedAt"),
                        ["coverUrl"] = row.GetValueOrDefault("coverUrl"), ["providerName"] = providerName
                    };
                    rows.Add(slim);
                }
            }

            return Ok(rows.OrderByDescending(r => r["updatedAt"]?.ToString()).ToList());
        }

        [HttpGet("contents/{contentId}")]
        public async Task<IActionResult> Detail(string contentId)
        {
            var (doc, providerId, status, error) = await LoadAsync(contentId);
            if (error != null) return error;

            var row = FirestoreApi.ToApi(doc!, HiddenFields);
            var data = doc!.ToDictionary();

            var sources = ContentDocumentMapper.SourcesFromStored(data)
                .Where(s => s.Used)
                .Select(s => new { number = s.Number, url = s.Url, title = s.Title })
                .ToList();

            var used = (int)FirestoreApi.GetLong(data, "companyRevisions");
            var left = Math.Max(0, ReviewStore.MaxCompanyRevisionsPerRound - used);

            row["providerName"] = await ProviderNameAsync(providerId);
            row["sources"] = sources;
            row["media"] = (await _media.ListAsync(contentId))
                .Select(m => new { id = m["id"], url = m.GetValueOrDefault("url"), altText = m.GetValueOrDefault("altText") }).ToList();
            row["versions"] = (await _store.ListVersionsAsync(contentId))
                .Select(v => new
                {
                    versionNumber = v.GetValueOrDefault("versionNumber"),
                    createdAt = v.GetValueOrDefault("createdAt"),
                    revisionInstruction = v.GetValueOrDefault("revisionInstruction"),
                    byAi = v.GetValueOrDefault("createdByAI") is true && (v.GetValueOrDefault("llmProvider")?.ToString() ?? "") != "manual"
                }).ToList();
            row["comments"] = (await _review.ListCommentsAsync(contentId))
                .Select(c => new { id = c["id"], kind = c.GetValueOrDefault("kind"), authorRole = c.GetValueOrDefault("authorRole"), text = c.GetValueOrDefault("text"), createdAt = c.GetValueOrDefault("createdAt") }).ToList();
            row["statusLog"] = (await _review.ListStatusLogAsync(contentId))
                .Select(l => new { from = l.GetValueOrDefault("from"), to = l.GetValueOrDefault("to"), byRole = l.GetValueOrDefault("byRole"), at = l.GetValueOrDefault("at") }).ToList();

            row["revisionsLeft"] = left;
            row["maxRevisions"] = ReviewStore.MaxCompanyRevisionsPerRound;
            row["canRevise"] = status == ContentStatus.CompanyReview && left > 0 && _llm.IsConfigured;
            row["canSubmit"] = status == ContentStatus.CompanyReview;
            row["canComment"] = CommentStatuses.Contains(status);

            return Ok(row);
        }

        // ───────────── actions ─────────────

        [HttpPost("contents/{contentId}/revise")]
        public async Task<IActionResult> Revise(string contentId, [FromBody] ReviseDto? request)
        {
            var (doc, providerId, status, error) = await LoadAsync(contentId);
            if (error != null) return error;

            var actor = Actor!;

            if (status != ContentStatus.CompanyReview)
                return Error(409, "not_in_review", "This content is not open for your changes.");

            var instruction = request?.Instruction?.Trim() ?? string.Empty;
            if (instruction.Length < 3) return Error(400, "instruction_required", "Please describe what should change.");
            if (instruction.Length > ContentPrompts.MaxInstructionLength) instruction = instruction[..ContentPrompts.MaxInstructionLength];

            if (!_llm.IsConfigured) return Error(503, "ai_not_configured", "The AI is not available right now.");

            var remaining = await _review.ReserveCompanyRevisionAsync(contentId);
            if (remaining == null)
                return Error(429, "revision_limit", "The limit of AI improvements for this review round is reached. Please submit the draft or leave a comment.");

            var payload = new Dictionary<string, object> { ["contentId"] = contentId, ["instruction"] = instruction };

            var (jobId, alreadyActive) = await _jobs.CreateAsync(
                JobTypes.Revise, providerId, actor.Platform, actor.UserId, payload, RevisionJobHandler.InitialSteps());

            if (alreadyActive)
            {
                await _review.ReleaseCompanyRevisionAsync(contentId);
                return Error(409, "provider_busy", "Another change is still being processed. Please try again in a minute.");
            }

            await _audit.LogAsync(actor, AuditActions.CompanyRevisionRequested, providerId, contentId, null,
                new Dictionary<string, object> { ["jobId"] = jobId, ["remaining"] = remaining.Value });

            return Accepted(new { jobId, revisionsLeft = remaining.Value });
        }

        [HttpGet("jobs/{jobId}")]
        public async Task<IActionResult> Job(string jobId)
        {
            var actor = Actor;
            if (actor == null || actor.Role != AiRoles.CompanyPublisher) return Unauthorized();

            var job = await _jobs.GetAsync(jobId);
            var notFound = Error(404, "job_not_found", "Job not found.");
            if (job == null) return notFound;

            var data = job.ToDictionary();

            // Only the person who started the job, and only inside the own provider.
            if (FirestoreApi.GetString(data, "createdBy") != actor.UserId ||
                !await _members.IsMemberAsync(FirestoreApi.GetString(data, "providerId"), actor.UserId))
                return notFound;

            return Ok(new
            {
                status = FirestoreApi.GetString(data, "status"),
                progress = FirestoreApi.GetLong(data, "progress"),
                done = !JobStatus.IsRunnable(FirestoreApi.GetString(data, "status")),
                failed = FirestoreApi.GetString(data, "status") is JobStatus.Failed or JobStatus.Cancelled
            });
        }

        [HttpPost("contents/{contentId}/comments")]
        public async Task<IActionResult> Comment(string contentId, [FromBody] CommentDto? request)
        {
            var (doc, providerId, status, error) = await LoadAsync(contentId);
            if (error != null) return error;

            if (!CommentStatuses.Contains(status))
                return Error(409, "comments_closed", "Comments are closed for this content.");

            var actor = Actor!;

            return await Guard(async () =>
            {
                await _review.AddCommentAsync(contentId, actor, request?.Text ?? string.Empty);

                await _audit.LogAsync(actor, AuditActions.ContentCommented, providerId, contentId);
                await _notifications.NotifyAdminsAsync(actor.Platform, providerId, null, "company_commented", "info",
                    $"Neuer Kommentar des Unternehmens zu „{FirestoreApi.GetString(doc!.ToDictionary(), "title")}“.",
                    $"New comment from the company on “{FirestoreApi.GetString(doc.ToDictionary(), "title")}”.");

                return NoContent();
            });
        }

        [HttpPost("contents/{contentId}/submit")]
        public async Task<IActionResult> Submit(string contentId, [FromBody] SubmitDto? request)
        {
            var (doc, providerId, status, error) = await LoadAsync(contentId);
            if (error != null) return error;

            var actor = Actor!;

            // A running AI improvement would still change the text after it was submitted.
            var jobs = await _jobs.ListForProviderAsync(providerId, 100);
            if (jobs.Any(j => JobStatus.IsRunnable(j.GetValueOrDefault("status")?.ToString() ?? string.Empty)))
                return Error(409, "provider_busy", "An AI improvement is still running. Please wait until it is finished.");

            return await Guard(async () =>
            {
                await _review.TransitionAsync(contentId, new[] { ContentStatus.CompanyReview },
                    ContentStatus.PendingAdminReview, actor, request?.Note, CommentKinds.Submit);

                var title = FirestoreApi.GetString(doc!.ToDictionary(), "title");
                await _audit.LogAsync(actor, AuditActions.ContentSubmittedByCompany, providerId, contentId);
                await _notifications.NotifyAdminsAsync(actor.Platform, providerId, null, "content_submitted", "success",
                    $"„{title}“ wurde vom Unternehmen zur Freigabe eingereicht.",
                    $"“{title}” was submitted by the company for approval.");

                return Ok(new { status = ContentStatus.PendingAdminReview });
            });
        }

        // ───────────── accepting an invitation with an existing account ─────────────

        [HttpPost("invitations/accept")]
        public async Task<IActionResult> Accept([FromBody] AcceptDto? request)
        {
            var actor = Actor;
            if (actor == null || actor.Role != AiRoles.CompanyPublisher) return Unauthorized();

            var info = await _invitations.FindByTokenAsync(request?.Token ?? string.Empty);
            if (info == null || !info.IsUsable)
                return Error(400, "invalid_invitation", "This invitation is not valid any more.");

            // The invitation belongs to one email address: nobody else can use the link.
            if (!string.Equals(info.Email, actor.Email.Trim(), StringComparison.OrdinalIgnoreCase))
                return Error(403, "wrong_account", "This invitation was sent to a different email address.");

            if (info.Platform != actor.Platform)
                return Error(409, "platform_mismatch", "This invitation belongs to a different platform.");

            if (!await _invitations.MarkAcceptedAsync(info.Id, actor.UserId))
                return Error(409, "invalid_invitation", "This invitation was already used.");

            await _members.AddAsync(info.ProviderId, actor.UserId, info.Email, info.Platform, info.Id);
            await _audit.LogAsync(actor, AuditActions.InvitationAccepted, info.ProviderId, null, null,
                new Dictionary<string, object> { ["invitationId"] = info.Id, ["existingAccount"] = true });

            return Ok(new { providerId = info.ProviderId, providerName = await ProviderNameAsync(info.ProviderId) });
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
