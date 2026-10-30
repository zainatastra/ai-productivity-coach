using System.Collections.Concurrent;

namespace AiProductivityCoach.Api.AiPublishing.Review
{
    /// <summary>Small in-memory throttle for the public invitation endpoints (per caller address).</summary>
    public static class AttemptLimiter
    {
        private static readonly ConcurrentDictionary<string, (int Count, DateTime Start)> Windows = new();

        public static bool Allow(string key, int max, TimeSpan window)
        {
            var now = DateTime.UtcNow;

            if (Windows.Count > 10_000) Windows.Clear();

            var entry = Windows.AddOrUpdate(
                key,
                _ => (1, now),
                (_, old) => now - old.Start > window ? (1, now) : (old.Count + 1, old.Start));

            return entry.Count <= max;
        }
    }
}
