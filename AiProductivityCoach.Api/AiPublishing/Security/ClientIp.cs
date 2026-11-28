namespace AiProductivityCoach.Api.AiPublishing.Security
{
    /// <summary>
    /// The caller's address for rate limiting. Behind the host's proxy this is the real visitor, because the
    /// forwarded-headers middleware (see Program.cs) has already replaced the connection address with the one
    /// the proxy reports; without it every visitor would look like the proxy and share one limit.
    /// </summary>
    public static class ClientIp
    {
        public static string Of(HttpContext context) => context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    }
}
