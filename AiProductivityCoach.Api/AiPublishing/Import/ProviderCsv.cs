using System.Text;
using AiProductivityCoach.Api.AiPublishing.Security;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.AiPublishing.Import
{
    public sealed record CsvRow(int Line, string Name, string Website);

    public sealed record CsvParseResult(
        bool Ok, string? Error, IReadOnlyList<CsvRow> Rows, IReadOnlyList<string> IgnoredColumns, bool EncodingIssue);

    public sealed record RowCheck(int Line, string Name, string Website, string Host, string Status, string? Error);

    /// <summary>
    /// Reads the provider CSV for the bulk import. The exact columns were never fixed by the client, so only
    /// the two needed to create a provider are required (company name and website); a few common header names
    /// are understood, any other column is reported and ignored. A bad row never stops the others.
    /// </summary>
    public static class ProviderCsv
    {
        public const int MaxRows = 200;
        public const int MaxChars = 1_000_000;

        private static readonly string[] NameHeaders =
        {
            "companyname", "name", "company", "firma", "firmenname", "unternehmen", "unternehmensname", "anbieter", "loesungsanbieter", "lösungsanbieter", "providername", "provider"
        };

        private static readonly string[] WebsiteHeaders = { "website", "url", "webseite", "homepage", "domain", "web", "site", "websiteurl" };

        private static string Normalize(string header) =>
            new string((header ?? string.Empty).Trim().ToLowerInvariant().Where(char.IsLetterOrDigit).ToArray());

        /// <summary>The delimiter that splits the header line into the most columns outside quotes (comma, semicolon or tab).</summary>
        public static char DetectDelimiter(string firstLine)
        {
            var best = ',';
            var bestCount = -1;

            foreach (var candidate in new[] { ',', ';', '\t' })
            {
                var inQuotes = false;
                var count = 0;

                foreach (var c in firstLine)
                {
                    if (c == '"') inQuotes = !inQuotes;
                    else if (c == candidate && !inQuotes) count++;
                }

                if (count > bestCount) { best = candidate; bestCount = count; }
            }

            return best;
        }

        /// <summary>RFC 4180 style: quoted fields may hold the delimiter, line breaks and doubled quotes.</summary>
        public static List<List<string>> Records(string text, char delimiter)
        {
            var records = new List<List<string>>();
            var row = new List<string>();
            var field = new StringBuilder();
            var inQuotes = false;

            void EndField() { row.Add(field.ToString()); field.Clear(); }
            void EndRow() { EndField(); records.Add(row); row = new List<string>(); }

            for (var i = 0; i < text.Length; i++)
            {
                var c = text[i];

                if (inQuotes)
                {
                    if (c == '"')
                    {
                        if (i + 1 < text.Length && text[i + 1] == '"') { field.Append('"'); i++; }
                        else inQuotes = false;
                    }
                    else field.Append(c);
                }
                else if (c == '"' && field.Length == 0) inQuotes = true;
                else if (c == delimiter) EndField();
                else if (c == '\r') { if (i + 1 < text.Length && text[i + 1] == '\n') i++; EndRow(); }
                else if (c == '\n') EndRow();
                else field.Append(c);
            }

            if (field.Length > 0 || row.Count > 0) EndRow();

            return records;
        }

        public static CsvParseResult Parse(string? input)
        {
            var text = (input ?? string.Empty).TrimStart('﻿');
            if (string.IsNullOrWhiteSpace(text)) return Fail("csv_empty");
            if (text.Length > MaxChars) return Fail("csv_too_large");

            var encodingIssue = text.Contains('�');
            var firstLine = text.Split('\n', 2)[0].TrimEnd('\r');
            var records = Records(text, DetectDelimiter(firstLine));
            if (records.Count == 0) return Fail("csv_empty");

            var header = records[0].Select(Normalize).ToList();
            var nameColumn = header.FindIndex(h => NameHeaders.Contains(h));
            var websiteColumn = header.FindIndex(h => WebsiteHeaders.Contains(h));
            if (nameColumn < 0 || websiteColumn < 0) return Fail("csv_missing_columns");

            var ignored = records[0].Where((_, i) => i != nameColumn && i != websiteColumn).Select(h => h.Trim()).Where(h => h.Length > 0).ToList();

            var rows = new List<CsvRow>();
            for (var i = 1; i < records.Count; i++)
            {
                var record = records[i];
                string Cell(int column) => column < record.Count ? record[column].Trim() : string.Empty;

                var name = Cell(nameColumn);
                var website = Cell(websiteColumn);
                if (name.Length == 0 && website.Length == 0 && record.All(f => f.Trim().Length == 0)) continue; // blank line

                rows.Add(new CsvRow(i + 1, name, website));
            }

            if (rows.Count == 0) return Fail("csv_no_rows");
            if (rows.Count > MaxRows) return Fail("csv_too_many_rows");

            return new CsvParseResult(true, null, rows, ignored, encodingIssue);
        }

        private static CsvParseResult Fail(string code) => new(false, code, Array.Empty<CsvRow>(), Array.Empty<string>(), false);

        /// <summary>
        /// Checks each row on its own and flags a website that appears twice in the file (the first one wins).
        /// Status is "ok", "invalid" (with the reason) or "duplicate_in_file".
        /// </summary>
        public static List<RowCheck> Check(IEnumerable<CsvRow> rows)
        {
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var checks = new List<RowCheck>();

            foreach (var row in rows)
            {
                var name = ProviderCreationService.CleanName(row.Name);
                var nameProblem = ProviderCreationService.NameProblem(name);
                if (nameProblem != null) { checks.Add(new(row.Line, name, row.Website, string.Empty, "invalid", nameProblem)); continue; }

                var url = UrlSafety.Normalize(row.Website);
                if (!url.Ok) { checks.Add(new(row.Line, name, row.Website, string.Empty, "invalid", url.Error)); continue; }

                var bare = url.Host!.StartsWith("www.", StringComparison.Ordinal) ? url.Host[4..] : url.Host;
                if (!seen.Add(bare)) { checks.Add(new(row.Line, name, url.Normalized!, bare, "duplicate_in_file", "duplicate_in_file")); continue; }

                checks.Add(new(row.Line, name, url.Normalized!, bare, "ok", null));
            }

            return checks;
        }
    }
}
