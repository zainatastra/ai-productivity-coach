using AiProductivityCoach.Api.AiPublishing.Content;
using Xunit;

namespace AiProductivityCoach.Api.Tests
{
    public class HtmlRendererTests
    {
        [Fact]
        public void Renders_the_fixed_set_of_tags_and_nothing_else()
        {
            var html = HtmlRenderer.Render(new[]
            {
                ContentBlock.Heading(2, "Überschrift"),
                ContentBlock.Paragraph("Text mit **Betonung** und Umlauten äöü."),
                ContentBlock.List(false, new[] { "Eins", "Zwei" }),
                ContentBlock.List(true, new[] { "Erst", "Dann" }),
                ContentBlock.Quote("Zitat"),
            });

            Assert.Equal(
                "<h2>Überschrift</h2><p>Text mit <strong>Betonung</strong> und Umlauten äöü.</p>" +
                "<ul><li>Eins</li><li>Zwei</li></ul><ol><li>Erst</li><li>Dann</li></ol><blockquote><p>Zitat</p></blockquote>",
                html);
        }

        [Fact]
        public void Everything_the_model_writes_is_encoded()
        {
            var html = HtmlRenderer.Render(new[]
            {
                ContentBlock.Paragraph("<script>alert(1)</script> & <img src=x onerror=y> **fett**"),
                ContentBlock.Heading(2, "<b>x</b>"),
            });

            Assert.DoesNotContain("<script", html);
            Assert.DoesNotContain("<img", html);
            Assert.DoesNotContain("<b>", html);
            Assert.Contains("&lt;script&gt;", html);
            Assert.Contains("&amp;", html);
            Assert.Contains("<strong>fett</strong>", html);
        }

        [Fact]
        public void Heading_levels_are_clamped_and_h1_never_appears()
        {
            Assert.StartsWith("<h2>", HtmlRenderer.Render(new[] { ContentBlock.Heading(1, "A") }));
            Assert.StartsWith("<h3>", HtmlRenderer.Render(new[] { ContentBlock.Heading(9, "A") }));
        }

        [Fact]
        public void Counts_words_in_german_text()
        {
            Assert.Equal(7, HtmlRenderer.WordCount("Die Möglichkeiten für größere Unternehmen sind vielfältig"));
            Assert.Equal(0, HtmlRenderer.WordCount(""));
        }
    }

    public class DocumentParserTests
    {
        private static string Words(int n) => string.Join(" ", Enumerable.Range(1, n).Select(i => "wort" + i));

        private static string ArticleJson(string extra = "") => $@"{{
          ""title"": ""IBM Power im Mittelstand"",
          ""subtitle"": ""Ein Überblick"",
          ""excerpt"": ""Kurzfassung."",
          ""seoTitle"": ""IBM Power im Mittelstand | PROFI"",
          ""metaDescription"": ""Wie Unternehmen IBM Power nutzen."",
          ""body"": [
            {{""type"":""heading"",""level"":2,""text"":""Ausgangslage""}},
            {{""type"":""paragraph"",""text"":""{Words(60)}""}},
            {{""type"":""list"",""ordered"":false,""items"":[""Punkt A"",""Punkt B""]}}
          ],
          ""usedSources"": [1, 3, 3, 99, 0],
          ""notes"": ""Keine Referenzkunden in den Quellen.""
          {extra}
        }}";

        [Fact]
        public void Parses_a_valid_article()
        {
            var result = DocumentParser.Parse(ArticleJson(), ContentTypes.Article, sourceCount: 5);

            Assert.Null(result.ErrorCode);
            var doc = result.Document!;
            Assert.Equal("IBM Power im Mittelstand", doc.Title);
            Assert.Equal(3, doc.Blocks.Count);
            Assert.Equal(new[] { 1, 3 }, doc.UsedSources);          // duplicates and out-of-range numbers dropped
            Assert.Equal("Keine Referenzkunden in den Quellen.", doc.Notes);
        }

        [Fact]
        public void Tolerates_code_fences_and_chatter_around_the_json()
        {
            var wrapped = "Hier ist das Ergebnis:\n```json\n" + ArticleJson() + "\n```\nViel Erfolg!";
            Assert.Null(DocumentParser.Parse(wrapped, ContentTypes.Article, 5).ErrorCode);
        }

        [Theory]
        [InlineData("")]
        [InlineData("kein json")]
        [InlineData("{ nicht ganz")]
        [InlineData("[1,2,3]")]
        public void Rejects_unparseable_output(string raw)
        {
            Assert.Equal("invalid_json", DocumentParser.Parse(raw, ContentTypes.Article, 3).ErrorCode);
        }

        [Fact]
        public void Rejects_missing_title_and_empty_body()
        {
            Assert.Equal("missing_title", DocumentParser.Parse(@"{""title"":"""",""body"":[]}", ContentTypes.Article, 3).ErrorCode);
            Assert.Equal("empty_body", DocumentParser.Parse(@"{""title"":""Titel hier"",""body"":[{""type"":""paragraph"",""text"":""zu kurz""}]}", ContentTypes.Article, 3).ErrorCode);
        }

        [Fact]
        public void Strips_markup_and_links_from_every_string()
        {
            var json = $@"{{""title"":""<b>Titel</b> https://evil.example/x"",
              ""body"":[{{""type"":""paragraph"",""text"":""{Words(60)} <script>x</script> siehe www.evil.com und http://x.de/a""}}]}}";

            var doc = DocumentParser.Parse(json, ContentTypes.Article, 1).Document!;

            Assert.Equal("Titel", doc.Title);
            Assert.DoesNotContain("<", HtmlRenderer.PlainText(doc.Blocks));
            Assert.DoesNotContain("evil", HtmlRenderer.PlainText(doc.Blocks));
            Assert.DoesNotContain("http", HtmlRenderer.PlainText(doc.Blocks));
        }

        [Fact]
        public void Enforces_length_limits_at_word_boundaries()
        {
            var longTitle = string.Join(" ", Enumerable.Repeat("Wort", 80));
            var json = $@"{{""title"":""{longTitle}"",""seoTitle"":""{longTitle}"",
              ""body"":[{{""type"":""paragraph"",""text"":""{Words(60)}""}}]}}";

            var doc = DocumentParser.Parse(json, ContentTypes.Article, 1).Document!;

            Assert.True(doc.Title.Length <= 180);
            Assert.True(doc.SeoTitle.Length <= 70);
            Assert.EndsWith("Wort", doc.Title);   // not cut mid-word
        }

        [Fact]
        public void Ignores_unknown_block_types_and_caps_the_block_count()
        {
            var many = string.Join(",", Enumerable.Range(0, 300).Select(i => $@"{{""type"":""paragraph"",""text"":""Absatz {i} {Words(5)}""}}"));
            var json = $@"{{""title"":""Titel hier"",""body"":[{{""type"":""script"",""text"":""x""}},{many}]}}";

            var doc = DocumentParser.Parse(json, ContentTypes.Article, 1).Document!;

            Assert.Equal(120, doc.Blocks.Count);
            Assert.All(doc.Blocks, b => Assert.Equal("paragraph", b.Type));
        }

        [Fact]
        public void Webinar_needs_objectives_and_an_agenda()
        {
            var body = $@"""body"":[{{""type"":""paragraph"",""text"":""{Words(60)}""}}]";

            Assert.Equal("missing_webinar_fields",
                DocumentParser.Parse($@"{{""title"":""Webinar Titel"",{body}}}", ContentTypes.Webinar, 2).ErrorCode);

            var ok = $@"{{""title"":""Webinar Titel"",{body},
              ""learningObjectives"":[""Ziel eins"",""Ziel zwei""],
              ""targetAudience"":""IT-Leiter"",
              ""agenda"":[{{""title"":""Begrüßung"",""description"":""Kurz"",""minutes"":5}},{{""title"":""Praxis"",""description"":""Demo"",""minutes"":30}}],
              ""durationMinutes"": 999, ""registrationCopy"":""Jetzt anmelden.""}}";

            var doc = DocumentParser.Parse(ok, ContentTypes.Webinar, 2).Document!;

            Assert.Equal(240, doc.Data["durationMinutes"]);   // clamped
            Assert.Equal(2, ((List<Dictionary<string, object>>)doc.Data["agenda"]).Count);
        }
    }

    public class QualityCheckerTests
    {
        private static string Sentence(int repeat) =>
            string.Concat(Enumerable.Repeat("Das Unternehmen betreut die Systeme der Kunden mit großer Sorgfalt und bietet auch Beratung für den Betrieb an. ", repeat));

        private static GeneratedDocument Article(IEnumerable<ContentBlock> blocks, string excerpt = "Kurzfassung des Artikels.", IReadOnlyList<int>? used = null) =>
            new(ContentTypes.Article, "Titel des Artikels", "Untertitel", excerpt, "SEO Titel", "Meta Beschreibung",
                blocks.ToList(), new Dictionary<string, object>(), used ?? new[] { 1, 2 }, string.Empty);

        private static List<ContentBlock> Good() => new()
        {
            ContentBlock.Heading(2, "Ausgangslage"), ContentBlock.Paragraph("A. " + Sentence(8)),
            ContentBlock.Heading(2, "Herausforderung"), ContentBlock.Paragraph("B. " + Sentence(8) + " Anderer Text über Cloud."),
            ContentBlock.Heading(2, "Lösung"), ContentBlock.Paragraph("C. " + Sentence(7) + " Weitere Details zum Betrieb."),
            ContentBlock.Heading(2, "Fazit"), ContentBlock.Paragraph("D. " + Sentence(6) + " Abschluss und Ausblick."),
        };

        private static IReadOnlyList<string> Sources => new[] { "Das Unternehmen betreut IBM Power Systeme. Seit 1989 am Markt." };

        private static QualityReport Run(GeneratedDocument doc, string lang = "de", int provided = 4) =>
            QualityChecker.Check(doc, Sources, lang, provided);

        [Fact]
        public void A_clean_article_passes()
        {
            var report = Run(Article(Good()));
            Assert.Equal("ok", report.State);
            Assert.Empty(report.Checks);
        }

        [Fact]
        public void Flags_missing_excerpt_and_empty_sections()
        {
            var blocks = new List<ContentBlock>
            {
                ContentBlock.Heading(2, "Leer"), ContentBlock.Heading(2, "Auch leer"),
                ContentBlock.Paragraph(Sentence(30)), ContentBlock.Heading(2, "Am Ende leer"),
            };

            var report = Run(Article(blocks, excerpt: ""));

            Assert.Equal("warnings", report.State);
            Assert.Contains(report.Checks, c => c.Code == "missing_excerpt");
            Assert.Equal(2, report.Checks.Count(c => c.Code == "empty_section"));
        }

        [Fact]
        public void Flags_duplicate_paragraphs()
        {
            var p = ContentBlock.Paragraph(Sentence(3));
            var blocks = Good().Concat(new[] { p, p }).ToList();

            Assert.Contains(Run(Article(blocks)).Checks, c => c.Code == "duplicate_paragraph");
        }

        [Fact]
        public void Flags_length_problems_per_type()
        {
            var tiny = Article(new[] { ContentBlock.Paragraph(Sentence(4)) });
            Assert.Contains(Run(tiny).Checks, c => c.Code == "too_short");
            Assert.Contains(Run(tiny).Checks, c => c.Code == "few_headings");
        }

        [Fact]
        public void Flags_wrong_language()
        {
            var english = string.Concat(Enumerable.Repeat("The company is a leader and the products are for your business with the best support of the team. ", 8));
            var doc = Article(new[] { ContentBlock.Heading(2, "Intro"), ContentBlock.Paragraph(english) });

            Assert.Contains(Run(doc, "de").Checks, c => c.Code == "language_mismatch");
            Assert.DoesNotContain(Run(doc, "en").Checks, c => c.Code == "language_mismatch");
        }

        [Fact]
        public void Flags_promotional_language_unless_it_comes_from_the_sources()
        {
            var blocks = Good(); blocks.Add(ContentBlock.Paragraph("Wir sind der unschlagbare Marktführer mit einzigartigen Lösungen."));

            Assert.Contains(Run(Article(blocks)).Checks, c => c.Code == "promotional_language");

            var report = QualityChecker.Check(Article(blocks), new[] { "Der unschlagbare Marktführer mit einzigartigen Lösungen." }, "de", 4);
            Assert.Contains(report.Checks, c => c.Code == "promotional_language");   // >2 buzzwords still reads like marketing
        }

        [Fact]
        public void Flags_numbers_that_are_not_in_the_sources()
        {
            var blocks = Good(); blocks.Add(ContentBlock.Paragraph("Die Verfügbarkeit liegt bei 99,95 % und über 4.500 Kunden vertrauen uns, seit 1989 im Markt, 5 Wege, Jahr 2026."));

            var check = Run(Article(blocks)).Checks.Single(c => c.Code == "unsupported_number");

            Assert.Contains("99,95", check.Detail);
            Assert.Contains("4.500", check.Detail);
            Assert.DoesNotContain("1989", check.Detail);    // appears in the sources
            Assert.DoesNotContain("2026", check.Detail);    // current year
            Assert.DoesNotContain("5", check.Detail.Split(", "));   // small counting number
        }

        [Fact]
        public void Flags_certification_and_partnership_claims_without_support()
        {
            var blocks = Good(); blocks.Add(ContentBlock.Paragraph("Das Unternehmen ist nach ISO 27001 zertifiziert und Gold Partner von Microsoft."));

            Assert.Contains(Run(Article(blocks)).Checks, c => c.Code == "unsupported_claim");

            var supported = QualityChecker.Check(Article(blocks), new[] { "ISO 27001 zertifiziert. Gold Partner von Microsoft." }, "de", 4);
            Assert.DoesNotContain(supported.Checks, c => c.Code == "unsupported_claim");
        }

        [Fact]
        public void Flags_source_coverage()
        {
            Assert.Contains(Run(Article(Good(), used: Array.Empty<int>())).Checks, c => c.Code == "no_sources_used");
            Assert.Contains(Run(Article(Good(), used: new[] { 1 }), provided: 6).Checks, c => c.Code == "low_source_coverage");
        }

        [Fact]
        public void Whitepaper_needs_summary_and_conclusion_sections()
        {
            var blocks = Enumerable.Range(1, 7).SelectMany(i => new[] { ContentBlock.Heading(2, "Abschnitt " + i), ContentBlock.Paragraph(Sentence(20)) }).ToList();
            var doc = new GeneratedDocument(ContentTypes.Whitepaper, "Titel", "", "Kurz", "S", "M", blocks, new Dictionary<string, object>(), new[] { 1, 2 }, "");

            var codes = Run(doc).Checks.Select(c => c.Code).ToList();

            Assert.Contains("missing_summary_section", codes);
            Assert.Contains("missing_conclusion_section", codes);
        }

        [Fact]
        public void Reports_metrics()
        {
            var report = Run(Article(Good()));
            Assert.True((int)report.Metrics["words"] > 300);
            Assert.Equal(4, report.Metrics["headings"]);
            Assert.Equal(2, report.Metrics["sourcesUsed"]);
        }
    }
}
