namespace AiProductivityCoach.Api.AiPublishing.Content
{
    /// <summary>
    /// The extra profile fields a provider page needs beyond the AI content-writing brief (spec
    /// sections 4-8): the human-readable "About" information, matching the fields the real EY ERIC
    /// company profile already has (<c>CompanyController.AboutDto</c>/<c>UpdateCompanyDto</c>), so a
    /// later "send to EY ERIC" step (Phase 3) can map this 1:1 without re-shaping it.
    /// </summary>
    public sealed record ProfileFields(
        string ShortDescription,
        string Headline,
        string Overview,
        string Headquarters,
        string FoundedYear,
        string EmployeeRange,
        IReadOnlyList<string> Specialties,
        IReadOnlyList<string> Categories,
        string Email,
        string Phone,
        string Address)
    {
        public static readonly ProfileFields Empty = new(
            "", "", "", "", "", "", Array.Empty<string>(), Array.Empty<string>(), "", "", "");

        /// <summary>The AI-researched value for every field that the admin has not overridden.</summary>
        public ProfileFields MergedWith(ProfileFields overrides) => new(
            Pick(overrides.ShortDescription, ShortDescription),
            Pick(overrides.Headline, Headline),
            Pick(overrides.Overview, Overview),
            Pick(overrides.Headquarters, Headquarters),
            Pick(overrides.FoundedYear, FoundedYear),
            Pick(overrides.EmployeeRange, EmployeeRange),
            overrides.Specialties.Count > 0 ? overrides.Specialties : Specialties,
            overrides.Categories.Count > 0 ? overrides.Categories : Categories,
            Pick(overrides.Email, Email),
            Pick(overrides.Phone, Phone),
            Pick(overrides.Address, Address));

        private static string Pick(string overrideValue, string fallback) =>
            string.IsNullOrWhiteSpace(overrideValue) ? fallback : overrideValue;
    }
}
