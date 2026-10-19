using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace AiProductivityCoach.Api.AiPublishing.Security
{
    public sealed record FetchResult(
        bool Ok,
        int? HttpStatus,
        string FinalUrl,
        string? ContentType,
        string? Title,
        string? Language,
        string? Hash,
        int TextLength,
        string? ErrorCode);

    /// <summary>
    /// HTTP fetcher for admin-supplied source URLs.
    /// - Every connection is checked against the public-address rule at connect time
    ///   (also protects against DNS rebinding).
    /// - Redirects are followed manually and re-validated (max 5).
    /// - Response size and time are capped.
    /// Never pretends success: unreachable or empty pages return an error code.
    /// </summary>
    public sealed class SafeHttpFetcher : IDisposable
    {
        private const int MaxRedirects = 5;
        private const int MaxBodyBytes = 2 * 1024 * 1024;
        private const int MinTextLength = 200;
        private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(20);

        private readonly HttpClient _client;

        public SafeHttpFetcher()
        {
            var handler = new SocketsHttpHandler
            {
                AllowAutoRedirect = false,
                ConnectTimeout = TimeSpan.FromSeconds(10),
                PooledConnectionLifetime = TimeSpan.FromMinutes(2),
                AutomaticDecompression = DecompressionMethods.All,
                UseProxy = false,
                ConnectCallback = ConnectToPublicAddressAsync
            };

            _client = new HttpClient(handler, disposeHandler: true)
            {
                Timeout = Timeout.InfiniteTimeSpan
            };

            _client.DefaultRequestHeaders.UserAgent.ParseAdd("EyEricResearchBot/1.0");
            _client.DefaultRequestHeaders.Accept.ParseAdd("text/html,application/xhtml+xml,application/pdf;q=0.8,*/*;q=0.5");
            _client.DefaultRequestHeaders.AcceptLanguage.ParseAdd("de,en;q=0.7");
        }

        private static async ValueTask<Stream> ConnectToPublicAddressAsync(
            SocketsHttpConnectionContext context,
            CancellationToken cancellationToken)
        {
            var host = context.DnsEndPoint.Host;
            var addresses = await Dns.GetHostAddressesAsync(host, cancellationToken);

            if (addresses.Length == 0 || addresses.Any(a => !UrlSafety.IsPublicAddress(a)))
                throw new HttpRequestException("blocked_address");

            Exception? last = null;

            foreach (var address in addresses)
            {
                var socket = new Socket(address.AddressFamily, SocketType.Stream, ProtocolType.Tcp)
                {
                    NoDelay = true
                };

                try
                {
                    await socket.ConnectAsync(
                        new IPEndPoint(address, context.DnsEndPoint.Port),
                        cancellationToken);

                    return new NetworkStream(socket, ownsSocket: true);
                }
                catch (Exception ex)
                {
                    socket.Dispose();
                    last = ex;
                }
            }

            throw new HttpRequestException("connect_failed", last);
        }

        public async Task<FetchResult> FetchAsync(string url, CancellationToken cancellationToken)
        {
            var current = url;

            try
            {
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                timeout.CancelAfter(RequestTimeout);

                for (var hop = 0; hop <= MaxRedirects; hop++)
                {
                    var check = UrlSafety.Normalize(current);
                    if (!check.Ok)
                        return Fail(current, null, "unsafe_url");

                    using var request = new HttpRequestMessage(HttpMethod.Get, current);
                    using var response = await _client.SendAsync(
                        request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);

                    var status = (int)response.StatusCode;

                    if (status is 301 or 302 or 303 or 307 or 308)
                    {
                        var location = response.Headers.Location;
                        if (location == null) return Fail(current, status, "http_error");

                        current = location.IsAbsoluteUri
                            ? location.AbsoluteUri
                            : new Uri(new Uri(current), location).AbsoluteUri;
                        continue;
                    }

                    if (status == 401 || status == 403 || status == 429)
                        return Fail(current, status, "blocked");
                    if (status == 404 || status == 410)
                        return Fail(current, status, "not_found");
                    if (status < 200 || status >= 300)
                        return Fail(current, status, "http_error");

                    var contentType = response.Content.Headers.ContentType?.MediaType?.ToLowerInvariant();

                    if (contentType == "application/pdf")
                    {
                        return new FetchResult(true, status, current, contentType, null, null, null, 0, null);
                    }

                    if (contentType != null &&
                        contentType != "text/html" &&
                        contentType != "application/xhtml+xml" &&
                        contentType != "text/plain")
                    {
                        return Fail(current, status, "unsupported_content", contentType);
                    }

                    var body = await ReadLimitedAsync(response, timeout.Token);
                    if (body == null)
                        return Fail(current, status, "too_large", contentType);

                    var html = DecodeBody(body, response.Content.Headers.ContentType?.CharSet);
                    var title = ExtractTitle(html);
                    var language = ExtractLanguage(html);
                    var textLength = ExtractTextLength(html);
                    var hash = Convert.ToHexString(SHA256.HashData(body)).ToLowerInvariant();

                    if (textLength < MinTextLength)
                    {
                        // Typical for JavaScript-only shells; the admin should add other links.
                        return new FetchResult(false, status, current, contentType, title, language, hash,
                            textLength, "empty_content");
                    }

                    return new FetchResult(true, status, current, contentType, title, language, hash,
                        textLength, null);
                }

                return Fail(current, null, "too_many_redirects");
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                return Fail(current, null, "timeout");
            }
            catch (HttpRequestException ex)
            {
                var code = IsBlockedAddress(ex) ? "unsafe_url"
                    : ex.InnerException is SocketException { SocketErrorCode: SocketError.HostNotFound } ? "dns_error"
                    : "connection_failed";
                return Fail(current, null, code);
            }
            catch (SocketException)
            {
                return Fail(current, null, "dns_error");
            }
        }

        private static bool IsBlockedAddress(Exception ex)
        {
            for (Exception? current = ex; current != null; current = current.InnerException)
            {
                if (current.Message == "blocked_address")
                    return true;
            }

            return false;
        }

        private static FetchResult Fail(string url, int? status, string code, string? contentType = null) =>
            new(false, status, url, contentType, null, null, null, 0, code);

        private static async Task<byte[]?> ReadLimitedAsync(HttpResponseMessage response, CancellationToken ct)
        {
            await using var stream = await response.Content.ReadAsStreamAsync(ct);
            using var buffer = new MemoryStream();
            var chunk = new byte[16 * 1024];
            int read;

            while ((read = await stream.ReadAsync(chunk, ct)) > 0)
            {
                if (buffer.Length + read > MaxBodyBytes)
                    return null;

                buffer.Write(chunk, 0, read);
            }

            return buffer.ToArray();
        }

        private static string DecodeBody(byte[] body, string? charset)
        {
            try
            {
                if (!string.IsNullOrWhiteSpace(charset))
                    return Encoding.GetEncoding(charset.Trim('"')).GetString(body);
            }
            catch (ArgumentException)
            {
                // fall through to UTF-8
            }

            return Encoding.UTF8.GetString(body);
        }

        private static string? ExtractTitle(string html)
        {
            var match = Regex.Match(html, @"<title[^>]*>(.*?)</title>",
                RegexOptions.IgnoreCase | RegexOptions.Singleline);

            if (!match.Success) return null;

            var title = WebUtility.HtmlDecode(Regex.Replace(match.Groups[1].Value, @"\s+", " ")).Trim();
            if (title.Length == 0) return null;

            return title.Length > 200 ? title[..200] : title;
        }

        private static string? ExtractLanguage(string html)
        {
            var match = Regex.Match(html, @"<html[^>]*\blang\s*=\s*[""']?([a-zA-Z\-]{2,10})",
                RegexOptions.IgnoreCase);

            return match.Success ? match.Groups[1].Value.ToLowerInvariant() : null;
        }

        private static int ExtractTextLength(string html)
        {
            var text = Regex.Replace(html, @"<(script|style|noscript|svg)[^>]*>.*?</\1\s*>", " ",
                RegexOptions.IgnoreCase | RegexOptions.Singleline);
            text = Regex.Replace(text, @"<!--.*?-->", " ", RegexOptions.Singleline);
            text = Regex.Replace(text, @"<[^>]+>", " ");
            text = WebUtility.HtmlDecode(text);
            text = Regex.Replace(text, @"\s+", " ").Trim();

            return text.Length;
        }

        public void Dispose() => _client.Dispose();
    }
}
