using AiProductivityCoach.Api.AiPublishing.Content;
using AiProductivityCoach.Api.AiPublishing.Review;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.AiPublishing.Claims
{
    public static class ClaimStates
    {
        public const string Pending = "pending";
        public const string Approved = "approved";
        public const string Rejected = "rejected";
    }

    public sealed record ClaimInput(string? Name, string? Email, string? Position, string? Phone, string? Message);

    public sealed record ClaimValidation(bool Ok, string? Code, string Name, string Email, string Position, string Phone, string Message);

    /// <summary>
    /// The rules of the Claim flow. A claim is only a request: it never gives anybody access. The profile has
    /// to be live and still without an owner, the claimant has to identify themselves, and an admin decides.
    /// </summary>
    public static class ClaimRules
    {
        public const int MaxName = 120;
        public const int MaxPosition = 120;
        public const int MaxPhone = 40;
        public const int MaxMessage = 1000;

        /// <summary>Only a published profile with no owner can be claimed (an admin-created, unclaimed one).</summary>
        public static bool IsClaimable(IDictionary<string, object> company) =>
            string.Equals(FirestoreApi.GetString(company, "status"), "published", StringComparison.OrdinalIgnoreCase) &&
            FirestoreApi.GetLong(company, "approvedVersion") > 0 &&
            string.IsNullOrWhiteSpace(FirestoreApi.GetString(company, "ownerUid"));

        public static ClaimValidation Validate(ClaimInput input)
        {
            var name = DocumentParser.Clean(input.Name, MaxName + 1);
            var position = DocumentParser.Clean(input.Position, MaxPosition + 1);
            var phone = DocumentParser.Clean(input.Phone, MaxPhone + 1);
            var message = DocumentParser.Clean(input.Message, MaxMessage + 1);
            var email = InvitationTokens.NormalizeEmail(input.Email) ?? string.Empty;

            ClaimValidation Fail(string code) => new(false, code, name, email, position, phone, message);

            if (name.Length < 2) return Fail("claim_name_required");
            if (name.Length > MaxName) return Fail("claim_name_too_long");
            if (email.Length == 0) return Fail("claim_email_invalid");
            if (position.Length < 2) return Fail("claim_position_required");
            if (position.Length > MaxPosition) return Fail("claim_position_too_long");
            if (phone.Length > MaxPhone) return Fail("claim_phone_too_long");
            if (message.Length > MaxMessage) return Fail("claim_message_too_long");

            return new(true, null, name, email, position, phone, message);
        }

        public static bool IsValidDecision(string? decision) => decision is "approve" or "reject";

        /// <summary>Decisions only apply to a request that is still waiting.</summary>
        public static bool CanDecide(string? state) => state == ClaimStates.Pending;
    }
}
