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

        /// <summary>The platform's public name, as it appears in an email.</summary>
        public static string PlatformLabel(string? platform) => platform?.Trim().ToLowerInvariant() switch
        {
            Domain.Platforms.EyEric => "EY ERIC",
            Domain.Platforms.Midrange => "MIDRANGE",
            _ => string.Empty
        };

        public async Task<MailResult> SendInvitationAsync(string to, string providerName, string link, string language, string? platform = null)
        {
            var content = await _templates.EffectiveAsync(EmailKinds.Invitation, language);
            var values = new Dictionary<string, string>
            {
                ["company"] = providerName, ["email"] = to, ["days"] = EmailTemplates.InviteDays.ToString(),
                ["platform"] = PlatformLabel(platform)
            };

            var (subject, html) = Render(EmailKinds.Invitation, language, content, values, link);
            return await SendAsync(to, subject, html, Array.Empty<MailAttachment>(), platform);
        }

        /// <summary>
        /// Tells a company contact that one piece is ready. The link opens exactly that piece (after the
        /// normal login), and the optional PDF is attached so it can be read without signing in first.
        /// </summary>
        public async Task<MailResult> SendReviewRequestAsync(
            string to, string providerName, string contentTitle, string contentType, string language,
            string? link = null, MailAttachment? attachment = null, string? platform = null)
        {
            var content = await _templates.EffectiveAsync(EmailKinds.Review, language);
            var values = new Dictionary<string, string>
            {
                ["company"] = providerName, ["email"] = to, ["title"] = contentTitle, ["type"] = TypeLabel(contentType, IsEnglish(language))
            };

            if (attachment != null)
            {
                // Said by the engine, not by the editable template, so it can never claim a PDF that is not there.
                var note = IsEnglish(language) ? "The content is also attached to this email as a PDF." : "Der Inhalt ist dieser E-Mail außerdem als PDF angehängt.";
                content = content with { Notes = content.Notes.Append(note).ToList() };
            }

            var (subject, html) = Render(EmailKinds.Review, language, content, values, link ?? ReviewLink);
            return await SendAsync(to, subject, html, attachment == null ? Array.Empty<MailAttachment>() : new[] { attachment }, platform);
        }

        public async Task<MailResult> SendPasswordResetAsync(string to, string link, string language)
        {
            var content = await _templates.EffectiveAsync(EmailKinds.Reset, language);
            var (subject, html) = Render(EmailKinds.Reset, language, content, new Dictionary<string, string> { ["email"] = to }, link);
            return await SendAsync(to, subject, html);
        }

        /// <summary>
        /// Sends the "set your password" link for a newly created MIDRANGE WordPress account.
        /// MIDRANGE's own mailer (Microsoft 365) is unreliable, so the WordPress plugin only
        /// generates the reset link; we deliver it ourselves through Resend. Not an admin-editable
        /// template - this is a one-off system notification tied to account creation, not reuse.
        /// </summary>
        public async Task<MailResult> SendMidrangeAccountSetupAsync(string to, string link, string language)
        {
            var en = IsEnglish(language);
            var subject = en ? "Set up your MIDRANGE account" : "Richten Sie Ihr MIDRANGE-Konto ein";

            var html = Document(Frame(
                subject,
                en ? "Hello," : "Guten Tag,",
                en
                    ? "an account was created for you on MIDRANGE so you can manage your company profile there. Click the button to set your password."
                    : "für Sie wurde ein Konto bei MIDRANGE angelegt, damit Sie dort Ihr Unternehmensprofil verwalten können. Klicken Sie auf den Button, um Ihr Passwort festzulegen.",
                WebUtility.HtmlEncode(to),
                en ? "Set your password to get started" : "Legen Sie Ihr Passwort fest, um zu starten",
                string.Empty,
                Array.Empty<string>(),
                link,
                en ? "Set your password" : "Passwort festlegen",
                en ? "The button does not work? Copy this link into your browser:" : "Der Button funktioniert nicht? Kopieren Sie diesen Link in Ihren Browser:",
                new[] { en
                    ? "For your security the link is only valid for a short time and can be used once."
                    : "Aus Sicherheitsgründen ist der Link nur kurze Zeit gültig und einmal verwendbar." }));

            return await SendAsync(to, subject, html, Array.Empty<MailAttachment>(), Domain.Platforms.Midrange);
        }

        /// <summary>
        /// Delivers a gated whitepaper download both ways at once: the watermarked PDF attached
        /// directly, and a button that re-downloads the same file later. Not an admin-editable
        /// template - the PDF attachment is the point of this email, not its wording.
        /// </summary>
        public async Task<MailResult> SendWhitepaperPdfAsync(
            string to, string companyName, string whitepaperTitle, string downloadUrl, string language,
            byte[] pdfBytes, string fileName)
        {
            var en = IsEnglish(language);
            var subject = en ? $"Your whitepaper: {whitepaperTitle}" : $"Ihr Whitepaper: {whitepaperTitle}";

            var html = Document(Frame(
                en ? "Your whitepaper is ready" : "Ihr Whitepaper ist bereit",
                en ? "Hello," : "Guten Tag,",
                en
                    ? "thank you for your interest. The PDF is attached to this email, and the button below opens the same download again at any time."
                    : "vielen Dank für Ihr Interesse. Die PDF-Datei ist dieser E-Mail beigefügt, und über den Button unten können Sie sie jederzeit erneut herunterladen.",
                WebUtility.HtmlEncode(whitepaperTitle),
                WebUtility.HtmlEncode(companyName),
                string.Empty,
                Array.Empty<string>(),
                downloadUrl,
                en ? "Download PDF" : "PDF herunterladen",
                en ? "The button does not work? Copy this link into your browser:" : "Der Button funktioniert nicht? Kopieren Sie diesen Link in Ihren Browser:",
                new[] { en
                    ? "This copy is personalized to you and carries a visible usage restriction; please do not redistribute it."
                    : "Dieses Exemplar ist für Sie personalisiert und trägt eine sichtbare Nutzungsbeschränkung; bitte geben Sie es nicht weiter." }));

            return await SendAsync(to, subject, html, new[] { new MailAttachment(fileName, pdfBytes) }, Domain.Platforms.EyEric);
        }

        public sealed record ClaimNotice(string CompanyName, string ClaimantName, string ClaimantEmail, string Position, string Phone, string Message);

        /// <summary>Tells the admin that someone asked to claim a profile. Everything the visitor typed is HTML-encoded.</summary>
        public async Task<MailResult> SendClaimNotificationAsync(string to, ClaimNotice n)
        {
            string E(string value) => WebUtility.HtmlEncode(value);

            var lines = new List<string>
            {
                $"Name: {E(n.ClaimantName)}",
                $"E-Mail: {E(n.ClaimantEmail)}",
                $"Position: {E(n.Position)}"
            };
            if (n.Phone.Length > 0) lines.Add($"Telefon: {E(n.Phone)}");
            if (n.Message.Length > 0) lines.Add($"Nachricht: {E(n.Message)}");

            var subject = $"Neue Claim-Anfrage: {n.CompanyName}";

            var html = Document(Frame(
                "Neue Claim-Anfrage",
                "Hallo,",
                $"Jemand möchte das Profil von {E(n.CompanyName)} übernehmen. Es wurde noch kein Zugang vergeben: Bitte prüfen Sie die Angaben und entscheiden Sie im Admin-Bereich.",
                E(n.CompanyName),
                "Claim-Anfrage",
                "Angaben",
                lines.ToArray(),
                $"{FrontendBaseUrl}/admin",
                "Zum Admin-Bereich",
                "Der Button funktioniert nicht? Kopieren Sie diesen Link in Ihren Browser:",
                new[] { "Ohne Ihre Freigabe erhält niemand Zugriff auf das Profil." }));

            return await SendAsync(to, subject, html, Array.Empty<MailAttachment>(), Domain.Platforms.EyEric);
        }

        /// <summary>Tells the claimant the outcome. Sent only after an admin decided, to the address on the request.</summary>
        public async Task<MailResult> SendClaimDecisionAsync(string to, string companyName, bool approved, string? note)
        {
            string E(string value) => WebUtility.HtmlEncode(value);

            var subject = approved
                ? $"Ihr Claim für {companyName} wurde bestätigt"
                : $"Ihre Claim-Anfrage für {companyName}";

            var notes = new List<string>();
            if (!approved && !string.IsNullOrWhiteSpace(note)) notes.Add(E(note));

            var html = Document(Frame(
                approved ? "Claim bestätigt" : "Claim nicht bestätigt",
                "Guten Tag,",
                approved
                    ? $"Ihre Anfrage wurde geprüft und bestätigt. Sie können das Profil von {E(companyName)} jetzt mit Ihrem Firmen-Login verwalten."
                    : $"wir konnten Ihre Anfrage für das Profil von {E(companyName)} leider nicht bestätigen.",
                E(companyName),
                approved ? "Zugang erteilt" : "Anfrage abgelehnt",
                string.Empty,
                Array.Empty<string>(),
                LoginLink,
                approved ? "Zum Firmen-Login" : "Zur Startseite",
                "Der Button funktioniert nicht? Kopieren Sie diesen Link in Ihren Browser:",
                notes.Count > 0 ? notes.ToArray() : new[] { "Bei Fragen antworten Sie bitte auf diese E-Mail." }));

            return await SendAsync(to, subject, html, Array.Empty<MailAttachment>(), Domain.Platforms.EyEric);
        }

        public sealed record BookingNotice(
            string ProviderName, string ContentTitle, string ContentType, string BookedBy,
            string Date, string TimePeriod, int Leads, string TargetGroup, long PriceCents);

        /// <summary>
        /// Tells the admin that a company booked a whitepaper or webinar campaign. Every value that came from a
        /// user (title, target group, names) is HTML-encoded: none of it may become markup in the admin's inbox.
        /// </summary>
        public async Task<MailResult> SendBookingNotificationAsync(string to, BookingNotice n)
        {
            var en = false; // the admin team works in German
            string E(string value) => WebUtility.HtmlEncode(value);

            var typeLabel = n.ContentType == "webinar" ? "Webinar" : "Whitepaper";
            var subject = $"Neue Buchung: {typeLabel} – {n.ProviderName}";
            var period = n.TimePeriod switch { "morning" => "vormittags", "afternoon" => "nachmittags", "evening" => "abends", _ => n.TimePeriod };

            var lines = new List<string>
            {
                $"Termin: {E(n.Date)}, {E(period)}",
                $"Gewünschte Leads: {n.Leads}",
                $"Zielgruppe: {E(n.TargetGroup)}",
                $"Preis: {E(Booking.BookingPricing.FormatMoney(n.PriceCents, en))}",
                $"Gebucht von: {E(n.BookedBy)}"
            };

            var html = Document(Frame(
                "Neue Buchung eingegangen",
                "Hallo,",
                $"{E(n.ProviderName)} hat eine Buchung angefragt. Die Details stehen unten und sind im Admin-Bereich gespeichert.",
                E(n.ContentTitle),
                $"{typeLabel} · {E(n.ProviderName)}",
                "Details",
                lines.ToArray(),
                $"{FrontendBaseUrl}/admin",
                "Zum Admin-Bereich",
                "Der Button funktioniert nicht? Kopieren Sie diesen Link in Ihren Browser:",
                new[] { "Der Preis wurde serverseitig berechnet und mit der Buchung gespeichert." }));

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

        public static string BuildInvitationHtml(string providerName, string email, string link, string language, string? platform = null) =>
            Body(EmailKinds.Invitation, language, EmailTemplates.Default(EmailKinds.Invitation, language),
                new Dictionary<string, string>
                {
                    ["company"] = providerName, ["email"] = email, ["days"] = EmailTemplates.InviteDays.ToString(),
                    ["platform"] = PlatformLabel(platform)
                }, link);

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
                    cardSub = (en ? "Access for " : "Zugang für ") + Encoded("email")
                        + (values.GetValueOrDefault("platform") is { Length: > 0 } ? " · " + Encoded("platform") : string.Empty);
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
<p style='text-align:center;color:#9ca3af;font-size:11px;margin:16px 0 0'>AI-Productivity Coach</p>
</div>";
        }

        /// <summary>One file attached to an outgoing email, base64-encoded as Resend's API expects.</summary>
        public sealed record MailAttachment(string FileName, byte[] Content);

        private Task<MailResult> SendAsync(string to, string subject, string html) =>
            SendAsync(to, subject, html, Array.Empty<MailAttachment>(), null);

        private async Task<MailResult> SendAsync(string to, string subject, string html, IReadOnlyList<MailAttachment> attachments, string? platform)
        {
            var apiKey = _configuration["Resend:ApiKey"];
            if (string.IsNullOrWhiteSpace(apiKey))
                return new MailResult(false, "email_not_configured");

            try
            {
                var sender = await _templates.SenderAsync(platform);
                var from = $"{sender.Name} <{sender.Address}>";

                var client = _http.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(30);
                client.DefaultRequestHeaders.Add("Authorization", $"Bearer {apiKey}");

                var payload = attachments.Count == 0
                    ? (object)new { from, to = new[] { to }, subject, html }
                    : new
                    {
                        from,
                        to = new[] { to },
                        subject,
                        html,
                        attachments = attachments.Select(a => new
                        {
                            filename = a.FileName,
                            content = Convert.ToBase64String(a.Content)
                        })
                    };

                var response = await client.PostAsJsonAsync("https://api.resend.com/emails", payload);

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
