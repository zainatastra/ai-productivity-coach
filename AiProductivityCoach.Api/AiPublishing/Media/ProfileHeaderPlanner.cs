namespace AiProductivityCoach.Api.AiPublishing.Media
{
    /// <summary>
    /// Builds the image prompt for a provider's AI-generated profile header/banner (spec section 7:
    /// "created by the AI according to the info it fetched"). Deterministic from the researched
    /// profile - no extra AI call, so the banner can never invent facts about the company and the
    /// step has one less way to fail. Same safety rule as content images (<see cref="ImagePlanner"/>):
    /// no text, no logos, no real people, since the model cannot render them reliably anyway.
    /// </summary>
    public static class ProfileHeaderPlanner
    {
        // The actual pixel size is fixed by the image API call (OpenAiImageClient); this only guides
        // the composition so the result still works when cropped into a wide banner by the frontend.
        private const string Suffix =
            " Wide, landscape banner composition with the main visual interest centred so it still works " +
            "when cropped wider. No text, no letters, no numbers, no logos, no watermarks, no recognizable " +
            "real people. Calm, professional, modern corporate style.";

        private static readonly (string[] Keywords, string Scene)[] IndustryScenes =
        {
            (new[] { "software", "it", "cloud", "daten", "data", "digital", "cyber", "security", "sicherheit" },
                "a bright, modern technology workspace with abstract glowing network lines and soft geometric data shapes"),
            (new[] { "bau", "immobil", "architektur", "construction", "real estate" },
                "a clean architectural scene with structural lines, scaffolding silhouettes and soft daylight"),
            (new[] { "industrie", "produktion", "manufacturing", "maschinen", "fertigung" },
                "a bright, orderly industrial production hall with abstract machine silhouettes and soft light"),
            (new[] { "finanz", "banking", "versicherung", "finance", "insurance" },
                "a calm, abstract scene of rising geometric bar shapes and soft light suggesting stability and growth"),
            (new[] { "gesundheit", "medizin", "health", "pharma" },
                "a bright, calm scene with soft abstract organic shapes suggesting care and precision"),
            (new[] { "logistik", "transport", "logistics", "supply" },
                "an abstract scene of flowing connected lines and soft geometric shapes suggesting movement and routes"),
        };

        private const string DefaultScene =
            "a calm, modern workspace with abstract geometric shapes and soft structured lines suggesting organised, professional work";

        /// <summary>A neutral, brand-appropriate banner prompt built from what the research actually found.</summary>
        public static string Build(string providerName, IReadOnlyList<string> industries, IReadOnlyList<string> topics)
        {
            var haystack = string.Join(" ", industries.Concat(topics)).ToLowerInvariant();
            var scene = IndustryScenes.FirstOrDefault(x => x.Keywords.Any(haystack.Contains)).Scene ?? DefaultScene;

            return $"A professional B2B company header banner: {scene}, in muted blue and grey tones with soft natural light." + Suffix;
        }
    }
}
