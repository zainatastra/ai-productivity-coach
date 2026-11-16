namespace AiProductivityCoach.Api.AiPublishing.Acquisition
{
    public sealed record CompanySendResult(string CompanyId, string Slug, bool Created, int ContentSynced);

    public sealed record CompanySendStatus(bool Sent, string CompanyId, string Slug, DateTime? SentAt);

    public sealed class PlatformNotSupportedException : Exception
    {
        public PlatformNotSupportedException(string message) : base(message) { }
    }

    /// <summary>
    /// Bridges one AI Publishing provider (collection <c>ai_providers</c>, the engine's own private
    /// workspace) onto a real, platform-owned directory record. Spec section 9: "MIDRANGE built
    /// behind an adapter interface, EY ERIC first". Every implementation must only ever write a
    /// private, non-public record - nothing here may approve, publish or otherwise make the result
    /// visible on the live site; that stays a separate, deliberate admin action on the target
    /// platform's own review flow.
    /// </summary>
    public interface ICompanyPublishAdapter
    {
        string Platform { get; }

        Task<CompanySendResult> SendAsync(string providerId, CancellationToken ct);

        Task<CompanySendStatus> GetStatusAsync(string providerId, CancellationToken ct);
    }
}
