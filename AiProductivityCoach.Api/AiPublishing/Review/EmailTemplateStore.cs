using Google.Cloud.Firestore;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.AiPublishing.Review
{
    /// <summary>A platform's own sender identity. A blank field falls back to the shared one.</summary>
    public sealed record SenderOverride(string Name, string Address);

    public sealed record EmailSettings(
        string SenderName,
        string SenderAddress,
        IReadOnlyDictionary<string, SenderOverride> PlatformSenders,
        IReadOnlyDictionary<string, Dictionary<string, object>> Overrides);

    /// <summary>The sender an email actually goes out under: display name and from-address.</summary>
    public sealed record ResolvedSender(string Name, string Address);

    /// <summary>
    /// The admin's changes to the email texts and the sender identity: one document, ai_settings/email.
    /// Cached for a minute because emails are rare and the settings change even more rarely.
    /// </summary>
    public sealed class EmailTemplateStore
    {
        public const string DefaultSenderName = "AI-Productivity Coach";
        public const string DefaultSenderAddress = "auth@astrasoftdigital.com";
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

            var platformSenders = new Dictionary<string, SenderOverride>();
            if (data.TryGetValue("platformSenders", out var rawSenders) && rawSenders is IDictionary<string, object> senders)
            {
                foreach (var (platform, value) in senders)
                {
                    if (!Domain.Platforms.IsValid(platform) || value is not IDictionary<string, object> fields) continue;
                    platformSenders[platform] = new SenderOverride(
                        Clean(FirestoreApi.GetString(new Dictionary<string, object>(fields), "name")),
                        FirestoreApi.GetString(new Dictionary<string, object>(fields), "address").Trim());
                }
            }

            var settings = new EmailSettings(
                Clean(FirestoreApi.GetString(data, "senderName")),
                FirestoreApi.GetString(data, "senderAddress").Trim(),
                platformSenders,
                overrides);

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

            await WriteAsync(settings with { Overrides = map.ToDictionary(p => p.Key, p => (Dictionary<string, object>)p.Value) });
        }

        public async Task ResetTemplateAsync(string kind, string language)
        {
            var settings = await LoadAsync();
            var map = settings.Overrides.ToDictionary(p => p.Key, p => p.Value);
            map.Remove(KeyOf(kind, language));
            await WriteAsync(settings with { Overrides = map });
        }

        /// <summary>Sets the shared sender (platform null) or one platform's own sender. Blank values clear the setting.</summary>
        public async Task SetSenderAsync(string? platform, string name, string address)
        {
            var settings = await LoadAsync();

            if (string.IsNullOrWhiteSpace(platform))
            {
                await WriteAsync(settings with { SenderName = Clean(name), SenderAddress = address.Trim() });
                return;
            }

            var senders = settings.PlatformSenders.ToDictionary(p => p.Key, p => p.Value);
            var next = new SenderOverride(Clean(name), address.Trim());

            if (next.Name.Length == 0 && next.Address.Length == 0) senders.Remove(platform);
            else senders[platform] = next;

            await WriteAsync(settings with { PlatformSenders = senders });
        }

        public async Task<ResolvedSender> SenderAsync(string? platform = null) =>
            ResolveSender(await LoadAsync(), platform);

        /// <summary>The platform's own value wins; otherwise the shared one; otherwise the built-in default.</summary>
        public static ResolvedSender ResolveSender(EmailSettings settings, string? platform)
        {
            SenderOverride? own = null;
            if (!string.IsNullOrWhiteSpace(platform))
                settings.PlatformSenders.TryGetValue(platform.Trim().ToLowerInvariant(), out own);

            var name = own is { Name.Length: > 0 } ? own.Name : settings.SenderName.Length > 0 ? settings.SenderName : DefaultSenderName;
            var address = own is { Address.Length: > 0 } ? own.Address : settings.SenderAddress.Length > 0 ? settings.SenderAddress : DefaultSenderAddress;

            return new ResolvedSender(name, address);
        }

        /// <summary>A display name must not be able to add a second address, look like one, or break the header.</summary>
        public static string Clean(string? name) =>
            new string((name ?? string.Empty).Where(c => !char.IsControl(c) && c is not ('<' or '>' or '"' or ',' or ';' or '@')).ToArray()).Trim();

        private async Task WriteAsync(EmailSettings settings)
        {
            await Doc.SetAsync(new Dictionary<string, object>
            {
                ["senderName"] = settings.SenderName,
                ["senderAddress"] = settings.SenderAddress,
                ["platformSenders"] = settings.PlatformSenders.ToDictionary(
                    p => p.Key,
                    p => (object)new Dictionary<string, object> { ["name"] = p.Value.Name, ["address"] = p.Value.Address }),
                ["templates"] = settings.Overrides.ToDictionary(p => p.Key, p => (object)p.Value),
                ["updatedAt"] = Timestamp.GetCurrentTimestamp()
            });

            lock (_lock) _cached = null;
        }
    }
}
