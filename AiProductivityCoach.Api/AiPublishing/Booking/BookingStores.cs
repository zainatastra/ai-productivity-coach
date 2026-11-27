using Google.Cloud.Firestore;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.AiPublishing.Booking
{
    /// <summary>Global default prices and the admin's notification address (doc ai_settings/pricing), plus per-piece overrides.</summary>
    public sealed class PricingStore
    {
        private readonly FirestoreDb _firestore;

        public PricingStore(FirestoreDb firestore)
        {
            _firestore = firestore;
        }

        private DocumentReference Doc => _firestore.Collection("ai_settings").Document("pricing");

        public async Task<PricingSettings> LoadAsync()
        {
            var snap = await Doc.GetSnapshotAsync();
            if (!snap.Exists) return PricingSettings.Empty;

            var data = snap.ToDictionary();

            return new PricingSettings(
                FirestoreApi.GetLong(data, "whitepaperBaseCents"),
                FirestoreApi.GetLong(data, "pricePerLeadCents"),
                FirestoreApi.GetLong(data, "webinarBaseCents"),
                FirestoreApi.GetString(data, "adminEmail"));
        }

        public Task SaveAsync(PricingSettings settings) =>
            Doc.SetAsync(new Dictionary<string, object>
            {
                ["whitepaperBaseCents"] = settings.WhitepaperBaseCents,
                ["pricePerLeadCents"] = settings.PricePerLeadCents,
                ["webinarBaseCents"] = settings.WebinarBaseCents,
                ["adminEmail"] = settings.AdminEmail,
                ["updatedAt"] = Timestamp.GetCurrentTimestamp()
            });

        /// <summary>The prices set on one piece itself, if any (a field left empty falls back to the global default).</summary>
        public static (long? BaseCents, long? PerLeadCents) PieceOverride(IDictionary<string, object> content)
        {
            if (!content.TryGetValue("pricing", out var raw) || raw is not IDictionary<string, object> map) return (null, null);

            long? Read(string key) => map.TryGetValue(key, out var v) && v != null && long.TryParse(v.ToString(), out var n) ? n : null;

            return (Read("baseCents"), Read("perLeadCents"));
        }

        /// <summary>Sets or (with both null) removes the prices of one piece.</summary>
        public Task SetPieceOverrideAsync(string contentId, long? baseCents, long? perLeadCents)
        {
            var docRef = _firestore.Collection(AiCollections.Content).Document(contentId);

            if (baseCents == null && perLeadCents == null)
                return docRef.UpdateAsync(new Dictionary<string, object> { ["pricing"] = FieldValue.Delete });

            var map = new Dictionary<string, object>();
            if (baseCents != null) map["baseCents"] = baseCents.Value;
            if (perLeadCents != null) map["perLeadCents"] = perLeadCents.Value;

            return docRef.UpdateAsync(new Dictionary<string, object> { ["pricing"] = map });
        }
    }

    /// <summary>The stored bookings (collection ai_bookings): requests for a paid whitepaper or webinar campaign.</summary>
    public sealed class BookingStore
    {
        private readonly FirestoreDb _firestore;

        public BookingStore(FirestoreDb firestore)
        {
            _firestore = firestore;
        }

        private CollectionReference Bookings => _firestore.Collection(AiCollections.Bookings);

        public async Task<string> CreateAsync(Dictionary<string, object> booking)
        {
            booking["status"] = "requested";
            booking["createdAt"] = Timestamp.GetCurrentTimestamp();

            var doc = await Bookings.AddAsync(booking);
            return doc.Id;
        }

        public async Task<List<Dictionary<string, object?>>> ListAllAsync(int limit = 200)
        {
            var snapshot = await Bookings.OrderByDescending("createdAt").Limit(limit).GetSnapshotAsync();
            return snapshot.Documents.Select(doc => FirestoreApi.ToApi(doc)).ToList();
        }

        public async Task<List<Dictionary<string, object?>>> ListForContentAsync(string contentId)
        {
            var snapshot = await Bookings.WhereEqualTo("contentId", contentId).Limit(50).GetSnapshotAsync();

            return snapshot.Documents
                .Select(doc => FirestoreApi.ToApi(doc))
                .OrderByDescending(row => row.GetValueOrDefault("createdAt")?.ToString())
                .ToList();
        }
    }
}
