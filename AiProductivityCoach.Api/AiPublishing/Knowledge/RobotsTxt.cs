using System.Text.RegularExpressions;

namespace AiProductivityCoach.Api.AiPublishing.Knowledge
{
    /// <summary>Minimal robots.txt parser (User-agent groups, Allow/Disallow with * and $, Sitemap lines).</summary>
    public sealed class RobotsTxt
    {
        public const string BotToken = "eyericresearchbot";

        private sealed record Rule(bool Allow, Regex Pattern, int Length);

        private readonly List<Rule> _rules;

        private RobotsTxt(List<Rule> rules, List<string> sitemaps)
        {
            _rules = rules;
            Sitemaps = sitemaps;
        }

        public IReadOnlyList<string> Sitemaps { get; }

        public static RobotsTxt AllowAll { get; } = new(new List<Rule>(), new List<string>());

        public static RobotsTxt Parse(string? content)
        {
            if (string.IsNullOrWhiteSpace(content)) return AllowAll;

            var sitemaps = new List<string>();
            var groups = new List<(List<string> Agents, List<Rule> Rules)>();

            List<string>? agents = null;
            List<Rule>? rules = null;
            var lastWasAgent = false;

            foreach (var rawLine in content.Split('\n'))
            {
                var line = rawLine.Split('#')[0].Trim();
                if (line.Length == 0) continue;

                var colon = line.IndexOf(':');
                if (colon <= 0) continue;

                var field = line[..colon].Trim().ToLowerInvariant();
                var value = line[(colon + 1)..].Trim();

                switch (field)
                {
                    case "user-agent":
                        if (!lastWasAgent || agents == null)
                        {
                            agents = new List<string>();
                            rules = new List<Rule>();
                            groups.Add((agents, rules));
                        }
                        agents.Add(value.ToLowerInvariant());
                        lastWasAgent = true;
                        break;

                    case "allow":
                    case "disallow":
                        lastWasAgent = false;
                        if (rules == null) break;
                        // An empty Disallow means "allow everything" - nothing to record.
                        if (value.Length == 0) break;
                        rules.Add(new Rule(field == "allow", ToRegex(value), value.Length));
                        break;

                    case "sitemap":
                        lastWasAgent = false;
                        if (Uri.TryCreate(value, UriKind.Absolute, out _)) sitemaps.Add(value);
                        break;

                    default:
                        lastWasAgent = false;
                        break;
                }
            }

            // Prefer the group naming our bot, otherwise the "*" group.
            var chosen = groups.FirstOrDefault(g => g.Agents.Any(a => a.Length > 0 && a != "*" && BotToken.Contains(a)))
                         .Rules
                         ?? groups.FirstOrDefault(g => g.Agents.Contains("*")).Rules
                         ?? new List<Rule>();

            return new RobotsTxt(chosen, sitemaps);
        }

        public bool IsAllowed(string pathAndQuery)
        {
            var path = string.IsNullOrEmpty(pathAndQuery) ? "/" : pathAndQuery;

            Rule? best = null;

            foreach (var rule in _rules)
            {
                if (!rule.Pattern.IsMatch(path)) continue;

                // Longest pattern wins; on a tie Allow wins.
                if (best == null || rule.Length > best.Length || (rule.Length == best.Length && rule.Allow))
                    best = rule;
            }

            return best == null || best.Allow;
        }

        private static Regex ToRegex(string pattern)
        {
            var anchored = pattern.EndsWith('$');
            var core = anchored ? pattern[..^1] : pattern;
            var escaped = Regex.Escape(core).Replace("\\*", ".*");

            return new Regex("^" + escaped + (anchored ? "$" : string.Empty),
                RegexOptions.Compiled | RegexOptions.CultureInvariant);
        }
    }
}
