using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace AiProductivityCoach.Api.AiPublishing.Services
{
    public static class SlugHelper
    {
        public static string Create(string value)
        {
            var decomposed = (value ?? string.Empty).Normalize(NormalizationForm.FormD);
            var builder = new StringBuilder();

            foreach (var ch in decomposed)
            {
                if (CharUnicodeInfo.GetUnicodeCategory(ch) != UnicodeCategory.NonSpacingMark)
                    builder.Append(ch);
            }

            var text = builder.ToString().Normalize(NormalizationForm.FormC).ToLowerInvariant();
            text = text.Replace("ß", "ss");
            var slug = Regex.Replace(text, @"[^a-z0-9]+", "-").Trim('-');

            return slug.Length > 80 ? slug[..80].Trim('-') : slug;
        }
    }
}
