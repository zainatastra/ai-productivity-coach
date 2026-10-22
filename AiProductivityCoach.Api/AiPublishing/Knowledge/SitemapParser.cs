using System.Xml;

namespace AiProductivityCoach.Api.AiPublishing.Knowledge
{
    public static class SitemapParser
    {
        public sealed record Result(List<string> PageUrls, List<string> ChildSitemaps);

        /// <summary>Parses a sitemap or sitemap index. DTDs are prohibited (no XXE).</summary>
        public static Result Parse(string? xml, int maxEntries = 5000)
        {
            var pages = new List<string>();
            var children = new List<string>();

            if (string.IsNullOrWhiteSpace(xml)) return new Result(pages, children);

            try
            {
                var settings = new XmlReaderSettings
                {
                    DtdProcessing = DtdProcessing.Prohibit,
                    XmlResolver = null,
                    IgnoreComments = true,
                    MaxCharactersFromEntities = 0
                };

                using var reader = XmlReader.Create(new StringReader(xml), settings);

                var inSitemapEntry = false;

                while (reader.Read() && pages.Count + children.Count < maxEntries)
                {
                    if (reader.NodeType == XmlNodeType.Element)
                    {
                        if (reader.LocalName == "sitemap") inSitemapEntry = true;
                        else if (reader.LocalName == "url") inSitemapEntry = false;
                        else if (reader.LocalName == "loc")
                        {
                            var loc = reader.ReadElementContentAsString().Trim();
                            if (loc.Length == 0) continue;

                            if (inSitemapEntry) children.Add(loc);
                            else pages.Add(loc);
                        }
                    }
                }
            }
            catch (XmlException)
            {
                // Malformed sitemap: return what was read so far.
            }

            return new Result(pages, children);
        }
    }
}
