namespace AiProductivityCoach.Api.AiPublishing.Content
{
    /// <summary>
    /// How long a document should be. The admin picks a preset per content piece in the plan; the
    /// writer gets the target range, and the automatic checks accept a wider range around it.
    /// </summary>
    public static class LengthPresets
    {
        public const string Short = "short";
        public const string Standard = "standard";
        public const string Long = "long";
        public const string Extra = "extra";

        public static IReadOnlyList<string> For(string type) => type switch
        {
            ContentTypes.Article => new[] { Short, Standard, Long },
            ContentTypes.Whitepaper => new[] { Short, Standard, Long, Extra },
            _ => new[] { Standard }
        };

        /// <summary>Unknown or not allowed values fall back to the standard length.</summary>
        public static string Normalize(string type, string? value) =>
            value != null && For(type).Contains(value) ? value : Standard;

        /// <summary>The word range the writer is asked for.</summary>
        public static (int Min, int Max) Target(string type, string? preset) =>
            (type, Normalize(type, preset)) switch
            {
                (ContentTypes.Article, Short) => (400, 600),
                (ContentTypes.Article, Long) => (1100, 1500),
                (ContentTypes.Article, _) => (700, 900),
                (ContentTypes.Whitepaper, Short) => (1000, 1500),
                (ContentTypes.Whitepaper, Long) => (3000, 4000),
                (ContentTypes.Whitepaper, Extra) => (4500, 6000),
                (ContentTypes.Whitepaper, _) => (1800, 2500),
                _ => (250, 400)
            };

        /// <summary>The range the quality check accepts without a length warning.</summary>
        public static (int Min, int Max) Accepted(string type, string? preset) =>
            (type, Normalize(type, preset)) switch
            {
                (ContentTypes.Article, Short) => (250, 800),
                (ContentTypes.Article, Long) => (750, 1900),
                (ContentTypes.Article, _) => (450, 1200),
                (ContentTypes.Whitepaper, Short) => (700, 2200),
                (ContentTypes.Whitepaper, Long) => (1900, 5200),
                (ContentTypes.Whitepaper, Extra) => (2900, 7500),
                (ContentTypes.Whitepaper, _) => (1100, 3400),
                (ContentTypes.Webinar, _) => (250, 1400),
                _ => (0, int.MaxValue)
            };
    }
}
