using Google.Cloud.Firestore;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.AiPublishing.Review
{
    public sealed record EmailSettings(string SenderName, IReadOnlyDictionary<string, Dictionary<string, object>> Overrides);

    /// <summary>
    /// The admin's changes to the email texts and the sender name: one document, ai_settings/email.
    /// Cached for a minute because emails are rare and the settings change even more rarely.
    /// </summary>
    public sealed class EmailTemplateStore
    {
        public const string DefaultSenderName = "AI-Productivity Coach";
        private static readonly TimeSpan CacheLifetime = TimeSpan.FromSeconds(60);

        private readonly FirestoreDb _firestore;
        private readonly object _lock = new();
        private EmailSettings? _cached;
        private DateTime _cachedAt = DateTime.MinValue;

        public EmailTemplateStore(FirestoreDb firestore)
        {
            _firestore = firestore;
        }

        private DocumentReference Doc => _firestore.Collection("ai_settings").Document("email");

        public static string KeyOf(string kind, string language) => $"{kind}.{(InvitationMailer.IsEnglish(language) ? "en" : "de")}";

        public async Task<EmailSettings> LoadAsync()
        {
            lock (_lock)
            {
                if (_cached != null && DateTime.UtcNow - _cachedAt < CacheLifetime) return _cached;
            }

            var snap = await Doc.GetSnapshotAsync();
            var data = snap.Exists ? snap.ToDictionary() : new Dictionary<string, object>();

            var overrides = new Dictionary<string, Dictionary<string, object>>();
            if (data.TryGetValue("templates", out var raw) && raw is IDictionary<string, object> map)
            {
                foreach (var (key, value) in map)
                    if (value is IDictionary<string, object> fields)
                        overrides[key] = new Dictionary<string, object>(fields);
            }

            var settings = new EmailSettings(Clean(FirestoreApi.GetString(data, "senderName")), overrides);

            lock (_lock)
            {
                _cached = settings;
                _cachedAt = DateTime.UtcNow;
            }

            return settings;
        }

        public async Task<EmailContent> EffectiveAsync(string kind, string language)
        {
            var settings = await LoadAsync();
            settings.Overrides.TryGetValue(KeyOf(kind, language), out var fields);
            return EmailTemplates.Merge(EmailTemplates.Default(kind, language), fields);
        }

        public async Task SaveTemplateAsync(string kind, string language, EmailContent content)
        {
            var settings = await LoadAsync();
            var map = new Dictionary<string, object>(settings.Overrides.ToDictionary(p => p.Key, p => (object)p.Value))
            {
                [KeyOf(kind, language)] = new Dictionary<string, object>
                {
                    ["subject"] = content.Subject,
                    ["heading"] = content.Heading,
                    ["intro"] = content.Intro,
                    ["bulletsTitle"] = content.BulletsTitle,
                    ["bullets"] = content.Bullets.ToList(),
                    ["button"] = content.Button,
                    ["notes"] = content.Notes.ToList()
                }
            };

            await WriteAsync(settings.SenderName, map);
        }

        public async Task ResetTemplateAsync(string kind, string language)
        {
            var settings = await LoadAsync();
            var map = settings.Overrides.ToDictionary(p => p.Key, p => (object)p.Value);
            map.Remove(KeyOf(kind, language));
            await WriteAsync(settings.SenderName, map);
        }

        public async Task SetSenderNameAsync(string name)
        {
            var settings = await LoadAsync();
            await WriteAsync(Clean(name), settings.Overrides.ToDictionary(p => p.Key, p => (object)p.Value));
        }

        public async Task<string> SenderNameAsync()
        {
            var name = (await LoadAsync()).SenderName;
            return name.Length > 0 ? name : DefaultSenderName;
        }

        /// <summary>A display name must not be able to add a second address, look like one, or break the header.</summary>
        public static string Clean(string? name) =>
            new string((name ?? string.Empty).Where(c => !char.IsControl(c) && c is not ('<' or '>' or '"' or ',' or ';' or '@')).ToArray()).Trim();

        private async Task WriteAsync(string senderName, Dictionary<string, object> templates)
        {
            await Doc.SetAsync(new Dictionary<string, object>
            {
                ["senderName"] = senderName,
                ["templates"] = templates,
                ["updatedAt"] = Timestamp.GetCurrentTimestamp()
            });

            lock (_lock) _cached = null;
        }
    }
}
