using System.Net;
using System.Net.Sockets;

namespace AiProductivityCoach.Api.AiPublishing.Security
{
    /// <summary>
    /// Validation and normalisation of admin-supplied source URLs.
    /// Protects the crawler against SSRF: only public http(s) hosts are allowed.
    /// </summary>
    public static class UrlSafety
    {
        public sealed record Result(bool Ok, string? Normalized, string? Host, string? Error)
        {
            public static Result Fail(string error) => new(false, null, null, error);
        }

        private static readonly string[] BlockedSuffixes =
        {
            ".localhost", ".local", ".internal", ".lan", ".home", ".corp", ".intranet", ".test", ".invalid"
        };

        public static Result Normalize(string? input)
        {
            var raw = input?.Trim() ?? string.Empty;

            if (raw.Length == 0) return Result.Fail("url_required");
            if (raw.Length > 2000) return Result.Fail("url_too_long");

            if (!raw.Contains("://", StringComparison.Ordinal))
                raw = "https://" + raw;

            if (!Uri.TryCreate(raw, UriKind.Absolute, out var uri))
                return Result.Fail("url_invalid");

            if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
                return Result.Fail("url_scheme");

            if (!string.IsNullOrEmpty(uri.UserInfo))
                return Result.Fail("url_credentials");

            if (!uri.IsDefaultPort)
                return Result.Fail("url_port");

            if (uri.HostNameType == UriHostNameType.IPv4 ||
                uri.HostNameType == UriHostNameType.IPv6 ||
                IPAddress.TryParse(uri.Host, out _))
                return Result.Fail("url_ip_not_allowed");

            var host = uri.IdnHost.ToLowerInvariant().TrimEnd('.');

            if (host.Length == 0 || host.Length > 253 || !host.Contains('.'))
                return Result.Fail("url_host");

            if (host == "localhost" || BlockedSuffixes.Any(s => host.EndsWith(s, StringComparison.Ordinal)))
                return Result.Fail("url_host_blocked");

            var path = uri.AbsolutePath.TrimEnd('/');
            var normalized = $"{uri.Scheme}://{host}{path}{uri.Query}";

            return new Result(true, normalized, host, null);
        }

        /// <summary>True only for globally routable unicast addresses.</summary>
        public static bool IsPublicAddress(IPAddress ip)
        {
            if (ip.IsIPv4MappedToIPv6)
                ip = ip.MapToIPv4();

            if (IPAddress.IsLoopback(ip) || ip.Equals(IPAddress.Any) || ip.Equals(IPAddress.IPv6Any) ||
                ip.Equals(IPAddress.None))
                return false;

            if (ip.AddressFamily == AddressFamily.InterNetwork)
            {
                var b = ip.GetAddressBytes();

                return !(
                    b[0] == 0 ||
                    b[0] == 10 ||
                    (b[0] == 100 && b[1] >= 64 && b[1] <= 127) ||
                    b[0] == 127 ||
                    (b[0] == 169 && b[1] == 254) ||
                    (b[0] == 172 && b[1] >= 16 && b[1] <= 31) ||
                    (b[0] == 192 && b[1] == 0 && b[2] == 0) ||
                    (b[0] == 192 && b[1] == 0 && b[2] == 2) ||
                    (b[0] == 192 && b[1] == 168) ||
                    (b[0] == 198 && (b[1] == 18 || b[1] == 19)) ||
                    (b[0] == 198 && b[1] == 51 && b[2] == 100) ||
                    (b[0] == 203 && b[1] == 0 && b[2] == 113) ||
                    b[0] >= 224);
            }

            if (ip.AddressFamily == AddressFamily.InterNetworkV6)
            {
                var b = ip.GetAddressBytes();

                return !(
                    ip.IsIPv6LinkLocal ||
                    ip.IsIPv6SiteLocal ||
                    ip.IsIPv6Multicast ||
                    (b[0] & 0xFE) == 0xFC ||                                  // fc00::/7 unique local
                    (b[0] == 0x20 && b[1] == 0x01 && b[2] == 0x0D && b[3] == 0xB8) || // 2001:db8::/32
                    (b[0] == 0x00 && b[1] == 0x64 && b[2] == 0xFF && b[3] == 0x9B));  // 64:ff9b::/96 NAT64
            }

            return false;
        }
    }
}
