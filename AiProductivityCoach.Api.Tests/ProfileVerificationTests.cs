using AiProductivityCoach.Api.AiPublishing.Jobs;
using AiProductivityCoach.Api.AiPublishing.Knowledge;
using Xunit;

namespace AiProductivityCoach.Api.Tests
{
    public class ProfileVerificationTests
    {
        private const string Excerpts =
            "[Quelle: https://x.de/]\nPROFI Engineering Systems AG betreut IBM Power Systeme und Backup-Lösungen. " +
            "Kontakt: info@profi-ag.de, Telefon +49 711 123456, Hauptstraße 5, 70173 Stuttgart.";

        [Fact]
        public void Keeps_only_facts_that_appear_in_the_sources()
        {
            var json = @"{
              ""companyDescription"": ""Die PROFI AG betreut <b>IBM Power</b> Systeme."",
              ""products"": [
                {""name"": ""IBM Power Systeme"", ""summary"": ""Betrieb von Power-Servern.""},
                {""name"": ""Quantum Wundersoftware"", ""summary"": ""Erfunden.""}
              ],
              ""topics"": [""Backup"", ""backup"", ""Modernisierung""],
              ""industries"": [],
              ""contact"": {""email"": ""info@profi-ag.de"", ""phone"": ""+49 711 123456"", ""address"": ""Hauptstraße 5, 70173 Stuttgart""},
              ""hasSoftwareProduct"": true
            }";

            var profile = ResearchJobHandler.ParseProfile(json, Excerpts, "test-model")!;

            Assert.Equal("Die PROFI AG betreut IBM Power Systeme.", profile.Description); // markup stripped
            Assert.Single(profile.Products);
            Assert.Equal("IBM Power Systeme", profile.Products[0].Name);
            Assert.Equal(new[] { "Backup", "Modernisierung" }, profile.Topics);            // duplicates removed
            Assert.Equal("info@profi-ag.de", profile.Email);
            Assert.Equal("+49 711 123456", profile.Phone);
            Assert.StartsWith("Hauptstraße 5", profile.Address);
            Assert.True(profile.HasSoftwareProduct);
        }

        [Fact]
        public void Drops_invented_contact_data()
        {
            var json = @"{""companyDescription"":""x"",""products"":[],""topics"":[],""industries"":[],
              ""contact"":{""email"":""vertrieb@erfunden.com"",""phone"":""+49 30 9999999"",""address"":""Fantasiestraße 99, 10115 Berlin""},
              ""hasSoftwareProduct"":false}";

            var profile = ResearchJobHandler.ParseProfile(json, Excerpts, "m")!;

            Assert.Equal(string.Empty, profile.Email);
            Assert.Equal(string.Empty, profile.Phone);
            Assert.Equal(string.Empty, profile.Address);
        }

        [Fact]
        public void Applies_length_and_count_limits_and_survives_wrong_types()
        {
            var many = string.Join(",", Enumerable.Range(1, 30).Select(i => $"\"Thema{i}\""));
            var json = $@"{{""companyDescription"":""{new string('a', 2000)}"",""topics"":[{many}, 5, null],""products"":""kein array"",""contact"":""kein objekt""}}";

            var profile = ResearchJobHandler.ParseProfile(json, Excerpts, "m")!;

            Assert.True(profile.Description.Length <= 600);
            Assert.Equal(12, profile.Topics.Count);
            Assert.Empty(profile.Products);
            Assert.Equal(string.Empty, profile.Email);
        }

        [Fact]
        public void Garbage_json_returns_null_instead_of_throwing()
        {
            Assert.Null(ResearchJobHandler.ParseProfile("this is not json", Excerpts, "m"));
        }
    }

    public class ProfileContextSelectionTests
    {
        private static StoredChunk C(string pageId, int index, string url, string title, double[] vector) =>
            new($"{pageId}_{index:D3}", pageId, "s1", url, title, "h", "text " + pageId, vector);

        [Fact]
        public void Product_pages_are_always_included_even_when_semantic_hits_are_elsewhere()
        {
            var chunks = new List<StoredChunk>
            {
                C("home", 0, "https://x.de/", "Start", new[] { 1.0, 0 }),
                C("prod1", 0, "https://x.de/produkte/alpha", "Alpha", new[] { 0.0, 1 }),
                C("prod2", 0, "https://x.de/produkte/beta", "Beta", new[] { 0.0, 1 }),
                C("prod2", 1, "https://x.de/produkte/beta", "Beta", new[] { 0.0, 1 }),
                C("deep", 0, "https://x.de/a/b/c/produkte", "Tief", new[] { 0.0, 1 }),
            };

            // The only query points at the homepage, far away from the product pages.
            var picked = ResearchJobHandler.SelectProfileChunks(chunks, new[] { new[] { 1.0, 0.0 } }, hitsPerQuery: 1);

            Assert.Contains(picked, c => c.Id == "prod1_000");
            Assert.Contains(picked, c => c.Id == "prod2_000");
            Assert.DoesNotContain(picked, c => c.Id == "prod2_001");   // only the first chunk of a page
            Assert.DoesNotContain(picked, c => c.Id == "deep_000");    // too deep in the site
            Assert.Equal(picked.Count, picked.Select(c => c.Id).Distinct().Count());
        }

        [Fact]
        public void Number_of_product_pages_is_capped()
        {
            var chunks = Enumerable.Range(1, 40)
                .Select(i => C($"p{i:D2}", 0, $"https://x.de/produkte/p{i:D2}", $"P{i}", new[] { 0.0, 1 }))
                .ToList();

            var picked = ResearchJobHandler.SelectProfileChunks(chunks, Array.Empty<double[]>(), maxProductPages: 14);

            Assert.Equal(14, picked.Count);
        }

        [Fact]
        public void Product_detail_pages_come_before_general_product_pages_and_essentials_come_first()
        {
            var chunks = new List<StoredChunk>
            {
                C("home", 0, "https://x.de/", "Start", new[] { 1.0, 0 }),
                C("contact", 0, "https://x.de/kontakt", "Kontakt", new[] { 1.0, 0 }),
                C("general", 0, "https://x.de/loesungen", "Lösungen", new[] { 0.0, 1 }),
                C("detail", 0, "https://x.de/produkte/alpha", "Alpha", new[] { 0.0, 1 }),
            };

            var picked = ResearchJobHandler.SelectProfileChunks(chunks, new[] { new[] { 1.0, 0.0 } }, hitsPerQuery: 2, maxProductPages: 5);
            var ids = picked.Select(c => c.Id).ToList();

            Assert.True(ids.IndexOf("contact_000") < ids.IndexOf("detail_000"));   // essentials first
            Assert.True(ids.IndexOf("detail_000") < ids.IndexOf("general_000"));   // real products before general pages
        }
    }
}
