using System.Net;
using System.Net.Http.Json;

namespace AiProductivityCoach.Api.AiPublishing.Review
{
    public sealed record MailResult(bool Sent, string? Error);

    /// <summary>Sends the invitation and review-request emails through Resend (same sender as the login codes).</summary>
    public sealed class InvitationMailer
    {
        private const string From = "AI-Productivity Coach <auth@astrasoftdigital.com>";
        private const string LogoUrl = "https://ai-productivity-coach-zeta.vercel.app/logo.png";

        private readonly IHttpClientFactory _http;
        private readonly IConfiguration _configuration;
        private readonly ILogger<InvitationMailer> _logger;

        public InvitationMailer(IHttpClientFactory http, IConfiguration configuration, ILogger<InvitationMailer> logger)
        {
            _http = http;
            _configuration = configuration;
            _logger = logger;
        }

        public bool IsConfigured => !string.IsNullOrWhiteSpace(_configuration["Resend:ApiKey"]);

        public const string DefaultPublicUrl = "https://ai-productivity-coach-zeta.vercel.app";

        /// <summary>
        /// Public address of the live website: the address in every invitation and review email.
        /// It never falls back to localhost, so a link in an email always works for the recipient.
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

        public Task<MailResult> SendInvitationAsync(string to, string providerName, string link, string language) =>
            SendAsync(to, InvitationSubject(providerName, language), BuildInvitationHtml(providerName, to, link, language));

        public Task<MailResult> SendReviewRequestAsync(string to, string providerName, string contentTitle, string contentType, string language) =>
            SendAsync(to, ReviewSubject(providerName, language), BuildReviewRequestHtml(providerName, contentTitle, contentType, ReviewLink, language));

        // ───────────── templates (one language per email, chosen by the provider's language) ─────────────

        public static bool IsEnglish(string? language) => string.Equals(language, "en", StringComparison.OrdinalIgnoreCase);

        public static string InvitationSubject(string providerName, string language) =>
            IsEnglish(language) ? $"Invitation: review content for {OneLine(providerName)}" : $"Einladung: Inhalte für {OneLine(providerName)} prüfen";

        public static string ReviewSubject(string providerName, string language) =>
            IsEnglish(language) ? $"New content to review for {OneLine(providerName)}" : $"Neuer Inhalt zur Prüfung für {OneLine(providerName)}";

        public static string BuildInvitationHtml(string providerName, string email, string link, string language)
        {
            var en = IsEnglish(language);
            var company = WebUtility.HtmlEncode(providerName);

            return Frame(
                en ? "Invitation to review content" : "Einladung zur Inhaltsprüfung",
                en ? "Hello," : "Guten Tag,",
                en
                    ? $"the editorial team of AI-Productivity Coach has invited you to review AI-created expert content for <strong>{company}</strong>."
                    : $"das Redaktionsteam von AI-Productivity Coach hat Sie eingeladen, KI-erstellte Fachinhalte für <strong>{company}</strong> zu prüfen.",
                company,
                en ? $"Access for {WebUtility.HtmlEncode(email)}" : $"Zugang für {WebUtility.HtmlEncode(email)}",
                en ? "What you can do" : "Das können Sie tun",
                en
                    ? new[] { "Read the drafts of articles, whitepapers and webinars", "Leave comments for the editorial team", "Ask the AI to improve a draft", "Submit the content for approval" }
                    : new[] { "Entwürfe von Artikeln, Whitepapers und Webinaren lesen", "Kommentare für das Redaktionsteam hinterlassen", "Die KI um Verbesserungen eines Entwurfs bitten", "Den Inhalt zur Freigabe einreichen" },
                link,
                en ? "Accept invitation" : "Einladung annehmen",
                en ? "The button does not work? Copy this link into your browser:" : "Der Button funktioniert nicht? Kopieren Sie diesen Link in Ihren Browser:",
                en
                    ? new[] { "The link is valid for 14 days and can be used once.", $"It only works for {WebUtility.HtmlEncode(email)}.", "Did not expect this invitation? Simply ignore this email – nothing happens without your action." }
                    : new[] { "Der Link ist 14 Tage gültig und nur einmal verwendbar.", $"Er funktioniert nur für {WebUtility.HtmlEncode(email)}.", "Sie haben diese Einladung nicht erwartet? Ignorieren Sie diese E-Mail einfach – ohne Ihr Zutun passiert nichts." });
        }

        public static string BuildReviewRequestHtml(string providerName, string contentTitle, string contentType, string link, string language)
        {
            var en = IsEnglish(language);
            var company = WebUtility.HtmlEncode(providerName);
            var title = WebUtility.HtmlEncode(contentTitle);
            var kind = WebUtility.HtmlEncode(TypeLabel(contentType, en));

            return Frame(
                en ? "New content ready for review" : "Neuer Inhalt zur Prüfung",
                en ? "Hello," : "Guten Tag,",
                en
                    ? $"a new {kind} for <strong>{company}</strong> is ready for your review."
                    : $"für <strong>{company}</strong> liegt ein neuer Inhalt zur Prüfung bereit ({kind}).",
                title,
                kind,
                en ? "Next steps" : "So geht es weiter",
                en
                    ? new[] { "Read the draft", "Comment or ask the AI for improvements", "Submit it for approval when it fits" }
                    : new[] { "Entwurf lesen", "Kommentieren oder die KI um Verbesserungen bitten", "Zur Freigabe einreichen, wenn alles passt" },
                link,
                en ? "Review content" : "Inhalt prüfen",
                en ? "The button does not work? Copy this link into your browser:" : "Der Button funktioniert nicht? Kopieren Sie diesen Link in Ihren Browser:",
                en ? new[] { "Please sign in with your existing access." } : new[] { "Bitte melden Sie sich mit Ihrem bestehenden Zugang an." });
        }

        public static string TypeLabel(string type, bool en) => type switch
        {
            "article" => en ? "article" : "Artikel",
            "whitepaper" => en ? "whitepaper" : "Whitepaper",
            "webinar" => en ? "webinar" : "Webinar",
            _ => en ? "content" : "Inhalt"
        };

        private static string OneLine(string value) =>
            System.Text.RegularExpressions.Regex.Replace(value ?? string.Empty, @"[\r\n]+", " ").Trim();

        // All dynamic parts passed in here are already HTML-encoded by the callers.
        private static string Frame(
            string heading, string greeting, string intro, string cardTitle, string cardSub,
            string listTitle, string[] list, string link, string button, string fallbackText, string[] notes)
        {
            var safeLink = WebUtility.HtmlEncode(link);
            var items = string.Concat(list.Select(i => $"<tr><td style='padding:0 10px 6px 0;vertical-align:top;color:#059669;font-weight:700'>&#10003;</td><td style='padding:0 0 6px 0;color:#374151;font-size:14px;line-height:1.5'>{i}</td></tr>"));
            var noteHtml = string.Concat(notes.Select(n => $"<p style='margin:0 0 4px;color:#6b7280;font-size:12px;line-height:1.5'>{n}</p>"));

            return $@"<div style='background:#f3f4f6;padding:32px 12px;font-family:Arial,Helvetica,sans-serif'>
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

    <p style='margin:0 0 8px;color:#111827;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.04em'>{listTitle}</p>
    <table role='presentation' cellspacing='0' cellpadding='0' style='margin:0 0 24px'>{items}</table>

    <div style='text-align:center;margin:0 0 20px'>
      <a href='{safeLink}' style='display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:14px 30px;border-radius:999px;font-weight:700;font-size:15px'>{button}</a>
    </div>

    <p style='margin:0 0 4px;color:#6b7280;font-size:12px'>{fallbackText}</p>
    <p style='margin:0 0 20px;font-size:12px;word-break:break-all'><a href='{safeLink}' style='color:#2563eb'>{safeLink}</a></p>

    <div style='border-top:1px solid #f0f0f0;padding-top:14px'>{noteHtml}</div>
  </div>
</div>
<p style='text-align:center;color:#9ca3af;font-size:11px;margin:16px 0 0'>AI-Productivity Coach · auth@astrasoftdigital.com</p>
</div>";
        }

        private async Task<MailResult> SendAsync(string to, string subject, string html)
        {
            var apiKey = _configuration["Resend:ApiKey"];
            if (string.IsNullOrWhiteSpace(apiKey))
                return new MailResult(false, "email_not_configured");

            try
            {
                var client = _http.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(20);
                client.DefaultRequestHeaders.Add("Authorization", $"Bearer {apiKey}");

                var response = await client.PostAsJsonAsync("https://api.resend.com/emails", new { from = From, to = new[] { to }, subject, html });

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
