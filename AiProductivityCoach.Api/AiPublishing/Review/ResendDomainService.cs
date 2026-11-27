using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace AiProductivityCoach.Api.AiPublishing.Review
{
    public sealed record DnsRecord(string Purpose, string Type, string Name, string Value, string Status, string Ttl, int? Priority);

    public sealed record SenderDomain(string Id, string Name, string Status, IReadOnlyList<DnsRecord> Records)
    {
        public bool IsVerified => string.Equals(Status, "verified", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>Outcome of a call to Resend's domain API. A restricted (send-only) key cannot manage domains at all.</summary>
    public sealed record DomainResult<T>(bool Available, T? Value, string? Error);

    /// <summary>
    /// Manages sender domains through Resend - the service the engine already sends its emails with -
    /// so the admin can add a domain, see the DNS records (CNAME/TXT/MX) to enter at the DNS provider,
    /// and verify it. An email can only go out from an address on a verified domain.
    /// </summary>
    public sealed class ResendDomainService
    {
        private static readonly Regex Hostname = new(@"^(?=.{4,100}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$", RegexOptions.Compiled);

        private readonly IHttpClientFactory _http;
        private readonly IConfiguration _configuration;
        private readonly ILogger<ResendDomainService> _logger;

        public ResendDomainService(IHttpClientFactory http, IConfiguration configuration, ILogger<ResendDomainService> logger)
        {
            _http = http;
            _configuration = configuration;
            _logger = logger;
        }

        public bool IsConfigured => !string.IsNullOrWhiteSpace(_configuration["Resend:ApiKey"]);

        public static string? NormalizeDomain(string? value)
        {
            var domain = value?.Trim().ToLowerInvariant().TrimEnd('.');
            return domain != null && Hostname.IsMatch(domain) ? domain : null;
        }

        /// <summary>The part after the @ of a valid address, or null.</summary>
        public static string? DomainOf(string? address)
        {
            var normalized = InvitationTokens.NormalizeEmail(address);
            return normalized == null ? null : normalized[(normalized.IndexOf('@') + 1)..];
        }

        /// <summary>
        /// Whether mail may be sent from this address: its domain is verified at Resend, or - when the
        /// domain list cannot be read - it is on the domain the engine already sends from.
        /// </summary>
        public static bool IsUsableSender(string? address, IReadOnlyList<SenderDomain>? domains, string defaultAddress)
        {
            var domain = DomainOf(address);
            if (domain == null) return false;

            if (domains == null) return domain == DomainOf(defaultAddress);

            return domains.Any(d => d.IsVerified && string.Equals(d.Name, domain, StringComparison.OrdinalIgnoreCase));
        }

        public async Task<DomainResult<List<SenderDomain>>> ListAsync(CancellationToken ct = default)
        {
            var (ok, status, doc) = await SendAsync(HttpMethod.Get, "domains", null, ct);
            if (!ok) return new DomainResult<List<SenderDomain>>(status is not (401 or 403), null, Describe(status));

            var list = new List<SenderDomain>();
            if (doc != null && doc.RootElement.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Array)
                foreach (var item in data.EnumerateArray()) list.Add(ParseDomain(item));

            return new DomainResult<List<SenderDomain>>(true, list, null);
        }

        public async Task<DomainResult<SenderDomain>> GetAsync(string id, CancellationToken ct = default)
        {
            var (ok, status, doc) = await SendAsync(HttpMethod.Get, $"domains/{Uri.EscapeDataString(id)}", null, ct);
            return ok && doc != null
                ? new DomainResult<SenderDomain>(true, ParseDomain(doc.RootElement), null)
                : new DomainResult<SenderDomain>(status is not (401 or 403), null, Describe(status));
        }

        public async Task<DomainResult<SenderDomain>> CreateAsync(string name, CancellationToken ct = default)
        {
            var (ok, status, doc) = await SendAsync(HttpMethod.Post, "domains", new { name }, ct);
            return ok && doc != null
                ? new DomainResult<SenderDomain>(true, ParseDomain(doc.RootElement), null)
                : new DomainResult<SenderDomain>(status is not (401 or 403), null, Describe(status));
        }

        /// <summary>Asks Resend to check the DNS records now; the result is read back with <see cref="GetAsync"/>.</summary>
        public async Task<DomainResult<SenderDomain>> VerifyAsync(string id, CancellationToken ct = default)
        {
            var (ok, status, _) = await SendAsync(HttpMethod.Post, $"domains/{Uri.EscapeDataString(id)}/verify", new { }, ct);
            if (!ok) return new DomainResult<SenderDomain>(status is not (401 or 403), null, Describe(status));

            return await GetAsync(id, ct);
        }

        /// <summary>Reads one domain object as Resend returns it (list entry or single domain with records).</summary>
        public static SenderDomain ParseDomain(JsonElement element)
        {
            string Text(JsonElement e, string name) =>
                e.TryGetProperty(name, out var v) && v.ValueKind is JsonValueKind.String ? v.GetString() ?? string.Empty
                : e.TryGetProperty(name, out var n) && n.ValueKind == JsonValueKind.Number ? n.ToString() : string.Empty;

            var records = new List<DnsRecord>();
            if (element.TryGetProperty("records", out var raw) && raw.ValueKind == JsonValueKind.Array)
            {
                foreach (var r in raw.EnumerateArray())
                {
                    int? priority = r.TryGetProperty("priority", out var p) && p.ValueKind == JsonValueKind.Number ? p.GetInt32() : null;
                    records.Add(new DnsRecord(Text(r, "record"), Text(r, "type"), Text(r, "name"), Text(r, "value"), Text(r, "status"), Text(r, "ttl"), priority));
                }
            }

            return new SenderDomain(Text(element, "id"), Text(element, "name"), Text(element, "status"), records);
        }

        private static string Describe(int status) => status switch
        {
            401 or 403 => "restricted_api_key",
            404 => "domain_not_found",
            422 or 400 => "domain_rejected",
            429 => "too_many_requests",
            0 => "unreachable",
            _ => $"resend_{status}"
        };

        private async Task<(bool Ok, int Status, JsonDocument? Body)> SendAsync(HttpMethod method, string path, object? payload, CancellationToken ct)
        {
            var apiKey = _configuration["Resend:ApiKey"];
            if (string.IsNullOrWhiteSpace(apiKey)) return (false, 401, null);

            try
            {
                var client = _http.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(20);

                using var request = new HttpRequestMessage(method, $"https://api.resend.com/{path}");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
                if (payload != null) request.Content = JsonContent.Create(payload);

                using var response = await client.SendAsync(request, ct);
                var text = await response.Content.ReadAsStringAsync(ct);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning("[Resend] {Method} {Path} answered {Status}: {Body}", method, path, (int)response.StatusCode, text.Length > 200 ? text[..200] : text);
                    return (false, (int)response.StatusCode, null);
                }

                return (true, (int)response.StatusCode, text.Length > 0 ? JsonDocument.Parse(text) : null);
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
            {
                _logger.LogWarning(ex, "[Resend] {Method} {Path} failed.", method, path);
                return (false, 0, null);
            }
        }
    }
}
