using System.Net;
using AiProductivityCoach.Api.AiPublishing.Security;
using AiProductivityCoach.Api.AiPublishing.Services;
using Xunit;

namespace AiProductivityCoach.Api.Tests
{
    public class UrlSafetyTests
    {
        [Theory]
        [InlineData("https://www.profi-ag.de/", "https://www.profi-ag.de")]
        [InlineData("www.profi-ag.de", "https://www.profi-ag.de")]
        [InlineData("HTTPS://WWW.Profi-AG.de/Produkte/", "https://www.profi-ag.de/Produkte")]
        [InlineData("https://example.com/a?b=1#frag", "https://example.com/a?b=1")]
        public void Normalizes_public_urls(string input, string expected)
        {
            var result = UrlSafety.Normalize(input);
            Assert.True(result.Ok);
            Assert.Equal(expected, result.Normalized);
        }

        [Theory]
        [InlineData("", "url_required")]
        [InlineData("ftp://example.com", "url_scheme")]
        [InlineData("file:///etc/passwd", "url_scheme")]
        [InlineData("https://user:pw@example.com", "url_credentials")]
        [InlineData("https://example.com:8443", "url_port")]
        [InlineData("http://127.0.0.1", "url_ip_not_allowed")]
        [InlineData("http://169.254.169.254/latest/meta-data", "url_ip_not_allowed")]
        [InlineData("http://2130706433", "url_ip_not_allowed")]
        [InlineData("http://[::1]/", "url_ip_not_allowed")]
        [InlineData("http://localhost", "url_host")]
        [InlineData("http://intranet.local", "url_host_blocked")]
        [InlineData("http://service.internal", "url_host_blocked")]
        public void Rejects_unsafe_urls(string input, string error)
        {
            var result = UrlSafety.Normalize(input);
            Assert.False(result.Ok);
            Assert.Equal(error, result.Error);
        }

        [Theory]
        [InlineData("8.8.8.8", true)]
        [InlineData("93.184.216.34", true)]
        [InlineData("2606:4700:4700::1111", true)]
        [InlineData("127.0.0.1", false)]
        [InlineData("10.1.2.3", false)]
        [InlineData("172.16.0.1", false)]
        [InlineData("172.32.0.1", true)]
        [InlineData("192.168.1.1", false)]
        [InlineData("169.254.169.254", false)]
        [InlineData("100.64.0.1", false)]
        [InlineData("0.0.0.0", false)]
        [InlineData("224.0.0.1", false)]
        [InlineData("::1", false)]
        [InlineData("fe80::1", false)]
        [InlineData("fc00::1", false)]
        [InlineData("::ffff:127.0.0.1", false)]
        [InlineData("::ffff:10.0.0.1", false)]
        public void Classifies_addresses(string ip, bool isPublic)
        {
            Assert.Equal(isPublic, UrlSafety.IsPublicAddress(IPAddress.Parse(ip)));
        }

        [Theory]
        [InlineData("PROFI Engineering Systems AG", "profi-engineering-systems-ag")]
        [InlineData("Müller & Söhne GmbH", "muller-sohne-gmbh")]
        [InlineData("Straße 42", "strasse-42")]
        public void Creates_slugs(string name, string slug)
        {
            Assert.Equal(slug, SlugHelper.Create(name));
        }
    }
}
