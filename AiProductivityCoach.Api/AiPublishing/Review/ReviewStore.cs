using Google.Cloud.Firestore;
using AiProductivityCoach.Api.AiPublishing.Content;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Security;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.AiPublishing.Review
{
    public sealed record TransitionResult(string From, string To);

    public static class CommentKinds
    {
        public const string Comment = "comment";
        public const string Submit = "submit";
        public const string Decision = "decision";
        public const string Handover = "handover";
    }

    /// <summary>
    /// Review trail of a draft: status changes (always through the state machine), comments and
    /// the limit of AI revisions a company may request per review round.
    /// </summary>
    public sealed class ReviewStore
    {
        public const int MaxCommentLength = 1500;
        public const int MaxCompanyRevisionsPerRound = 8;

        private readonly FirestoreDb _firestore;

        public ReviewStore(FirestoreDb firestore)
        {
            _firestore = firestore;
        }

        private DocumentReference Content(string contentId) => _firestore.Collection(AiCollections.Content).Document(contentId);

        /// <summary>
        /// Moves a draft to another status. The change is only made when the draft is currently in
        /// one of <paramref name="allowedFrom"/> AND the state machine allows this role to do it.
        /// </summary>
        public async Task<TransitionResult> TransitionAsync(
            string contentId, IReadOnlyCollection<string> allowedFrom, string to, TenantContext actor, string? note, string commentKind)
        {
            var docRef = Content(contentId);
            var cleanNote = DocumentParser.Clean(note, MaxCommentLength);

            return await _firestore.RunTransactionAsync(async tx =>
            {
                var snap = await tx.GetSnapshotAsync(docRef);
                if (!snap.Exists) throw new ContentGenerationException("content_not_found");

                var data = snap.ToDictionary();
                var from = FirestoreApi.GetString(data, "status");

                if (!allowedFrom.Contains(from) || !ContentWorkflow.CanTransition(from, to, actor.Role))
                    throw new ContentGenerationException("invalid_transition", $"{from} -> {to}");

                var now = Timestamp.GetCurrentTimestamp();
                var update = new Dictionary<string, object> { ["status"] = to, ["updatedAt"] = now };

                // Whatever is approved becomes the live version; older approval requests are settled.
                if (to == ContentStatus.Approved)
                {
                    update[VersionApproval.ApprovedField] = VersionApproval.CurrentVersion(data);
                    update[VersionApproval.RequestField] = FieldValue.Delete;
                }

                if (to == ContentStatus.CompanyReview)
                {
                    update["reviewRound"] = FirestoreApi.GetLong(data, "reviewRound") + 1;
                    update["companyRevisions"] = 0;
                }

                tx.Update(docRef, update);

                tx.Set(docRef.Collection(AiCollections.ContentStatusLog).Document(), new Dictionary<string, object>
                {
                    ["from"] = from,
                    ["to"] = to,
                    ["byUid"] = actor.UserId,
                    ["byRole"] = actor.Role,
                    ["note"] = cleanNote,
                    ["at"] = now
                });

                if (cleanNote.Length > 0)
                    tx.Set(docRef.Collection(AiCollections.ContentComments).Document(), CommentData(commentKind, actor, cleanNote, now));

                return new TransitionResult(from, to);
            });
        }

        /// <summary>A company (or admin) asks for the pending changes of a live piece to be approved.</summary>
        public async Task<long> RequestApprovalAsync(string contentId, TenantContext actor, string? note)
        {
            var docRef = Content(contentId);
            var cleanNote = DocumentParser.Clean(note, MaxCommentLength);

            return await _firestore.RunTransactionAsync(async tx =>
            {
                var snap = await tx.GetSnapshotAsync(docRef);
                if (!snap.Exists) throw new ContentGenerationException("content_not_found");

                var data = snap.ToDictionary();
                if (!VersionApproval.IsLive(FirestoreApi.GetString(data, "status")))
                    throw new ContentGenerationException("content_not_live");
                if (!VersionApproval.HasPendingChanges(data))
                    throw new ContentGenerationException("no_pending_changes");
                if (VersionApproval.State(data) == ApprovalStates.Requested)
                    throw new ContentGenerationException("approval_already_requested");

                var now = Timestamp.GetCurrentTimestamp();
                var version = VersionApproval.CurrentVersion(data);

                tx.Update(docRef, new Dictionary<string, object>
                {
                    [VersionApproval.RequestField] = new Dictionary<string, object>
                    {
                        ["state"] = ApprovalStates.Requested,
                        ["version"] = version,
                        ["requestedBy"] = actor.UserId,
                        ["requestedByRole"] = actor.Role,
                        ["requestedAt"] = now,
                        ["note"] = cleanNote
                    },
                    ["updatedAt"] = now
                });

                tx.Set(docRef.Collection(AiCollections.ContentComments).Document(),
                    CommentData(CommentKinds.Submit, actor, cleanNote.Length > 0 ? cleanNote : $"v{version}", now));

                return version;
            });
        }

        /// <summary>
        /// The admin's decision on pending changes: approve makes that version live; the other two send it
        /// back to the company with a reason (the pending version stays, so it can be edited and requested again).
        /// </summary>
        public async Task<long> DecideApprovalAsync(string contentId, string decision, TenantContext actor, string? note)
        {
            var docRef = Content(contentId);
            var cleanNote = DocumentParser.Clean(note, MaxCommentLength);

            return await _firestore.RunTransactionAsync(async tx =>
            {
                var snap = await tx.GetSnapshotAsync(docRef);
                if (!snap.Exists) throw new ContentGenerationException("content_not_found");

                var data = snap.ToDictionary();
                if (!VersionApproval.IsValidDecision(decision)) throw new ContentGenerationException("invalid_decision");
                if (!VersionApproval.CanDecide(data, decision)) throw new ContentGenerationException("no_pending_approval");

                var now = Timestamp.GetCurrentTimestamp();
                var update = new Dictionary<string, object> { ["updatedAt"] = now };
                long live;

                if (decision == "approve")
                {
                    // The requested version if one was asked for, otherwise everything edited so far.
                    var requested = VersionApproval.RequestedVersion(data);
                    live = VersionApproval.State(data) == ApprovalStates.Requested && requested > 0 ? requested : VersionApproval.CurrentVersion(data);

                    update[VersionApproval.ApprovedField] = live;
                    update[VersionApproval.RequestField] = FieldValue.Delete;
                }
                else
                {
                    live = VersionApproval.ApprovedVersion(data);

                    if (cleanNote.Length < 3) throw new ContentGenerationException("note_required");

                    var request = data.TryGetValue(VersionApproval.RequestField, out var raw) && raw is IDictionary<string, object> map
                        ? new Dictionary<string, object>(map)
                        : new Dictionary<string, object>();

                    request["state"] = decision == "reject" ? ApprovalStates.Rejected : ApprovalStates.ChangesRequested;
                    request["decidedBy"] = actor.UserId;
                    request["decidedAt"] = now;
                    request["decisionNote"] = cleanNote;
                    update[VersionApproval.RequestField] = request;
                }

                tx.Update(docRef, update);

                // An approval without a note needs no comment of its own.
                if (cleanNote.Length > 0)
                    tx.Set(docRef.Collection(AiCollections.ContentComments).Document(),
                        CommentData(CommentKinds.Decision, actor, cleanNote, now));

                return live;
            });
        }

        public async Task AddCommentAsync(string contentId, TenantContext actor, string text)
        {
            var clean = DocumentParser.Clean(text, MaxCommentLength);
            if (clean.Length == 0) throw new ContentGenerationException("comment_required");

            await Content(contentId).Collection(AiCollections.ContentComments).AddAsync(
                CommentData(CommentKinds.Comment, actor, clean, Timestamp.GetCurrentTimestamp()));
        }

        public async Task<List<Dictionary<string, object?>>> ListCommentsAsync(string contentId)
        {
            var snapshot = await Content(contentId).Collection(AiCollections.ContentComments).Limit(200).GetSnapshotAsync();

            return snapshot.Documents
                .Select(doc => FirestoreApi.ToApi(doc))
                .OrderBy(row => row.TryGetValue("createdAt", out var v) ? v?.ToString() : "")
                .ToList();
        }

        public async Task<List<Dictionary<string, object?>>> ListStatusLogAsync(string contentId)
        {
            var snapshot = await Content(contentId).Collection(AiCollections.ContentStatusLog).Limit(100).GetSnapshotAsync();

            return snapshot.Documents
                .Select(doc => FirestoreApi.ToApi(doc))
                .OrderBy(row => row.TryGetValue("at", out var v) ? v?.ToString() : "")
                .ToList();
        }

        /// <summary>Counts one AI revision requested by a company; false when the round's limit is used up.</summary>
        public async Task<int?> ReserveCompanyRevisionAsync(string contentId)
        {
            var docRef = Content(contentId);

            return await _firestore.RunTransactionAsync(async tx =>
            {
                var snap = await tx.GetSnapshotAsync(docRef);
                if (!snap.Exists) return (int?)null;

                var used = (int)FirestoreApi.GetLong(snap.ToDictionary(), "companyRevisions");
                if (used >= MaxCompanyRevisionsPerRound) return null;

                tx.Update(docRef, "companyRevisions", used + 1);
                return MaxCompanyRevisionsPerRound - used - 1;
            });
        }

        /// <summary>Gives a reserved revision back (the job was not started after all).</summary>
        public async Task ReleaseCompanyRevisionAsync(string contentId)
        {
            var docRef = Content(contentId);

            await _firestore.RunTransactionAsync(async tx =>
            {
                var snap = await tx.GetSnapshotAsync(docRef);
                if (!snap.Exists) return;

                var used = (int)FirestoreApi.GetLong(snap.ToDictionary(), "companyRevisions");
                if (used > 0) tx.Update(docRef, "companyRevisions", used - 1);
            });
        }

        public async Task DeleteTrailAsync(string contentId)
        {
            var docRef = Content(contentId);

            foreach (var name in new[] { AiCollections.ContentComments, AiCollections.ContentStatusLog })
            {
                var snapshot = await docRef.Collection(name).GetSnapshotAsync();
                var batch = _firestore.StartBatch();
                foreach (var doc in snapshot.Documents) batch.Delete(doc.Reference);
                await batch.CommitAsync();
            }
        }

        private static Dictionary<string, object> CommentData(string kind, TenantContext actor, string text, Timestamp at) => new()
        {
            ["kind"] = kind,
            ["authorUid"] = actor.UserId,
            ["authorRole"] = actor.Role,
            ["authorLabel"] = string.IsNullOrWhiteSpace(actor.Email) ? actor.Role : actor.Email,
            ["text"] = text,
            ["createdAt"] = at
        };
    }
}
