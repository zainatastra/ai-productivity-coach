using AiProductivityCoach.Api.AiPublishing.Knowledge;
using Xunit;

namespace AiProductivityCoach.Api.Tests
{
    public class HtmlTextExtractorTests
    {
        private const string Page = @"<!doctype html><html lang=""de-DE""><head>
<title>Produkte - PROFI Engineering Systems AG</title>
<meta name=""description"" content=""IT-Dienstleistungen für den Mittelstand""></head>
<body>
<div class=""cookie-banner"">Wir verwenden Cookies. <button>Akzeptieren</button></div>
<header><nav><ul><li><a href=""/produkte"">Produkte</a></li><li><a href=""/kontakt"">Kontakt</a></li></ul></nav></header>
<main>
  <h1>IBM Power Systeme</h1>
  <p>PROFI Engineering Systems AG betreut IBM Power Infrastrukturen für mittelständische Unternehmen in ganz Deutschland und bietet Beratung, Betrieb und Modernisierung aus einer Hand.</p>
  <h2>Leistungen</h2>
  <ul><li>Beratung zur Modernisierung der Plattform</li><li>Betrieb und Monitoring rund um die Uhr</li></ul>
  <p><a href=""/mehr"">Mehr erfahren</a></p>
  <table><tr><th>Modell</th><th>Einsatz</th></tr><tr><td>Power10</td><td>Datenbanken und ERP</td></tr></table>
</main>
<aside class=""sidebar"">Newsletter abonnieren</aside>
<footer><p>© 2026 PROFI AG · Impressum · Datenschutz</p></footer>
<script>var x = 1;</script>
</body></html>";

        [Fact]
        public void Keeps_main_content_and_drops_boilerplate()
        {
            var result = HtmlTextExtractor.Extract(Page, new Uri("https://www.profi-ag.de/produkte"));

            Assert.Contains("# IBM Power Systeme", result.Text);
            Assert.Contains("## Leistungen", result.Text);
            Assert.Contains("- Beratung zur Modernisierung der Plattform", result.Text);
            Assert.Contains("Power10 | Datenbanken und ERP", result.Text);
            Assert.Contains("mittelständische Unternehmen", result.Text);

            Assert.DoesNotContain("Cookies", result.Text);
            Assert.DoesNotContain("Newsletter", result.Text);
            Assert.DoesNotContain("Impressum", result.Text);
            Assert.DoesNotContain("var x", result.Text);
            Assert.DoesNotContain("Mehr erfahren", result.Text); // link-only noise
        }

        [Fact]
        public void Reads_metadata()
        {
            var result = HtmlTextExtractor.Extract(Page, new Uri("https://www.profi-ag.de/produkte"));

            Assert.Equal("Produkte - PROFI Engineering Systems AG", result.Title);
            Assert.Equal("IT-Dienstleistungen für den Mittelstand", result.Description);
            Assert.Equal("de-de", result.Language);
        }

        [Fact]
        public void Collects_links_from_navigation_before_it_is_removed()
        {
            var result = HtmlTextExtractor.Extract(Page, new Uri("https://www.profi-ag.de/produkte"));

            Assert.Contains("https://www.profi-ag.de/kontakt", result.Links);
            Assert.Contains("https://www.profi-ag.de/mehr", result.Links);
        }

        [Fact]
        public void Hash_changes_only_when_text_changes()
        {
            var a = HtmlTextExtractor.Extract(Page, new Uri("https://x.de/"));
            var b = HtmlTextExtractor.Extract(Page.Replace("Wir verwenden Cookies.", "Andere Cookies."), new Uri("https://x.de/"));
            var c = HtmlTextExtractor.Extract(Page.Replace("Power10", "Power11"), new Uri("https://x.de/"));

            Assert.Equal(a.Hash, b.Hash);   // boilerplate changes are ignored
            Assert.NotEqual(a.Hash, c.Hash);
        }

        [Fact]
        public void A_nav_wrapper_around_real_content_is_not_deleted()
        {
            var html = "<html><body><div class=\"sidebar-layout\"><main><h1>Titel</h1><p>" + new string('a', 300) + "</p></main></div></body></html>";
            var result = HtmlTextExtractor.Extract(html, new Uri("https://x.de/"));

            Assert.Contains("# Titel", result.Text);
        }

        [Fact]
        public void Handles_empty_and_script_only_pages()
        {
            var empty = HtmlTextExtractor.Extract("<html><body><div id=\"app\"></div><script>render()</script></body></html>", new Uri("https://x.de/"));
            Assert.True(empty.Text.Length < 20);

            var none = HtmlTextExtractor.Extract("", new Uri("https://x.de/"));
            Assert.Equal(string.Empty, none.Text);
        }
    }

    public class TextChunkerTests
    {
        [Fact]
        public void Splits_long_text_and_keeps_the_heading_context()
        {
            var paragraphs = Enumerable.Range(1, 12).Select(i => $"Absatz {i}: " + new string('x', 350));
            var text = "# Hauptthema\n\n" + string.Join("\n\n", paragraphs.Take(6)) + "\n\n## Unterthema\n\n" + string.Join("\n\n", paragraphs.Skip(6));

            var chunks = TextChunker.Chunk("Seitentitel", text);

            Assert.True(chunks.Count >= 3);
            Assert.All(chunks, c => Assert.True(c.Text.Length <= TextChunker.MaxLength + 400));
            Assert.Equal(Enumerable.Range(0, chunks.Count), chunks.Select(c => c.Index));
            Assert.Contains(chunks, c => c.Heading == "Unterthema");
        }

        [Fact]
        public void Tiny_text_yields_nothing_useful()
        {
            Assert.Empty(TextChunker.Chunk("T", ""));
            Assert.Empty(TextChunker.Chunk("T", "# Nur eine Überschrift"));
        }

        [Fact]
        public void A_single_huge_paragraph_is_split()
        {
            var sentence = "Dies ist ein vollständiger Satz mit etwas Inhalt. ";
            var text = string.Concat(Enumerable.Repeat(sentence, 120));

            var chunks = TextChunker.Chunk("T", text);

            Assert.True(chunks.Count > 1);
            Assert.All(chunks, c => Assert.True(c.Text.Length <= TextChunker.MaxLength + 200));
        }

        [Fact]
        public void Number_of_chunks_per_page_is_capped()
        {
            var text = string.Join("\n\n", Enumerable.Range(0, 200).Select(i => "Block " + i + " " + new string('y', 500)));
            Assert.True(TextChunker.Chunk("T", text).Count <= TextChunker.MaxChunksPerPage);
        }
    }

    public class RobotsAndSitemapTests
    {
        [Fact]
        public void Robots_longest_match_and_wildcards()
        {
            var robots = RobotsTxt.Parse(@"
User-agent: *
Disallow: /intern/
Disallow: /*.pdf$
Allow: /intern/oeffentlich/
Sitemap: https://x.de/sitemap.xml");

            Assert.False(robots.IsAllowed("/intern/geheim"));
            Assert.True(robots.IsAllowed("/intern/oeffentlich/seite"));
            Assert.False(robots.IsAllowed("/download/a.pdf"));
            Assert.True(robots.IsAllowed("/download/a.pdf.html"));
            Assert.True(robots.IsAllowed("/produkte"));
            Assert.Equal(new[] { "https://x.de/sitemap.xml" }, robots.Sitemaps);
        }

        [Fact]
        public void Robots_disallow_everything_and_our_bot_group()
        {
            Assert.False(RobotsTxt.Parse("User-agent: *\nDisallow: /").IsAllowed("/seite"));

            var specific = RobotsTxt.Parse("User-agent: *\nDisallow: /\n\nUser-agent: EyEricResearchBot\nDisallow: /privat");
            Assert.True(specific.IsAllowed("/seite"));
            Assert.False(specific.IsAllowed("/privat/x"));
        }

        [Fact]
        public void Empty_or_missing_robots_allows_everything()
        {
            Assert.True(RobotsTxt.Parse(null).IsAllowed("/x"));
            Assert.True(RobotsTxt.Parse("User-agent: *\nDisallow:").IsAllowed("/x"));
        }

        [Fact]
        public void Sitemap_and_index_are_parsed()
        {
            var urlset = SitemapParser.Parse(@"<?xml version=""1.0""?><urlset xmlns=""http://www.sitemaps.org/schemas/sitemap/0.9""><url><loc>https://x.de/a</loc></url><url><loc> https://x.de/b </loc></url></urlset>");
            Assert.Equal(new[] { "https://x.de/a", "https://x.de/b" }, urlset.PageUrls);

            var index = SitemapParser.Parse(@"<sitemapindex xmlns=""http://www.sitemaps.org/schemas/sitemap/0.9""><sitemap><loc>https://x.de/s1.xml</loc></sitemap></sitemapindex>");
            Assert.Empty(index.PageUrls);
            Assert.Equal(new[] { "https://x.de/s1.xml" }, index.ChildSitemaps);
        }

        [Fact]
        public void Sitemap_rejects_xxe_and_survives_garbage()
        {
            var xxe = SitemapParser.Parse(@"<?xml version=""1.0""?><!DOCTYPE foo [<!ENTITY x SYSTEM ""file:///etc/passwd"">]><urlset><url><loc>&x;</loc></url></urlset>");
            Assert.Empty(xxe.PageUrls);

            Assert.Empty(SitemapParser.Parse("not xml at all <<<").PageUrls);
            Assert.Empty(SitemapParser.Parse(null).PageUrls);
        }
    }

    public class CrawlUrlRulesTests
    {
        [Theory]
        [InlineData("https://www.profi-ag.de/produkte?utm_source=x#top", "https://www.profi-ag.de/produkte")]
        [InlineData("https://profi-ag.de/leistungen/", "https://profi-ag.de/leistungen")]
        public void Accepts_same_site_pages(string url, string expected)
        {
            Assert.Equal(expected, CrawlUrlRules.NormalizeCandidate(url, "www.profi-ag.de"));
        }

        [Theory]
        [InlineData("https://other.com/produkte")]
        [InlineData("https://www.profi-ag.de/files/katalog.pdf")]
        [InlineData("https://www.profi-ag.de/bild.jpg")]
        [InlineData("https://www.profi-ag.de/datenschutz")]
        [InlineData("https://www.profi-ag.de/wp-admin/x")]
        [InlineData("http://127.0.0.1/x")]
        [InlineData("mailto:info@profi-ag.de")]
        public void Rejects_offsite_nonhtml_and_noise(string url)
        {
            Assert.Null(CrawlUrlRules.NormalizeCandidate(url, "www.profi-ag.de"));
        }

        [Fact]
        public void Scores_valuable_pages_higher_and_penalises_other_languages_on_german_sites()
        {
            var home = CrawlUrlRules.Score("https://x.de", "de");
            var product = CrawlUrlRules.Score("https://x.de/produkte", "de");
            var deep = CrawlUrlRules.Score("https://x.de/a/b/c/d", "de");
            var english = CrawlUrlRules.Score("https://x.de/en/produkte", "de");

            Assert.True(home > product);
            Assert.True(product > deep);
            Assert.True(product > english);
            Assert.True(CrawlUrlRules.Score("https://x.de/en/produkte", "en") > english);
        }
    }

    public class ReadinessTests
    {
        private static PageEvidence P(string url, int len, params string[] cats) =>
            new(url, cats.ToHashSet(), len);

        [Fact]
        public void Classifies_pages_by_url_title_and_content()
        {
            var home = PageClassifier.Classify("https://x.de/", "Start", new string('a', 500));
            Assert.Contains(KnowledgeCategories.Identity, home);
            Assert.Contains(KnowledgeCategories.Description, home);

            Assert.Contains(KnowledgeCategories.Products, PageClassifier.Classify("https://x.de/produkte/power", "IBM", "t"));
            Assert.Contains(KnowledgeCategories.Documentation, PageClassifier.Classify("https://x.de/support/handbuch", "Handbuch", "t"));
            Assert.Contains(KnowledgeCategories.CaseStudies, PageClassifier.Classify("https://x.de/referenzen", "Kunden", "t"));
            Assert.Contains(KnowledgeCategories.Contact, PageClassifier.Classify("https://x.de/kontakt", "Kontakt", "t"));
            Assert.Contains(KnowledgeCategories.Contact, PageClassifier.Classify("https://x.de/team", "Team", "Mail info@x.de Tel +49 711 1234567"));
        }

        [Fact]
        public void No_pages_means_zero_score_and_blocked_gates()
        {
            var result = ReadinessEvaluator.Evaluate(Array.Empty<PageEvidence>());

            Assert.Equal(0, result.Score);
            Assert.Equal("no_content", result.Recommendations.Single().Code);
            Assert.All(new[] { "article", "whitepaper", "webinar", "tutorial" }, g => Assert.Equal("blocked", result.Gates[g].State));
        }

        [Fact]
        public void Complete_knowledge_scores_100_and_all_gates_open()
        {
            var pages = new[]
            {
                P("/", 900, "identity", "description"),
                P("/p1", 600, "products"), P("/p2", 600, "products"),
                P("/d1", 600, "documentation"), P("/d2", 600, "documentation"),
                P("/t1", 600, "technical"), P("/t2", 600, "technical"),
                P("/c", 600, "case_studies"), P("/b", 600, "existing_content"),
                P("/k", 300, "contact"), P("/m", 600, "market"),
            };

            var result = ReadinessEvaluator.Evaluate(pages);

            Assert.Equal(100, result.Score);
            Assert.Empty(result.Recommendations);
            Assert.All(new[] { "article", "whitepaper", "webinar", "tutorial" }, g => Assert.Equal("ready", result.Gates[g].State));
        }

        [Fact]
        public void Homepage_only_warns_for_article_and_blocks_the_tutorial()
        {
            var result = ReadinessEvaluator.Evaluate(new[] { P("/", 900, "identity", "description") });

            Assert.Equal(25, result.Score);
            Assert.Equal("warn", result.Gates["article"].State);
            Assert.Equal("blocked", result.Gates["whitepaper"].State);
            Assert.Equal("blocked", result.Gates["tutorial"].State);
            Assert.Contains("tutorial_needs_documentation", result.Gates["tutorial"].Reasons);
            Assert.Contains(result.Recommendations, r => r.Code == "add_documentation");
            Assert.Contains(result.Recommendations, r => r.Code == "add_products");
        }

        [Fact]
        public void Thin_pages_do_not_count_as_evidence()
        {
            var result = ReadinessEvaluator.Evaluate(new[] { P("/p", 50, "products"), P("/q", 120, "documentation") });
            Assert.Equal(0, result.Score);
        }

        [Fact]
        public void Partial_evidence_gives_partial_status_and_more_recommendation()
        {
            var result = ReadinessEvaluator.Evaluate(new[] { P("/p1", 500, "products") });
            var products = result.Categories.Single(c => c.Key == "products");

            Assert.Equal("partial", products.Status);
            Assert.Equal(1, products.Evidence);
            Assert.Contains(result.Recommendations, r => r.Code == "more_products");
        }

        [Fact]
        public void Products_found_by_the_ai_count_as_product_evidence()
        {
            var result = ReadinessEvaluator.Evaluate(new[] { P("/", 900, "identity", "description") }, productsFoundByAi: 3);
            Assert.Equal("ok", result.Categories.Single(c => c.Key == "products").Status);
        }

        [Fact]
        public void Weights_add_up_to_100()
        {
            var result = ReadinessEvaluator.Evaluate(Array.Empty<PageEvidence>());
            Assert.Equal(100, result.Categories.Sum(c => c.Weight));
        }
    }

    public class VectorMathTests
    {
        [Fact]
        public void Cosine_similarity_behaves()
        {
            Assert.Equal(1.0, VectorMath.Cosine(new[] { 1.0, 2, 3 }, new[] { 2.0, 4, 6 }), 6);
            Assert.Equal(0.0, VectorMath.Cosine(new[] { 1.0, 0 }, new[] { 0.0, 1 }), 6);
            Assert.Equal(-1.0, VectorMath.Cosine(new[] { 1.0, 0 }, new[] { -1.0, 0 }), 6);
            Assert.Equal(0.0, VectorMath.Cosine(new[] { 0.0, 0 }, new[] { 1.0, 1 }));
            Assert.Equal(0.0, VectorMath.Cosine(new[] { 1.0 }, new[] { 1.0, 2 })); // size mismatch
        }
    }

    public class DiverseSelectionTests
    {
        private static IEnumerable<string> Urls(string prefix, int count) =>
            Enumerable.Range(1, count).Select(i => $"https://x.de/{prefix}{i}");

        [Fact]
        public void Every_category_is_represented_even_when_one_dominates()
        {
            var urls = Urls("produkte/p", 200)
                .Concat(new[] { "https://x.de/kontakt", "https://x.de/impressum", "https://x.de/referenzen",
                                "https://x.de/support/handbuch", "https://x.de/ueber-uns", "https://x.de/branchen/industrie",
                                "https://x.de/blog/neuigkeiten" });

            var picked = CrawlUrlRules.SelectDiverse(urls, 12, "de");

            Assert.Equal(12, picked.Count);
            Assert.Contains("https://x.de/kontakt", picked);
            Assert.Contains("https://x.de/referenzen", picked);
            Assert.Contains("https://x.de/support/handbuch", picked);
            Assert.Contains("https://x.de/ueber-uns", picked);
            Assert.Contains("https://x.de/branchen/industrie", picked);
            Assert.Contains("https://x.de/blog/neuigkeiten", picked);
        }

        [Fact]
        public void Respects_the_budget_and_never_duplicates()
        {
            var urls = Urls("produkte/p", 50).Concat(Urls("produkte/p", 50));
            var picked = CrawlUrlRules.SelectDiverse(urls, 10, "de");

            Assert.Equal(10, picked.Count);
            Assert.Equal(picked.Count, picked.Distinct().Count());
        }

        [Fact]
        public void Skips_irrelevant_pages_and_other_language_copies_on_german_sites()
        {
            var picked = CrawlUrlRules.SelectDiverse(new[]
            {
                "https://x.de/zufaellige-seite-ohne-bezug", "https://x.de/en/produkte", "https://x.de/produkte"
            }, 10, "de");

            Assert.DoesNotContain("https://x.de/zufaellige-seite-ohne-bezug", picked);
            Assert.Equal("https://x.de/produkte", picked.First());
        }

        [Fact]
        public void Empty_input_gives_empty_selection()
        {
            Assert.Empty(CrawlUrlRules.SelectDiverse(Array.Empty<string>(), 5, "de"));
        }
    }

    public class ClassifierPrecisionTests
    {
        [Theory]
        [InlineData("https://x.de/ki-security-fuer-unternehmen", "Security", KnowledgeCategories.Identity, false)]
        [InlineData("https://x.de/event/karrieretag-familienunternehmen", "Karriere", KnowledgeCategories.Identity, false)]
        [InlineData("https://x.de/profi-cloud-factory_kundenworkshop", "Workshop", KnowledgeCategories.CaseStudies, false)]
        [InlineData("https://x.de/kapital-markt", "Kapital", KnowledgeCategories.Documentation, false)]
        [InlineData("https://x.de/unternehmen", "Das Unternehmen", KnowledgeCategories.Identity, true)]
        [InlineData("https://x.de/ueber-uns/team", "Team", KnowledgeCategories.Description, true)]
        [InlineData("https://x.de/kunden", "Kunden", KnowledgeCategories.CaseStudies, true)]
        [InlineData("https://x.de/faq-items/wie-geht-das", "FAQ", KnowledgeCategories.Documentation, true)]
        [InlineData("https://x.de/api/v1", "API", KnowledgeCategories.Documentation, true)]
        [InlineData("https://x.de/branchen/industrie", "Branchen", KnowledgeCategories.Market, true)]
        public void Matches_whole_words_only(string url, string title, string category, bool expected)
        {
            Assert.Equal(expected, PageClassifier.Classify(url, title, "kurz").Contains(category));
        }

        [Fact]
        public void Umlauts_are_normalised()
        {
            Assert.Contains(KnowledgeCategories.Products, PageClassifier.Classify("https://x.de/lösungen", "Lösungen", "t"));
            Assert.Contains(KnowledgeCategories.Identity, PageClassifier.Classify("https://x.de/über-uns", "Über uns", "t"));
        }

        [Theory]
        [InlineData("https://www.profi-ag.de/danke-seite-3-kontakt-bestaetigung")]
        [InlineData("https://www.profi-ag.de/kontaktformular_sccon_30-09-2025")]
        [InlineData("https://www.profi-ag.de/ibm-storage-kunden_terminanfrage")]
        public void Form_and_thank_you_pages_are_not_crawled(string url)
        {
            Assert.Null(CrawlUrlRules.NormalizeCandidate(url, "www.profi-ag.de"));
        }

        [Fact]
        public void Other_language_copies_are_excluded_on_german_sites_but_kept_otherwise()
        {
            var urls = new[] { "https://x.de/en/referenzen", "https://x.de/referenzen" };

            Assert.Equal(new[] { "https://x.de/referenzen" }, CrawlUrlRules.SelectDiverse(urls, 5, "de-de"));
            Assert.Equal(2, CrawlUrlRules.SelectDiverse(urls, 5, "en").Count);
        }

        [Fact]
        public void One_abundant_category_cannot_take_the_whole_budget()
        {
            var faq = Enumerable.Range(1, 60).Select(i => $"https://x.de/faq-items/frage-{i}");
            var other = new[] { "https://x.de/kontakt", "https://x.de/referenzen", "https://x.de/produkte", "https://x.de/ueber-uns" };

            var picked = CrawlUrlRules.SelectDiverse(faq.Concat(other), 12, "de");

            Assert.Contains("https://x.de/kontakt", picked);
            Assert.Contains("https://x.de/referenzen", picked);
            Assert.Contains("https://x.de/produkte", picked);
            Assert.Contains("https://x.de/ueber-uns", picked);
        }
    }
}
