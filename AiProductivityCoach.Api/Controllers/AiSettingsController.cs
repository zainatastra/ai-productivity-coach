using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AiProductivityCoach.Api.AiPublishing.Content;
using AiProductivityCoach.Api.AiPublishing.Review;

namespace AiProductivityCoach.Api.Controllers
{
    /// <summary>Admin settings of the emails the engine sends: texts per template and language, and the sender name.</summary>
    [ApiController]
    [Route("api/ai/settings/email")]
    [Authorize(Policy = "AdminOnly")]
    public class AiSettingsController : AiControllerBase
    {
        private static readonly Regex PlaceholderPattern = new(@"\{([a-zA-Z]+)\}", RegexOptions.Compiled);

        private readonly EmailTemplateStore _store;
        private readonly InvitationMailer _mailer;

        public AiSettingsController(EmailTemplateStore store, InvitationMailer mailer)
        {
            _store = store;
            _mailer = mailer;
        }

        public class TemplateDto
        {
            public string? Subject { get; set; }
            public string? Heading { get; set; }
            public string? Intro { get; set; }
            public string? BulletsTitle { get; set; }
            public List<string>? Bullets { get; set; }
            public string? Button { get; set; }
            public List<string>? Notes { get; set; }
        }

        public class SenderDto { public string? Name { get; set; } }

        public class PreviewDto
        {
            public string? Kind { get; set; }
            public string? Lang { get; set; }
            public TemplateDto? Template { get; set; }
        }

        private static string Language(string? lang) => InvitationMailer.IsEnglish(lang) ? "en" : "de";

        private static object ToJson(EmailContent c) => new
        {
            subject = c.Subject, heading = c.Heading, intro = c.Intro, bulletsTitle = c.BulletsTitle,
            bullets = c.Bullets, button = c.Button, notes = c.Notes
        };

        /// <summary>Cleans typed text with the same rules as the rest of the engine (no markup, no addresses) and applies the limits.</summary>
        private static EmailContent Normalize(TemplateDto dto, EmailContent defaults)
        {
            List<string> Lines(List<string>? list, int max, int length) =>
                (list ?? new List<string>()).Select(x => DocumentParser.Clean(x, length)).Where(x => x.Length > 0).Take(max).ToList();

            var merged = new Dictionary<string, object>
            {
                ["subject"] = DocumentParser.Clean(dto.Subject, 150),
                ["heading"] = DocumentParser.Clean(dto.Heading, 120),
                ["intro"] = DocumentParser.Clean(dto.Intro, 1000),
                ["bulletsTitle"] = DocumentParser.Clean(dto.BulletsTitle, 80),
                ["bullets"] = Lines(dto.Bullets, 8, 200).Cast<object>().ToList(),
                ["button"] = DocumentParser.Clean(dto.Button, 40),
                ["notes"] = Lines(dto.Notes, 5, 300).Cast<object>().ToList()
            };

            return EmailTemplates.Merge(defaults, merged);
        }

        private static List<string> UnknownPlaceholders(EmailContent c, string kind)
        {
            var allowed = EmailTemplates.Placeholders(kind);
            var all = new[] { c.Subject, c.Heading, c.Intro, c.BulletsTitle, c.Button }.Concat(c.Bullets).Concat(c.Notes);

            return all.SelectMany(t => PlaceholderPattern.Matches(t).Select(m => m.Groups[1].Value))
                .Where(name => !allowed.Contains(name))
                .Distinct()
                .ToList();
        }

        [HttpGet]
        public async Task<IActionResult> Get()
        {
            var settings = await _store.LoadAsync();

            var kinds = EmailKinds.All.Select(kind => new
            {
                kind,
                placeholders = EmailTemplates.Placeholders(kind),
                languages = new[] { "de", "en" }.ToDictionary(lang => lang, lang =>
                {
                    settings.Overrides.TryGetValue(EmailTemplateStore.KeyOf(kind, lang), out var fields);
                    var defaults = EmailTemplates.Default(kind, lang);
                    return new
                    {
                        defaults = ToJson(defaults),
                        effective = ToJson(EmailTemplates.Merge(defaults, fields)),
                        customized = fields != null
                    };
                })
            }).ToList();

            return Ok(new
            {
                senderName = settings.SenderName.Length > 0 ? settings.SenderName : EmailTemplateStore.DefaultSenderName,
                defaultSenderName = EmailTemplateStore.DefaultSenderName,
                fromAddress = InvitationMailer.FromAddress,
                emailConfigured = _mailer.IsConfigured,
                websiteUrl = _mailer.FrontendBaseUrl,
                kinds
            });
        }

        [HttpPut("templates/{kind}/{lang}")]
        public async Task<IActionResult> Save(string kind, string lang, [FromBody] TemplateDto? request)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();
            if (!EmailKinds.IsValid(kind) || request == null) return Error(400, "invalid_template", "Unknown template.");

            var language = Language(lang);
            var content = Normalize(request, EmailTemplates.Default(kind, language));

            await _store.SaveTemplateAsync(kind, language, content);

            return Ok(new { effective = ToJson(content), unknownPlaceholders = UnknownPlaceholders(content, kind) });
        }

        [HttpDelete("templates/{kind}/{lang}")]
        public async Task<IActionResult> Reset(string kind, string lang)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();
            if (!EmailKinds.IsValid(kind)) return Error(400, "invalid_template", "Unknown template.");

            await _store.ResetTemplateAsync(kind, Language(lang));
            return NoContent();
        }

        [HttpPut("sender")]
        public async Task<IActionResult> SetSender([FromBody] SenderDto? request)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var name = EmailTemplateStore.Clean(request?.Name);
            if (name.Length > 60) return Error(400, "sender_too_long", "The sender name is too long.");

            await _store.SetSenderNameAsync(name);
            return Ok(new { senderName = name.Length > 0 ? name : EmailTemplateStore.DefaultSenderName });
        }

        /// <summary>Renders the email with sample data. Unsaved edits can be previewed.</summary>
        [HttpPost("preview")]
        public async Task<IActionResult> Preview([FromBody] PreviewDto? request)
        {
            var kind = request?.Kind;
            if (!EmailKinds.IsValid(kind)) return Error(400, "invalid_template", "Unknown template.");

            var language = Language(request?.Lang);
            var content = request?.Template != null
                ? Normalize(request.Template, EmailTemplates.Default(kind!, language))
                : await _store.EffectiveAsync(kind!, language);

            var (subject, html) = InvitationMailer.Render(kind!, language, content, EmailTemplates.SampleValues(kind!, language), $"{_mailer.FrontendBaseUrl}/publisher/login");

            return Ok(new { subject, html, unknownPlaceholders = UnknownPlaceholders(content, kind!) });
        }

        /// <summary>Sends the saved template with sample data to the admin's own address only.</summary>
        [HttpPost("test")]
        public async Task<IActionResult> Test([FromBody] PreviewDto? request)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            if (!EmailKinds.IsValid(request?.Kind)) return Error(400, "invalid_template", "Unknown template.");
            if (string.IsNullOrWhiteSpace(actor.Email)) return Error(400, "no_admin_email", "Your account has no email address.");
            if (!_mailer.IsConfigured) return Error(503, "email_not_configured", "Email sending is not configured.");

            if (!AttemptLimiter.Allow($"email-test:{actor.UserId}", 10, TimeSpan.FromHours(1)))
                return Error(429, "too_many_attempts", "Too many test emails. Please try again later.");

            var result = await _mailer.SendTestAsync(actor.Email, request!.Kind!, Language(request.Lang));

            return result.Sent
                ? Ok(new { sent = true, to = actor.Email })
                : Error(502, result.Error ?? "email_failed", "The test email could not be sent.");
        }
    }
}
