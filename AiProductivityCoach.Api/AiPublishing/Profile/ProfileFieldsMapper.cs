using AiProductivityCoach.Api.AiPublishing.Content;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.AiPublishing.Profile
{
    /// <summary>
    /// Builds the effective provider profile: the AI-researched fields (<c>knowledgeProfile</c>,
    /// written by <see cref="Jobs.ResearchJobHandler"/>) with the admin's corrections
    /// (<c>profileEdits</c>) layered on top (spec section 4: "admin can review/correct the
    /// generated data"). An admin field left blank quietly defers back to the AI value, so a later
    /// re-research still improves it; a field the admin filled in is never silently overwritten.
    /// </summary>
    public static class ProfileFieldsMapper
    {
        public static ProfileFields FromAi(IDictionary<string, object> providerData)
        {
            if (!providerData.TryGetValue("knowledgeProfile", out var raw) || raw is not IDictionary<string, object> map)
                return ProfileFields.Empty;

            return Read(map);
        }

        public static ProfileFields FromOverrides(IDictionary<string, object> providerData)
        {
            if (!providerData.TryGetValue("profileEdits", out var raw) || raw is not IDictionary<string, object> map)
                return ProfileFields.Empty;

            return Read(map);
        }

        public static ProfileFields Effective(IDictionary<string, object> providerData) =>
            FromAi(providerData).MergedWith(FromOverrides(providerData));

        private static ProfileFields Read(IDictionary<string, object> map)
        {
            var contact = map.TryGetValue("contact", out var c) && c is IDictionary<string, object> contactMap
                ? contactMap
                : new Dictionary<string, object>();

            return new ProfileFields(
                FirestoreApi.GetString(map, "shortDescription"),
                FirestoreApi.GetString(map, "headline"),
                FirestoreApi.GetString(map, "description"),
                FirestoreApi.GetString(map, "headquarters"),
                FirestoreApi.GetString(map, "foundedYear"),
                FirestoreApi.GetString(map, "employeeRange"),
                StringsOf(map, "specialties"),
                StringsOf(map, "categories"),
                FirestoreApi.GetString(contact, "email"),
                FirestoreApi.GetString(contact, "phone"),
                FirestoreApi.GetString(contact, "address"));
        }

        private static List<string> StringsOf(IDictionary<string, object> map, string key) =>
            map.TryGetValue(key, out var v) && v is IEnumerable<object> items
                ? items.Select(i => i?.ToString() ?? string.Empty).Where(s => s.Length > 0).ToList()
                : new List<string>();

        /// <summary>The DTO submitted by the admin, stored as-is into <c>profileEdits</c> (an empty field means "use the AI value").</summary>
        public static Dictionary<string, object> ToOverrideMap(ProfileFields fields) => new()
        {
            ["shortDescription"] = fields.ShortDescription,
            ["headline"] = fields.Headline,
            // Overrides reuse "description" as the key name so FromOverrides/FromAi read the same shape.
            ["description"] = fields.Overview,
            ["headquarters"] = fields.Headquarters,
            ["foundedYear"] = fields.FoundedYear,
            ["employeeRange"] = fields.EmployeeRange,
            ["specialties"] = fields.Specialties.ToList(),
            ["categories"] = fields.Categories.ToList(),
            ["contact"] = new Dictionary<string, object>
            {
                ["email"] = fields.Email, ["phone"] = fields.Phone, ["address"] = fields.Address
            }
        };
    }
}
