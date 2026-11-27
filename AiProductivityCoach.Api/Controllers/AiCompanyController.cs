using Google.Cloud.Firestore;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AiProductivityCoach.Api.AiPublishing.Ai;
using AiProductivityCoach.Api.AiPublishing.Booking;
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
        private readonly ContentRevisionService _revisions;
        private readonly PricingStore _pricing;
        private readonly BookingStore _bookings;
        private readonly InvitationMailer _mailer;

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
            ILlmClient llm,
            ContentRevisionService revisions,
            PricingStore pricing,
            BookingStore bookings,
            InvitationMailer mailer)
        {
            _revisions = revisions;
            _pricing = pricing;
            _bookings = bookings;
            _mailer = mailer;
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
                        ["coverUrl"] = row.GetValueOrDefault("coverUrl"), ["providerName"] = providerName,
                        ["marker"] = row.GetValueOrDefault("marker"),
                        ["hasPendingChanges"] = VersionApproval.HasPendingChanges(ToData(row)),
                        ["approvalState"] = VersionApproval.State(ToData(row))
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
            row["canEdit"] = VersionApproval.CompanyMayEdit(status);

            row["approvedVersion"] = VersionApproval.ApprovedVersion(data);
            row["hasPendingChanges"] = VersionApproval.HasPendingChanges(data);
            row["approvalState"] = VersionApproval.State(data);
            row["canRequestApproval"] = VersionApproval.CanRequest(data);

            return Ok(row);
        }

        /// <summary>
        /// The company edits the text itself. In its review round this changes the draft; once the piece is
        /// live the edit becomes a pending version that still needs the admin's approval, and the live
        /// version stays untouched.
        /// </summary>
        [HttpPut("contents/{contentId}")]
        public async Task<IActionResult> EditContent(string contentId, [FromBody] EditDocumentDto? request)
        {
            var (doc, providerId, status, error) = await LoadAsync(contentId);
            if (error != null) return error;

            var actor = Actor!;

            if (request == null) return Error(400, "invalid_document", "The document is missing.");
            if (!VersionApproval.CompanyMayEdit(status))
                return Error(409, "not_editable", "This content cannot be changed right now.");

            var jobs = await _jobs.ListForProviderAsync(providerId, 100);
            if (jobs.Any(job =>
                {
                    var jobStatus = job.GetValueOrDefault("status")?.ToString() ?? string.Empty;
                    return JobStatus.IsActive(jobStatus) || jobStatus == JobStatus.Queued;
                }))
                return Error(409, "provider_busy", "Another change is still being processed. Please try again in a minute.");

            try
            {
                // A live piece keeps its approved version; this edit becomes a pending version.
                if (VersionApproval.IsLive(status)) await _store.EnsureApprovedVersionAsync(contentId);

                var result = await _revisions.SaveEditAsync(contentId, request, actor.UserId);

                await _audit.LogAsync(actor, AuditActions.ContentEdited, providerId, contentId, null,
                    new Dictionary<string, object> { ["version"] = result.Version, ["byCompany"] = true });

                return Ok(new { contentId, version = result.Version, words = result.Words });
            }
            catch (ContentGenerationException ex)
            {
                return ex.Code switch
                {
                    "content_not_found" => Error(404, ex.Code, "Content not found."),
                    "missing_title" or "empty_body" or "too_many_blocks" or "invalid_block" or "invalid_document"
                        => Error(400, ex.Code, "The document is not valid."),
                    _ => Error(400, ex.Code, "The request is not valid.")
                };
            }
        }

        // ───────────── booking (commercial; separate from editorial approval) ─────────────

        public class BookingDto
        {
            public string? Date { get; set; }
            public string? TimePeriod { get; set; }
            public int Leads { get; set; }
            public string? TargetGroup { get; set; }
        }

        /// <summary>What booking this piece would cost, and the bookings already made for it.</summary>
        [HttpGet("contents/{contentId}/booking")]
        public async Task<IActionResult> GetBooking(string contentId)
        {
            var (doc, _, _, error) = await LoadAsync(contentId);
            if (error != null) return error;

            var data = doc!.ToDictionary();
            var type = FirestoreApi.GetString(data, "type");
            if (!BookingPricing.IsBookable(type)) return Error(404, "not_bookable", "This content cannot be booked.");

            var rates = BookingPricing.Effective(type, await _pricing.LoadAsync(), PricingStore.PieceOverride(data).BaseCents, PricingStore.PieceOverride(data).PerLeadCents);

            return Ok(new
            {
                type,
                priced = BookingPricing.IsPriced(type, rates),
                baseCents = rates.BaseCents,
                perLeadCents = rates.PerLeadCents,
                currency = "EUR",
                timePeriods = BookingPricing.TimePeriods,
                bookings = (await _bookings.ListForContentAsync(contentId)).Select(b => new
                {
                    id = b["id"], date = b.GetValueOrDefault("date"), timePeriod = b.GetValueOrDefault("timePeriod"),
                    leads = b.GetValueOrDefault("leads"), priceCents = b.GetValueOrDefault("priceCents"),
                    status = b.GetValueOrDefault("status"), createdAt = b.GetValueOrDefault("createdAt")
                })
            });
        }

        /// <summary>
        /// Books a whitepaper or webinar campaign. The price is always calculated here from the stored
        /// rates; nothing the browser shows or sends decides it.
        /// </summary>
        [HttpPost("contents/{contentId}/booking")]
        public async Task<IActionResult> Book(string contentId, [FromBody] BookingDto? request)
        {
            var (doc, providerId, _, error) = await LoadAsync(contentId);
            if (error != null) return error;

            var actor = Actor!;
            var data = doc!.ToDictionary();
            var type = FirestoreApi.GetString(data, "type");

            var input = new BookingRequest(type, request?.Date, request?.TimePeriod, request?.Leads ?? 0, request?.TargetGroup);
            var check = BookingPricing.Validate(input, DateOnly.FromDateTime(DateTime.UtcNow));
            if (!check.Ok) return Error(400, check.Code!, "The booking is not valid.");

            var (pieceBase, piecePerLead) = PricingStore.PieceOverride(data);
            var rates = BookingPricing.Effective(type, await _pricing.LoadAsync(), pieceBase, piecePerLead);
            if (!BookingPricing.IsPriced(type, rates))
                return Error(409, "pricing_not_configured", "Booking is not available yet because no price is set.");

            long price;
            try { price = BookingPricing.Calculate(type, rates, input.Leads); }
            catch (OverflowException) { return Error(400, "invalid_leads", "The booking is not valid."); }
            if (price > BookingPricing.MaxCents) return Error(400, "invalid_leads", "The booking is not valid.");

            var providerName = await ProviderNameAsync(providerId);
            var title = FirestoreApi.GetString(data, "title");
            var targetGroup = DocumentParser.Clean(input.TargetGroup, BookingPricing.MaxTargetGroupLength);
            var period = input.TimePeriod!.Trim().ToLowerInvariant();

            var bookingId = await _bookings.CreateAsync(new Dictionary<string, object>
            {
                ["providerId"] = providerId, ["providerName"] = providerName,
                ["contentId"] = contentId, ["contentType"] = type, ["contentTitle"] = title,
                ["createdByUid"] = actor.UserId, ["createdByEmail"] = actor.Email ?? string.Empty,
                ["date"] = input.Date!.Trim(), ["timePeriod"] = period, ["leads"] = input.Leads,
                ["targetGroup"] = targetGroup,
                ["priceCents"] = price, ["baseCents"] = rates.BaseCents, ["perLeadCents"] = rates.PerLeadCents,
                ["currency"] = "EUR"
            });

            await _audit.LogAsync(actor, AuditActions.BookingCreated, providerId, contentId, null,
                new Dictionary<string, object> { ["bookingId"] = bookingId, ["priceCents"] = price, ["leads"] = input.Leads });

            await _notifications.NotifyAdminsAsync(actor.Platform, providerId, null, "booking", "info",
                $"Neue Buchung: {title} ({providerName})", $"New booking: {title} ({providerName})");

            // The booking is already saved; a failed email must never lose it.
            var emailSent = false;
            var notify = (await _pricing.LoadAsync()).AdminEmail;
            if (!string.IsNullOrWhiteSpace(notify))
            {
                var mail = await _mailer.SendBookingNotificationAsync(notify, new InvitationMailer.BookingNotice(
                    providerName, title, type, actor.Email ?? string.Empty, input.Date!.Trim(), period, input.Leads, targetGroup, price));
                emailSent = mail.Sent;
            }

            return Ok(new { id = bookingId, priceCents = price, emailSent });
        }

        public class ApprovalRequestDto
        {
            public string? Note { get; set; }
        }

        /// <summary>The company asks for the pending changes of its live piece to be approved.</summary>
        [HttpPost("contents/{contentId}/approval-request")]
        public async Task<IActionResult> RequestApproval(string contentId, [FromBody] ApprovalRequestDto? request)
        {
            var (doc, providerId, _, error) = await LoadAsync(contentId);
            if (error != null) return error;

            var actor = Actor!;

            try
            {
                var version = await _review.RequestApprovalAsync(contentId, actor, request?.Note);

                await _audit.LogAsync(actor, AuditActions.ApprovalRequested, providerId, contentId, null,
                    new Dictionary<string, object> { ["version"] = version });

                return Ok(new { version });
            }
            catch (ContentGenerationException ex)
            {
                return ex.Code switch
                {
                    "content_not_live" => Error(409, ex.Code, "This content is not live."),
                    "no_pending_changes" => Error(409, ex.Code, "There are no changes waiting for approval."),
                    "approval_already_requested" => Error(409, ex.Code, "Approval has already been requested."),
                    _ => Error(400, ex.Code, "The request is not valid.")
                };
            }
        }

        private static Dictionary<string, object> ToData(Dictionary<string, object?> row) =>
            row.Where(pair => pair.Value != null).ToDictionary(pair => pair.Key, pair => pair.Value!);

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
