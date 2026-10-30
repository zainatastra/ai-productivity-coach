using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.AiPublishing.Content
{
    public sealed class EditBlockDto
    {
        public string? Type { get; set; }
        public int Level { get; set; }
        public string? Text { get; set; }
        public bool Ordered { get; set; }
        public List<string>? Items { get; set; }
    }

    public sealed class EditAgendaDto
    {
        public string? Title { get; set; }
        public string? Description { get; set; }
        public int Minutes { get; set; }
    }

    public sealed class EditDataDto
    {
        public string? CallToAction { get; set; }
        public int DurationMinutes { get; set; }
        public string? TargetAudience { get; set; }
        public List<string>? LearningObjectives { get; set; }
        public List<EditAgendaDto>? Agenda { get; set; }
        public string? SpeakerInfo { get; set; }
        public string? RegistrationCopy { get; set; }
        public List<string>? DiscussionPoints { get; set; }
        public string? BannerText { get; set; }
    }

    public sealed class EditDocumentDto
    {
        public string? Title { get; set; }
        public string? Subtitle { get; set; }
        public string? Excerpt { get; set; }
        public string? SeoTitle { get; set; }
        public string? MetaDescription { get; set; }
        public List<EditBlockDto>? Blocks { get; set; }
        public EditDataDto? Data { get; set; }
    }

    public sealed record EditOutcome(GeneratedDocument? Document, string? ErrorCode);

    /// <summary>
    /// Converts between the stored (Firestore) shape of a draft and <see cref="GeneratedDocument"/>,
    /// and validates text typed by the admin with the same limits and cleaning as AI output.
    /// </summary>
    public static class ContentDocumentMapper
    {
        public const int MaxBlocks = 150;

        // ───────────── stored -> document ─────────────

        public static GeneratedDocument FromStored(IDictionary<string, object> data)
        {
            var type = FirestoreApi.GetString(data, "type");

            var blocks = new List<ContentBlock>();
            if (data.TryGetValue("blocks", out var rawBlocks) && rawBlocks is IEnumerable<object> list)
            {
                foreach (var item in list.OfType<IDictionary<string, object>>())
                {
                    var items = item.TryGetValue("items", out var rawItems) && rawItems is IEnumerable<object> itemList
                        ? itemList.Select(i => i?.ToString() ?? string.Empty).ToList()
                        : new List<string>();

                    blocks.Add(new ContentBlock(
                        FirestoreApi.GetString(item, "type", "paragraph"),
                        (int)FirestoreApi.GetLong(item, "level"),
                        FirestoreApi.GetString(item, "text"),
                        item.TryGetValue("ordered", out var ordered) && ordered is true,
                        items));
                }
            }

            var extra = new Dictionary<string, object>();
            if (data.TryGetValue("data", out var rawData) && rawData is IDictionary<string, object> map)
            {
                foreach (var (key, value) in map)
                {
                    switch (value)
                    {
                        case string text: extra[key] = text; break;
                        case long number: extra[key] = (int)number; break;
                        case IEnumerable<object> items when key == "agenda":
                            extra[key] = items.OfType<IDictionary<string, object>>().Select(a => new Dictionary<string, object>
                            {
                                ["title"] = FirestoreApi.GetString(a, "title"),
                                ["description"] = FirestoreApi.GetString(a, "description"),
                                ["minutes"] = (int)FirestoreApi.GetLong(a, "minutes")
                            }).ToList();
                            break;
                        case IEnumerable<object> items:
                            extra[key] = items.Select(i => i?.ToString() ?? string.Empty).ToList();
                            break;
                    }
                }
            }

            var used = new List<int>();
            if (data.TryGetValue("sources", out var rawSources) && rawSources is IEnumerable<object> sourceList)
            {
                foreach (var source in sourceList.OfType<IDictionary<string, object>>())
                {
                    if (source.TryGetValue("used", out var flag) && flag is true)
                        used.Add((int)FirestoreApi.GetLong(source, "number"));
                }
            }

            return new GeneratedDocument(
                type,
                FirestoreApi.GetString(data, "title"),
                FirestoreApi.GetString(data, "subtitle"),
                FirestoreApi.GetString(data, "excerpt"),
                FirestoreApi.GetString(data, "seoTitle"),
                FirestoreApi.GetString(data, "metaDescription"),
                blocks,
                extra,
                used,
                FirestoreApi.GetString(data, "notes"));
        }

        public static List<SourceRef> SourcesFromStored(IDictionary<string, object> data)
        {
            var result = new List<SourceRef>();

            if (data.TryGetValue("sources", out var raw) && raw is IEnumerable<object> list)
            {
                foreach (var source in list.OfType<IDictionary<string, object>>())
                {
                    result.Add(new SourceRef(
                        (int)FirestoreApi.GetLong(source, "number"),
                        FirestoreApi.GetString(source, "url"),
                        FirestoreApi.GetString(source, "title"),
                        source.TryGetValue("used", out var used) && used is true));
                }
            }

            return result;
        }

        // ───────────── edited by the admin -> document ─────────────

        public static EditOutcome FromEdit(EditDocumentDto dto, GeneratedDocument current)
        {
            var title = DocumentParser.Clean(dto.Title, 180);
            if (title.Length < 3) return new EditOutcome(null, "missing_title");

            var blocks = new List<ContentBlock>();

            foreach (var raw in dto.Blocks ?? new List<EditBlockDto>())
            {
                if (blocks.Count >= MaxBlocks) return new EditOutcome(null, "too_many_blocks");

                switch (raw.Type)
                {
                    case "heading":
                        var heading = DocumentParser.Clean(raw.Text, 200);
                        if (heading.Length > 0) blocks.Add(ContentBlock.Heading(raw.Level == 3 ? 3 : 2, heading));
                        break;

                    case "paragraph":
                        var paragraph = DocumentParser.Clean(raw.Text, 2500);
                        if (paragraph.Length > 0) blocks.Add(ContentBlock.Paragraph(paragraph));
                        break;

                    case "quote":
                        var quote = DocumentParser.Clean(raw.Text, 600);
                        if (quote.Length > 0) blocks.Add(ContentBlock.Quote(quote));
                        break;

                    case "list":
                        var items = (raw.Items ?? new List<string>())
                            .Select(i => DocumentParser.Clean(i, 400))
                            .Where(i => i.Length > 0)
                            .Take(40)
                            .ToList();
                        if (items.Count > 0) blocks.Add(ContentBlock.List(raw.Ordered, items));
                        break;

                    default:
                        return new EditOutcome(null, "invalid_block");
                }
            }

            if (blocks.Count == 0) return new EditOutcome(null, "empty_body");

            var data = new Dictionary<string, object>();

            if (current.Type == ContentTypes.Whitepaper)
            {
                data["callToAction"] = DocumentParser.Clean(dto.Data?.CallToAction, 300);
            }
            else if (current.Type == ContentTypes.Webinar)
            {
                var d = dto.Data ?? new EditDataDto();

                data["learningObjectives"] = Lines(d.LearningObjectives, 8, 300);
                data["targetAudience"] = DocumentParser.Clean(d.TargetAudience, 400);
                data["agenda"] = (d.Agenda ?? new List<EditAgendaDto>())
                    .Select(a => new Dictionary<string, object>
                    {
                        ["title"] = DocumentParser.Clean(a.Title, 120),
                        ["description"] = DocumentParser.Clean(a.Description, 400),
                        ["minutes"] = Math.Clamp(a.Minutes, 0, 240)
                    })
                    .Where(a => ((string)a["title"]).Length > 0)
                    .Take(12)
                    .Cast<Dictionary<string, object>>()
                    .ToList();
                data["durationMinutes"] = Math.Clamp(d.DurationMinutes == 0 ? 60 : d.DurationMinutes, 15, 240);
                data["speakerInfo"] = DocumentParser.Clean(d.SpeakerInfo, 600);
                data["registrationCopy"] = DocumentParser.Clean(d.RegistrationCopy, 1200);
                data["discussionPoints"] = Lines(d.DiscussionPoints, 10, 300);
                data["bannerText"] = DocumentParser.Clean(d.BannerText, 120);
            }

            return new EditOutcome(new GeneratedDocument(
                current.Type,
                title,
                DocumentParser.Clean(dto.Subtitle, 320),
                DocumentParser.Clean(dto.Excerpt, 500),
                DocumentParser.Clean(dto.SeoTitle, 70),
                DocumentParser.Clean(dto.MetaDescription, 160),
                blocks,
                data,
                current.UsedSources,
                current.Notes), null);
        }

        private static List<string> Lines(List<string>? values, int max, int length) =>
            (values ?? new List<string>())
                .Select(v => DocumentParser.Clean(v, length))
                .Where(v => v.Length > 0)
                .Take(max)
                .ToList();
    }
}
