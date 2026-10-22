namespace AiProductivityCoach.Api.AiPublishing.Domain
{
    /// <summary>Roles used inside the shared AI Publishing Engine.</summary>
    public static class AiRoles
    {
        public const string Admin = "admin";
        public const string CompanyPublisher = "company_publisher";
        public const string System = "system";
    }

    /// <summary>The two platforms served by the shared engine. Each keeps its own login.</summary>
    public static class Platforms
    {
        public const string EyEric = "eyeric";
        public const string Midrange = "midrange";

        public static readonly string[] All = { EyEric, Midrange };

        public static bool IsValid(string? value) =>
            !string.IsNullOrWhiteSpace(value) &&
            All.Contains(value.Trim().ToLowerInvariant());
    }

    public static class ProviderStatus
    {
        public const string Created = "created";
        public const string Archived = "archived";
    }

    public static class SourceStatus
    {
        public const string Pending = "pending";
        public const string Checking = "checking";
        public const string Available = "available";
        public const string Unavailable = "unavailable";
    }

    public static class SourceTypes
    {
        public const string Homepage = "homepage";
        public const string Other = "other";

        public static readonly string[] All =
        {
            "homepage", "product", "documentation", "support", "press",
            "case_study", "event", "article", "tutorial", "partner", "other"
        };

        public static string Normalize(string? value)
        {
            var candidate = value?.Trim().ToLowerInvariant() ?? string.Empty;
            return All.Contains(candidate) ? candidate : Other;
        }
    }

    public static class JobTypes
    {
        public const string SourceCheck = "source.check";
        public const string Research = "research";
    }

    public static class JobStatus
    {
        public const string Queued = "queued";
        public const string Researching = "researching";
        public const string Indexing = "indexing";
        public const string Planning = "planning";
        public const string Generating = "generating";
        public const string GeneratingMedia = "generating_media";
        public const string Completed = "completed";
        public const string PartiallyCompleted = "partially_completed";
        public const string Failed = "failed";
        public const string Cancelled = "cancelled";

        public static readonly string[] Active =
        {
            Researching, Indexing, Planning, Generating, GeneratingMedia
        };

        public static readonly string[] Terminal =
        {
            Completed, PartiallyCompleted, Failed, Cancelled
        };

        public static bool IsActive(string? s) => s != null && Active.Contains(s);
        public static bool IsTerminal(string? s) => s != null && Terminal.Contains(s);
        public static bool IsRunnable(string? s) => s == Queued || IsActive(s);
    }

    public static class AuditActions
    {
        public const string ProviderCreated = "PROVIDER_CREATED";
        public const string ProviderUpdated = "PROVIDER_UPDATED";
        public const string ProviderArchived = "PROVIDER_ARCHIVED";
        public const string ProviderRestored = "PROVIDER_RESTORED";
        public const string SourceAdded = "SOURCE_ADDED";
        public const string SourceRemoved = "SOURCE_REMOVED";
        public const string SourceCrawlStarted = "SOURCE_CRAWL_STARTED";
        public const string SourceCrawlCompleted = "SOURCE_CRAWL_COMPLETED";
        public const string SourceCrawlFailed = "SOURCE_CRAWL_FAILED";
        public const string JobCreated = "JOB_CREATED";
        public const string JobCancelled = "JOB_CANCELLED";
        public const string JobRetried = "JOB_RETRIED";
        public const string ResearchStarted = "RESEARCH_STARTED";
        public const string ResearchCompleted = "RESEARCH_COMPLETED";
        public const string ResearchFailed = "RESEARCH_FAILED";
        public const string KnowledgeUpdated = "KNOWLEDGE_BASE_UPDATED";
    }

    public static class AiCollections
    {
        public const string Providers = "ai_providers";
        public const string Sources = "sources";
        public const string Jobs = "ai_jobs";
        public const string Notifications = "ai_notifications";
        public const string AuditLogs = "ai_audit_logs";
        public const string Runs = "ai_runs";
        public const string Pages = "pages";
        public const string Chunks = "knowledge_chunks";
    }
}
