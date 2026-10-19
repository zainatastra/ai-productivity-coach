namespace AiProductivityCoach.Api.AiPublishing.Domain
{
    public static class ContentStatus
    {
        public const string Draft = "draft";
        public const string CompanyReview = "company_review";
        public const string PendingAdminReview = "pending_admin_review";
        public const string ChangesRequested = "changes_requested";
        public const string Rejected = "rejected";
        public const string Approved = "approved";
        public const string Published = "published";
        public const string Unpublished = "unpublished";
        public const string Archived = "archived";

        public static readonly string[] All =
        {
            Draft, CompanyReview, PendingAdminReview, ChangesRequested,
            Rejected, Approved, Published, Unpublished, Archived
        };
    }

    /// <summary>
    /// Deterministic content state machine (spec section 29).
    /// The backend is the only authority: callers must go through
    /// <see cref="CanTransition"/>; the AI never changes status itself.
    /// </summary>
    public static class ContentWorkflow
    {
        private const string Admin = AiRoles.Admin;
        private const string Company = AiRoles.CompanyPublisher;

        // (from, to) -> roles allowed to perform the transition.
        private static readonly Dictionary<(string From, string To), string[]> Rules = new()
        {
            // Admin hands the draft to the invited company for review.
            { (ContentStatus.Draft, ContentStatus.CompanyReview), new[] { Admin } },

            // Admin may approve their own reviewed draft directly (initial content is
            // published by the admin). Company submissions always go through
            // pending_admin_review.
            { (ContentStatus.Draft, ContentStatus.Approved), new[] { Admin } },

            // Company (or admin) submits reviewed/revised content for admin review.
            { (ContentStatus.CompanyReview, ContentStatus.PendingAdminReview), new[] { Company, Admin } },

            // Admin decisions.
            { (ContentStatus.PendingAdminReview, ContentStatus.Approved), new[] { Admin } },
            { (ContentStatus.PendingAdminReview, ContentStatus.ChangesRequested), new[] { Admin } },
            { (ContentStatus.PendingAdminReview, ContentStatus.Rejected), new[] { Admin } },

            // Changes requested go back to the company; rejected can be reopened.
            { (ContentStatus.ChangesRequested, ContentStatus.CompanyReview), new[] { Admin } },
            { (ContentStatus.Rejected, ContentStatus.Draft), new[] { Admin } },

            // Publishing authority belongs to the admin only.
            { (ContentStatus.Approved, ContentStatus.Published), new[] { Admin } },

            // Lifecycle after publication.
            { (ContentStatus.Published, ContentStatus.Unpublished), new[] { Admin } },
            { (ContentStatus.Published, ContentStatus.Archived), new[] { Admin } },
            { (ContentStatus.Unpublished, ContentStatus.Published), new[] { Admin } },
            { (ContentStatus.Unpublished, ContentStatus.Archived), new[] { Admin } },
            { (ContentStatus.Archived, ContentStatus.Draft), new[] { Admin } },
        };

        public static bool CanTransition(string? from, string? to, string? role)
        {
            if (from == null || to == null || role == null) return false;

            return Rules.TryGetValue((from, to), out var roles) &&
                   roles.Contains(role);
        }

        public static IReadOnlyList<string> AllowedTargets(string? from, string? role)
        {
            if (from == null || role == null) return Array.Empty<string>();

            return Rules
                .Where(rule => rule.Key.From == from && rule.Value.Contains(role))
                .Select(rule => rule.Key.To)
                .ToList();
        }
    }
}
