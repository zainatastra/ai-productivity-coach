using System.Text.RegularExpressions;

namespace AiProductivityCoach.Api.AiPublishing.Review
{
    public static class EmailKinds
    {
        public const string Invitation = "invitation";
        public const string Review = "review";
        public const string Reset = "reset";

        public static readonly string[] All = { Invitation, Review, Reset };

        public static bool IsValid(string? kind) => kind != null && All.Contains(kind);
    }

    /// <summary>The parts of an email an admin may change. Everything else (layout, link, security notes) stays fixed.</summary>
    public sealed record EmailContent(
        string Subject,
        string Heading,
        string Intro,
        string BulletsTitle,
        IReadOnlyList<string> Bullets,
        string Button,
        IReadOnlyList<string> Notes);

    public static class EmailTemplates
    {
        public const int InviteDays = 14;

        /// <summary>Placeholders an admin can use in the texts; the values are filled in when the email is sent.</summary>
        public static IReadOnlyList<string> Placeholders(string kind) => kind switch
        {
            EmailKinds.Invitation => new[] { "company", "email", "days" },
            EmailKinds.Review => new[] { "company", "title", "type" },
            _ => new[] { "email" }
        };

        public static EmailContent Default(string kind, string language)
        {
            var en = InvitationMailer.IsEnglish(language);

            return kind switch
            {
                EmailKinds.Invitation => en
                    ? new EmailContent(
                        "Invitation: review content for {company}",
                        "Invitation to review content",
                        "the editorial team of AI-Productivity Coach has invited you to review AI-created expert content for **{company}**.",
                        "What you can do",
                        new[] { "Read the drafts of articles, whitepapers and webinars", "Leave comments for the editorial team", "Ask the AI to improve a draft", "Submit the content for approval" },
                        "Accept invitation",
                        new[] { "The link is valid for {days} days and can be used once.", "It only works for {email}.", "Did not expect this invitation? Simply ignore this email – nothing happens without your action." })
                    : new EmailContent(
                        "Einladung: Inhalte für {company} prüfen",
                        "Einladung zur Inhaltsprüfung",
                        "das Redaktionsteam von AI-Productivity Coach hat Sie eingeladen, KI-erstellte Fachinhalte für **{company}** zu prüfen.",
                        "Das können Sie tun",
                        new[] { "Entwürfe von Artikeln, Whitepapers und Webinaren lesen", "Kommentare für das Redaktionsteam hinterlassen", "Die KI um Verbesserungen eines Entwurfs bitten", "Den Inhalt zur Freigabe einreichen" },
                        "Einladung annehmen",
                        new[] { "Der Link ist {days} Tage gültig und nur einmal verwendbar.", "Er funktioniert nur für {email}.", "Sie haben diese Einladung nicht erwartet? Ignorieren Sie diese E-Mail einfach – ohne Ihr Zutun passiert nichts." }),

                EmailKinds.Review => en
                    ? new EmailContent(
                        "New content to review for {company}",
                        "New content ready for review",
                        "a new {type} for **{company}** is ready for your review.",
                        "Next steps",
                        new[] { "Read the draft", "Comment or ask the AI for improvements", "Submit it for approval when it fits" },
                        "Review content",
                        new[] { "Please sign in with your existing access." })
                    : new EmailContent(
                        "Neuer Inhalt zur Prüfung für {company}",
                        "Neuer Inhalt zur Prüfung",
                        "für **{company}** liegt ein neuer Inhalt zur Prüfung bereit ({type}).",
                        "So geht es weiter",
                        new[] { "Entwurf lesen", "Kommentieren oder die KI um Verbesserungen bitten", "Zur Freigabe einreichen, wenn alles passt" },
                        "Inhalt prüfen",
                        new[] { "Bitte melden Sie sich mit Ihrem bestehenden Zugang an." }),

                _ => en
                    ? new EmailContent(
                        "Reset your password – AI-Productivity Coach",
                        "Reset your password",
                        "you asked to reset the password for your access (**{email}**). Click the button to choose a new password.",
                        string.Empty,
                        Array.Empty<string>(),
                        "Choose a new password",
                        new[] { "For your security the link is only valid for a short time and can be used once.", "Did not ask for this? Ignore this email – your password stays unchanged." })
                    : new EmailContent(
                        "Passwort zurücksetzen – AI-Productivity Coach",
                        "Passwort zurücksetzen",
                        "Sie haben das Zurücksetzen des Passworts für Ihren Zugang (**{email}**) angefordert. Klicken Sie auf den Button, um ein neues Passwort festzulegen.",
                        string.Empty,
                        Array.Empty<string>(),
                        "Neues Passwort festlegen",
                        new[] { "Aus Sicherheitsgründen ist der Link nur kurze Zeit gültig und einmal verwendbar.", "Sie haben das nicht angefordert? Ignorieren Sie diese E-Mail – Ihr Passwort bleibt unverändert." })
            };
        }

        /// <summary>Stored changes replace the default text field by field; an empty field keeps the default.</summary>
        public static EmailContent Merge(EmailContent defaults, IDictionary<string, object>? overrides)
        {
            if (overrides == null || overrides.Count == 0) return defaults;

            string Text(string key, string fallback) =>
                overrides.TryGetValue(key, out var v) && v is string s && !string.IsNullOrWhiteSpace(s) ? s : fallback;

            IReadOnlyList<string> Lines(string key, IReadOnlyList<string> fallback) =>
                overrides.TryGetValue(key, out var v) && v is IEnumerable<object> list
                    ? list.Select(x => x?.ToString() ?? string.Empty).Where(x => x.Trim().Length > 0).ToList() is { Count: > 0 } lines ? lines : fallback
                    : fallback;

            // The subject, heading, intro and button may be changed; the optional list title keeps its default when empty.
            return new EmailContent(
                Text("subject", defaults.Subject),
                Text("heading", defaults.Heading),
                Text("intro", defaults.Intro),
                Text("bulletsTitle", defaults.BulletsTitle),
                Lines("bullets", defaults.Bullets),
                Text("button", defaults.Button),
                Lines("notes", defaults.Notes));
        }

        private static readonly Regex Placeholder = new(@"\{([a-z]+)\}", RegexOptions.Compiled);

        /// <summary>Replaces {placeholders}; unknown ones stay as typed so a typo is visible.</summary>
        public static string Fill(string text, IReadOnlyDictionary<string, string> values) =>
            Placeholder.Replace(text ?? string.Empty, m => values.TryGetValue(m.Groups[1].Value, out var v) ? v : m.Value);

        public static Dictionary<string, string> SampleValues(string kind, string language)
        {
            var en = InvitationMailer.IsEnglish(language);
            return new Dictionary<string, string>
            {
                ["company"] = "Muster Software GmbH",
                ["email"] = "kontakt@muster-software.de",
                ["title"] = en ? "Digital maintenance made modular" : "Instandhaltung digital und modular gestalten",
                ["type"] = InvitationMailer.TypeLabel("article", en),
                ["days"] = InviteDays.ToString()
            };
        }
    }
}
