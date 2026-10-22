namespace AiProductivityCoach.Api.AiPublishing.Knowledge
{
    public sealed record TextChunk(int Index, string Heading, string Text);

    /// <summary>
    /// Splits extracted page text into retrieval chunks (~900 characters) at block
    /// boundaries. Every chunk repeats its current heading so it stays understandable alone.
    /// </summary>
    public static class TextChunker
    {
        public const int TargetLength = 900;
        public const int MaxLength = 1400;
        public const int MinLength = 80;
        public const int MaxChunksPerPage = 25;

        public static List<TextChunk> Chunk(string pageTitle, string text)
        {
            var chunks = new List<TextChunk>();
            if (string.IsNullOrWhiteSpace(text)) return chunks;

            var blocks = text.Split(new[] { "\n\n" }, StringSplitOptions.RemoveEmptyEntries)
                .Select(b => b.Trim())
                .Where(b => b.Length > 0)
                .ToList();

            var heading = pageTitle?.Trim() ?? string.Empty;
            var current = new List<string>();
            var currentLength = 0;
            var chunkHeading = heading;

            void Flush()
            {
                if (current.Count == 0) return;

                var body = string.Join("\n\n", current);

                if (body.Length < MinLength && chunks.Count > 0)
                {
                    // Too small to stand alone: merge into the previous chunk.
                    var last = chunks[^1];
                    chunks[^1] = last with { Text = last.Text + "\n\n" + body };
                }
                else
                {
                    chunks.Add(new TextChunk(chunks.Count, chunkHeading, body));
                }

                current = new List<string>();
                currentLength = 0;
            }

            foreach (var block in blocks)
            {
                if (chunks.Count >= MaxChunksPerPage) break;

                if (block.StartsWith('#'))
                {
                    // A new heading starts a new chunk when the current one is already substantial.
                    if (currentLength >= TargetLength / 2) Flush();

                    heading = block.TrimStart('#', ' ').Trim();
                    if (current.Count == 0) chunkHeading = heading;

                    current.Add(block);
                    currentLength += block.Length;
                    continue;
                }

                foreach (var piece in SplitLong(block))
                {
                    if (currentLength + piece.Length > TargetLength && currentLength > 0)
                    {
                        Flush();
                        chunkHeading = heading;
                    }

                    current.Add(piece);
                    currentLength += piece.Length;
                }
            }

            Flush();

            // Drop heading-only leftovers.
            return chunks
                .Where(c => c.Text.Replace("#", string.Empty).Trim().Length >= 30)
                .Select((c, i) => c with { Index = i })
                .Take(MaxChunksPerPage)
                .ToList();
        }

        private static IEnumerable<string> SplitLong(string block)
        {
            if (block.Length <= MaxLength)
            {
                yield return block;
                yield break;
            }

            var sentences = System.Text.RegularExpressions.Regex.Split(block, @"(?<=[\.\!\?])\s+");
            var buffer = new System.Text.StringBuilder();

            foreach (var sentence in sentences)
            {
                if (buffer.Length + sentence.Length > TargetLength && buffer.Length > 0)
                {
                    yield return buffer.ToString().Trim();
                    buffer.Clear();
                }

                // A single sentence longer than the limit is hard-split.
                var rest = sentence;
                while (rest.Length > MaxLength)
                {
                    yield return rest[..MaxLength];
                    rest = rest[MaxLength..];
                }

                buffer.Append(rest).Append(' ');
            }

            if (buffer.Length > 0)
                yield return buffer.ToString().Trim();
        }
    }
}
