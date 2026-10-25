using Microsoft.Extensions.Logging.Abstractions;
using AiProductivityCoach.Api.AiPublishing.Ai;
using AiProductivityCoach.Api.AiPublishing.Content;
using Xunit;

namespace AiProductivityCoach.Api.Tests
{
    internal sealed class FakeLlm : ILlmClient
    {
        private readonly Queue<Func<LlmRequest, LlmResult>> _answers = new();
        public List<LlmRequest> Requests { get; } = new();

        public bool IsConfigured => true;
        public string Provider => "fake";
        public string ModelFor(LlmTier tier) => tier == LlmTier.Writing ? "fake-writer" : "fake-light";

        public FakeLlm Reply(string text) { _answers.Enqueue(r => new LlmResult(text, 100, 50, 0, Provider, ModelFor(r.Tier))); return this; }
        public FakeLlm Throw(Exception ex) { _answers.Enqueue(_ => throw ex); return this; }

        public Task<LlmResult> CompleteAsync(LlmRequest request, CancellationToken cancellationToken)
        {
            Requests.Add(request);
            if (_answers.Count == 0) throw new InvalidOperationException("Unexpected extra model call: " + request.Operation);
            return Task.FromResult(_answers.Dequeue()(request));
        }
    }

    internal sealed class FakeRecorder : IAiRunRecorder
    {
        public List<(string Operation, string Status, int In, int Out)> Runs { get; } = new();

        public Task<string> RecordAsync(string providerId, string? jobId, string operation, string model, string status,
            DateTime startedAtUtc, int promptTokens, int completionTokens, int items, string? error = null,
            string? llmProvider = null, int cacheReadTokens = 0, string? contentId = null)
        {
            Runs.Add((operation, status, promptTokens, completionTokens));
            return Task.FromResult("run");
        }
    }

    public class DocumentWriterTests
    {
        private static string Words(int n) => string.Join(" ", Enumerable.Range(1, n).Select(i => "wort" + i));

        // Realistic bodies: many paragraphs of ~50 words (a single huge paragraph would be truncated by the parser).
        private static string Paragraphs(int totalWords) =>
            string.Join(",", Enumerable.Range(0, Math.Max(1, totalWords / 50)).Select(i =>
                $@"{{""type"":""paragraph"",""text"":""{Words(Math.Min(50, totalWords - i * 50))}""}}"));

        private static string ArticleJson(int bodyWords, string title = "Ein sinnvoller Titel") =>
            $@"{{""title"":""{title}"",""excerpt"":""Kurz."",""body"":[
                {{""type"":""heading"",""level"":2,""text"":""Abschnitt""}},{Paragraphs(bodyWords)}],""usedSources"":[1]}}";

        private static (DocumentWriter Writer, FakeLlm Llm, FakeRecorder Runs) Make()
        {
            var llm = new FakeLlm();
            var runs = new FakeRecorder();
            return (new DocumentWriter(llm, runs, NullLogger<DocumentWriter>.Instance), llm, runs);
        }

        private static Task<WrittenDocument> Write(DocumentWriter writer, string type = ContentTypes.Article) =>
            writer.WriteAsync("p1", type, "prompt", 8000, sourceCount: 3, jobId: "j1", CancellationToken.None);

        [Fact]
        public async Task A_good_first_draft_needs_exactly_one_call()
        {
            var (writer, llm, runs) = Make();
            llm.Reply(ArticleJson(500));

            var result = await Write(writer);

            Assert.False(result.Expanded);
            Assert.Single(llm.Requests);
            Assert.Equal(LlmTier.Writing, llm.Requests[0].Tier);
            Assert.Equal("generate_article", Assert.Single(runs.Runs).Operation);
            Assert.Equal("fake-writer", result.Model);
        }

        [Fact]
        public async Task Broken_json_is_repaired_once_with_the_cheap_model()
        {
            var (writer, llm, runs) = Make();
            llm.Reply("{ das ist kein json").Reply(ArticleJson(500));

            var result = await Write(writer);

            Assert.Equal("Ein sinnvoller Titel", result.Doc.Title);
            Assert.Equal(new[] { LlmTier.Writing, LlmTier.Light }, llm.Requests.Select(r => r.Tier));
            Assert.Equal(new[] { "generate_article", "repair_json" }, runs.Runs.Select(r => r.Operation));
        }

        [Fact]
        public async Task Unrepairable_output_fails_with_a_clear_code()
        {
            var (writer, llm, _) = Make();
            llm.Reply("kaputt").Reply("immer noch kaputt");

            var ex = await Assert.ThrowsAsync<ContentGenerationException>(() => Write(writer));

            Assert.Equal("ai_invalid_output", ex.Code);
        }

        [Fact]
        public async Task An_empty_body_is_not_repaired()
        {
            var (writer, llm, _) = Make();
            llm.Reply(@"{""title"":""Titel hier"",""body"":[]}");

            var ex = await Assert.ThrowsAsync<ContentGenerationException>(() => Write(writer));

            Assert.Equal("ai_invalid_output", ex.Code);
            Assert.Single(llm.Requests);   // no wasted repair call
        }

        [Fact]
        public async Task A_far_too_short_draft_is_expanded_once_and_the_longer_text_wins()
        {
            var (writer, llm, runs) = Make();
            llm.Reply(ArticleJson(150)).Reply(ArticleJson(600, "Erweiterter Titel"));

            var result = await Write(writer);

            Assert.True(result.Expanded);
            Assert.Equal("Erweiterter Titel", result.Doc.Title);
            Assert.Equal(2, llm.Requests.Count);
            Assert.Contains("zu kurz", llm.Requests[1].User);
            Assert.Contains("ERSTER ENTWURF", llm.Requests[1].User);
            Assert.Equal(new[] { "generate_article", "expand_article" }, runs.Runs.Select(r => r.Operation));
        }

        [Fact]
        public async Task A_draft_close_to_the_target_is_not_expanded()
        {
            var (writer, llm, _) = Make();
            llm.Reply(ArticleJson(400));   // 75% of 450 is ~337 words

            Assert.False((await Write(writer)).Expanded);
            Assert.Single(llm.Requests);
        }

        [Fact]
        public async Task A_failed_or_worse_expansion_keeps_the_first_draft()
        {
            var (writer, llm, _) = Make();
            llm.Reply(ArticleJson(150)).Reply("kein json");
            var invalid = await Write(writer);
            Assert.False(invalid.Expanded);
            Assert.Equal("Ein sinnvoller Titel", invalid.Doc.Title);

            var (writer2, llm2, _) = Make();
            llm2.Reply(ArticleJson(150)).Reply(ArticleJson(100, "Kürzer als vorher"));
            var shorter = await Write(writer2);
            Assert.False(shorter.Expanded);
            Assert.Equal("Ein sinnvoller Titel", shorter.Doc.Title);

            var (writer3, llm3, _) = Make();
            llm3.Reply(ArticleJson(150)).Throw(new HttpRequestException("boom"));
            Assert.False((await Write(writer3)).Expanded);   // the expansion is a bonus, never a failure
        }

        [Theory]
        [InlineData(typeof(LlmRefusalException), "ai_refused", "refused")]
        [InlineData(typeof(LlmTruncatedException), "ai_truncated", "truncated")]
        [InlineData(typeof(HttpRequestException), "ai_unavailable", "failed")]
        public async Task Model_failures_map_to_codes_and_are_recorded(Type exceptionType, string code, string runStatus)
        {
            var (writer, llm, runs) = Make();
            llm.Throw((Exception)Activator.CreateInstance(exceptionType, "x")!);

            var ex = await Assert.ThrowsAsync<ContentGenerationException>(() => Write(writer));

            Assert.Equal(code, ex.Code);
            Assert.Equal(runStatus, Assert.Single(runs.Runs).Status);
        }

        [Fact]
        public async Task Token_usage_of_every_call_is_recorded()
        {
            var (writer, llm, runs) = Make();
            llm.Reply(ArticleJson(150)).Reply(ArticleJson(600));

            await Write(writer);

            Assert.All(runs.Runs, r => { Assert.Equal(100, r.In); Assert.Equal(50, r.Out); });
            Assert.Equal(2, runs.Runs.Count);
        }

        [Fact]
        public async Task The_webinar_is_expanded_when_its_landing_text_is_too_short()
        {
            var (writer, llm, _) = Make();
            string Webinar(int words) => $@"{{""title"":""Webinar Titel"",""body"":[{Paragraphs(words)}],
              ""learningObjectives"":[""Ziel eins"",""Ziel zwei""],""agenda"":[{{""title"":""Begrüßung"",""description"":""Kurz"",""minutes"":5}},{{""title"":""Praxisteil"",""description"":""Demo"",""minutes"":20}}]}}";

            llm.Reply(Webinar(90)).Reply(Webinar(300));

            var result = await Write(writer, ContentTypes.Webinar);

            Assert.True(result.Expanded);
        }
    }
}
