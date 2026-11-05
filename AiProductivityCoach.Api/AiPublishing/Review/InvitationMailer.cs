using System.Net;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using AiProductivityCoach.Api.AiPublishing.Content;

namespace AiProductivityCoach.Api.AiPublishing.Review
{
    public sealed record MailResult(bool Sent, string? Error);

    /// <summary>
    /// Sends the invitation, review-request and password-reset emails through Resend (same sender
    /// address as the login codes). The texts are the defaults in <see cref="EmailTemplates"/>
    /// plus whatever the admin changed in the email settings.
    /// </summary>
    public sealed class InvitationMailer
    {
        public const string FromAddress = "auth@astrasoftdigital.com";
        public const string DefaultPublicUrl = "https://ai-productivity-coach-zeta.vercel.app";
        private const string LogoUrl = DefaultPublicUrl + "/logo.png";

        // The website's font. Apple Mail and most phone mail apps load it; Gmail and Outlook ignore web
        // fonts and use the fallbacks, so the email looks clean everywhere.
        public const string FontStack = "'Plus Jakarta Sans',Arial,Helvetica,sans-serif";
        private const string FontLink = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap";

        private readonly IHttpClientFactory _http;
        private readonly IConfiguration _configuration;
        private readonly EmailTemplateStore _templates;
        private readonly ILogger<InvitationMailer> _logger;

        public InvitationMailer(IHttpClientFactory http, IConfiguration configuration, EmailTemplateStore templates, ILogger<InvitationMailer> logger)
        {
            _http = http;
            _configuration = configuration;
            _templates = templates;
            _logger = logger;
        }

        public bool IsConfigured => !string.IsNullOrWhiteSpace(_configuration["Resend:ApiKey"]);

        /// <summary>
        /// Public address of the live website: the address in every email. It never falls back to
        /// localhost, so a link in an email always works for the recipient.
        /// Order: INVITE_BASE_URL, Invitations:PublicUrl, then the built-in live address.
        /// </summary>
        public string FrontendBaseUrl => ResolveBaseUrl(
            Environment.GetEnvironmentVariable("INVITE_BASE_URL"), _configuration["Invitations:PublicUrl"]);

        public static string ResolveBaseUrl(string? fromEnvironment, string? fromConfiguration)
        {
            foreach (var candidate in new[] { fromEnvironment, fromConfiguration })
            {
                var value = candidate?.Trim().TrimEnd('/');

                if (!string.IsNullOrEmpty(value) && Uri.TryCreate(value, UriKind.Absolute, out var uri) &&
                    uri.Scheme == Uri.UriSchemeHttps)
                    return value;
            }

            return DefaultPublicUrl;
        }

        public string InviteLink(string token) => $"{FrontendBaseUrl}/publisher/invite?token={Uri.EscapeDataString(token)}";

        public string ReviewLink => $"{FrontendBaseUrl}/publisher/ai-review";

        public string LoginLink => $"{FrontendBaseUrl}/publisher/login";

        // ───────────── sending ─────────────

        public async Task<MailResult> SendInvitationAsync(string to, string providerName, string link, string language)
        {
            var content = await _templates.EffectiveAsync(EmailKinds.Invitation, language);
            var values = new Dictionary<string, string>
            {
                ["company"] = providerName, ["email"] = to, ["days"] = EmailTemplates.InviteDays.ToString()
            };

            var (subject, html) = Render(EmailKinds.Invitation, language, content, values, link);
            return await SendAsync(to, subject, html);
        }

        public async Task<MailResult> SendReviewRequestAsync(string to, string providerName, string contentTitle, string contentType, string language)
        {
            var content = await _templates.EffectiveAsync(EmailKinds.Review, language);
            var values = new Dictionary<string, string>
            {
                ["company"] = providerName, ["email"] = to, ["title"] = contentTitle, ["type"] = TypeLabel(contentType, IsEnglish(language))
            };

            var (subject, html) = Render(EmailKinds.Review, language, content, values, ReviewLink);
            return await SendAsync(to, subject, html);
        }

        public async Task<MailResult> SendPasswordResetAsync(string to, string link, string language)
        {
            var content = await _templates.EffectiveAsync(EmailKinds.Reset, language);
            var (subject, html) = Render(EmailKinds.Reset, language, content, new Dictionary<string, string> { ["email"] = to }, link);
            return await SendAsync(to, subject, html);
        }

        /// <summary>Sends the stored template with sample data to one address (the admin's own).</summary>
        public async Task<MailResult> SendTestAsync(string to, string kind, string language)
        {
            var content = await _templates.EffectiveAsync(kind, language);
            var (subject, html) = Render(kind, language, content, EmailTemplates.SampleValues(kind, language), LoginLink);
            return await SendAsync(to, "[Test] " + subject, html);
        }

        // ───────────── building the email ─────────────

        public static bool IsEnglish(string? language) => string.Equals(language, "en", StringComparison.OrdinalIgnoreCase);

        public static string TypeLabel(string? type, bool en) => type switch
        {
            "article" => en ? "article" : "Artikel",
            "whitepaper" => en ? "whitepaper" : "Whitepaper",
            "webinar" => en ? "webinar" : "Webinar",
            _ => en ? "content" : "Inhalt"
        };

        public static string InvitationSubject(string providerName, string language) =>
            OneLine(EmailTemplates.Fill(EmailTemplates.Default(EmailKinds.Invitation, language).Subject,
                new Dictionary<string, string> { ["company"] = providerName }));

        public static string ReviewSubject(string providerName, string language) =>
            OneLine(EmailTemplates.Fill(EmailTemplates.Default(EmailKinds.Review, language).Subject,
                new Dictionary<string, string> { ["company"] = providerName }));

        public static string BuildInvitationHtml(string providerName, string email, string link, string language) =>
            Body(EmailKinds.Invitation, language, EmailTemplates.Default(EmailKinds.Invitation, language),
                new Dictionary<string, string> { ["company"] = providerName, ["email"] = email, ["days"] = EmailTemplates.InviteDays.ToString() }, link);

        public static string BuildReviewRequestHtml(string providerName, string contentTitle, string contentType, string link, string language) =>
            Body(EmailKinds.Review, language, EmailTemplates.Default(EmailKinds.Review, language),
                new Dictionary<string, string> { ["company"] = providerName, ["title"] = contentTitle, ["type"] = TypeLabel(contentType, IsEnglish(language)) }, link);

        /// <summary>The subject and the complete HTML document for any template content.</summary>
        public static (string Subject, string Html) Render(
            string kind, string language, EmailContent content, IReadOnlyDictionary<string, string> values, string link) =>
            (OneLine(EmailTemplates.Fill(content.Subject, values)), Document(Body(kind, language, content, values, link)));

        /// <summary>Wraps the email body in a complete HTML document that loads the website font.</summary>
        public static string Document(string body) => $@"<!DOCTYPE html>
<html lang='de'>
<head>
<meta charset='utf-8' />
<meta name='viewport' content='width=device-width, initial-scale=1' />
<link href='{FontLink}' rel='stylesheet' type='text/css' />
<style>
  body, div, p, h1, td, a, strong {{ font-family: {FontStack} !important; }}
</style>
</head>
<body style='margin:0;padding:0;font-family:{FontStack}'>
{body}
</body>
</html>";

        private static string OneLine(string value) => Regex.Replace(value ?? string.Empty, @"[\r\n]+", " ").Trim();

        // Every admin-written text is HTML-encoded here (only **bold** is allowed), so a template can never inject markup.
        private static string Text(string text, IReadOnlyDictionary<string, string> values) =>
            HtmlRenderer.Inline(EmailTemplates.Fill(text, values)).Replace("\n", "<br/>");

        private static string Body(string kind, string language, EmailContent content, IReadOnlyDictionary<string, string> values, string link)
        {
            var en = IsEnglish(language);
            string Encoded(string key) => WebUtility.HtmlEncode(values.GetValueOrDefault(key) ?? string.Empty);

            string cardTitle, cardSub;
            switch (kind)
            {
                case EmailKinds.Invitation:
                    cardTitle = Encoded("company");
                    cardSub = (en ? "Access for " : "Zugang für ") + Encoded("email");
                    break;
                case EmailKinds.Review:
                    cardTitle = Encoded("title");
                    cardSub = Encoded("type");
                    break;
                default:
                    cardTitle = Encoded("email");
                    cardSub = en ? "Access to content review" : "Zugang zur Inhaltsprüfung";
                    break;
            }

            return Frame(
                Text(content.Heading, values),
                en ? "Hello," : "Guten Tag,",
                Text(content.Intro, values),
                cardTitle,
                cardSub,
                Text(content.BulletsTitle, values),
                content.Bullets.Select(b => Text(b, values)).ToArray(),
                link,
                Text(content.Button, values),
                en ? "The button does not work? Copy this link into your browser:" : "Der Button funktioniert nicht? Kopieren Sie diesen Link in Ihren Browser:",
                content.Notes.Select(n => Text(n, values)).ToArray());
        }

        // All dynamic parts passed in here are already HTML-encoded by the callers.
        private static string Frame(
            string heading, string greeting, string intro, string cardTitle, string cardSub,
            string listTitle, string[] list, string link, string button, string fallbackText, string[] notes)
        {
            var safeLink = WebUtility.HtmlEncode(link);
            var noteHtml = string.Concat(notes.Select(n => $"<p style='margin:0 0 4px;color:#6b7280;font-size:12px;line-height:1.5'>{n}</p>"));

            var listBlock = list.Length == 0 ? string.Empty : $@"<p style='margin:0 0 8px;color:#111827;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.04em'>{listTitle}</p>
    <table role='presentation' cellspacing='0' cellpadding='0' style='margin:0 0 24px'>{string.Concat(list.Select(i => $"<tr><td style='padding:0 10px 6px 0;vertical-align:top;color:#059669;font-weight:700'>&#10003;</td><td style='padding:0 0 6px 0;color:#374151;font-size:14px;line-height:1.5'>{i}</td></tr>"))}</table>";

            return $@"<div style='background:#f3f4f6;padding:32px 12px;font-family:{FontStack}'>
<div style='max-width:540px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden'>
  <div style='padding:26px 32px 0;text-align:center'>
    <img src='{LogoUrl}' alt='AI-Productivity Coach' style='height:44px;object-fit:contain' />
  </div>
  <div style='padding:22px 32px 30px'>
    <h1 style='margin:0 0 18px;font-size:22px;line-height:1.3;color:#111827;text-align:center'>{heading}</h1>
    <p style='margin:0 0 8px;color:#111827;font-size:15px'>{greeting}</p>
    <p style='margin:0 0 18px;color:#374151;font-size:15px;line-height:1.6'>{intro}</p>

    <div style='margin:0 0 20px;padding:14px 16px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px'>
      <div style='font-size:16px;font-weight:700;color:#0c4a6e'>{cardTitle}</div>
      <div style='font-size:12.5px;color:#0369a1;margin-top:2px'>{cardSub}</div>
    </div>

    {listBlock}

    <div style='text-align:center;margin:0 0 20px'>
      <a href='{safeLink}' style='display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:14px 30px;border-radius:999px;font-weight:700;font-size:15px'>{button}</a>
    </div>

    <p style='margin:0 0 4px;color:#6b7280;font-size:12px'>{fallbackText}</p>
    <p style='margin:0 0 20px;font-size:12px;word-break:break-all'><a href='{safeLink}' style='color:#2563eb'>{safeLink}</a></p>

    <div style='border-top:1px solid #f0f0f0;padding-top:14px'>{noteHtml}</div>
  </div>
</div>
<p style='text-align:center;color:#9ca3af;font-size:11px;margin:16px 0 0'>AI-Productivity Coach · {FromAddress}</p>
</div>";
        }

        private async Task<MailResult> SendAsync(string to, string subject, string html)
        {
            var apiKey = _configuration["Resend:ApiKey"];
            if (string.IsNullOrWhiteSpace(apiKey))
                return new MailResult(false, "email_not_configured");

            try
            {
                var senderName = await _templates.SenderNameAsync();

                var client = _http.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(20);
                client.DefaultRequestHeaders.Add("Authorization", $"Bearer {apiKey}");

                var response = await client.PostAsJsonAsync("https://api.resend.com/emails",
                    new { from = $"{senderName} <{FromAddress}>", to = new[] { to }, subject, html });

                if (response.IsSuccessStatusCode) return new MailResult(true, null);

                var body = await response.Content.ReadAsStringAsync();
                _logger.LogWarning("[Mail] Resend answered {Status}: {Body}", (int)response.StatusCode, body.Length > 200 ? body[..200] : body);
                return new MailResult(false, $"email_failed_{(int)response.StatusCode}");
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
            {
                _logger.LogWarning(ex, "[Mail] Sending failed.");
                return new MailResult(false, "email_unreachable");
            }
        }
    }
}
