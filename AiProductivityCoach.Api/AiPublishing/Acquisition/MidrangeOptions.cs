namespace AiProductivityCoach.Api.AiPublishing.Acquisition
{
    /// <summary>Connection details for the MIDRANGE WordPress site (config section "Midrange"), kept out of source control.</summary>
    public sealed class MidrangeOptions
    {
        public const string HttpClientName = "midrange";

        public string SiteUrl { get; set; } = string.Empty;
        public string BasicAuthUsername { get; set; } = string.Empty;
        public string BasicAuthPassword { get; set; } = string.Empty;
        public string ApiKey { get; set; } = string.Empty;

        public bool IsConfigured =>
            !string.IsNullOrWhiteSpace(SiteUrl) &&
            !string.IsNullOrWhiteSpace(BasicAuthUsername) &&
            !string.IsNullOrWhiteSpace(ApiKey);
    }
}
