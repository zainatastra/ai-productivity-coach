using SkiaSharp;

namespace AiProductivityCoach.Api.AiPublishing.Pdf
{
    /// <summary>
    /// Picks one accent color out of a provider's own logo, so a generated PDF carries that
    /// provider's real branding ("give the PDF a CI") without needing the admin to configure a
    /// color by hand. Background/near-white/near-black/low-saturation pixels are skipped so a
    /// logo with a white or transparent background doesn't just yield grey.
    /// </summary>
    public static class BrandColorExtractor
    {
        private const string FallbackColor = "#1F2937"; // a neutral dark slate - used whenever no usable color is found

        public static string ExtractAccentColor(byte[]? logoBytes)
        {
            if (logoBytes is not { Length: > 0 }) return FallbackColor;

            try
            {
                using var bitmap = SKBitmap.Decode(logoBytes);
                if (bitmap == null) return FallbackColor;

                var buckets = new Dictionary<(int R, int G, int B), (int Count, double Saturation)>();

                var stepX = Math.Max(1, bitmap.Width / 60);
                var stepY = Math.Max(1, bitmap.Height / 60);

                for (var y = 0; y < bitmap.Height; y += stepY)
                {
                    for (var x = 0; x < bitmap.Width; x += stepX)
                    {
                        var pixel = bitmap.GetPixel(x, y);
                        if (pixel.Alpha < 64) continue; // transparent background

                        var (_, s, v) = ToHsv(pixel.Red, pixel.Green, pixel.Blue);
                        // Low saturation alone already rules out white/grey/black backgrounds at any
                        // brightness - a vivid, fully-saturated color (e.g. pure red, v=1.0) must not
                        // be rejected just for being bright.
                        if (s < 0.18 || v < 0.12) continue;

                        var bucket = (pixel.Red / 24 * 24, pixel.Green / 24 * 24, pixel.Blue / 24 * 24);
                        var existing = buckets.GetValueOrDefault(bucket, (0, 0));
                        buckets[bucket] = (existing.Count + 1, s);
                    }
                }

                if (buckets.Count == 0) return FallbackColor;

                // Favor whichever bucket is both common and saturated - a single eye-catching
                // accent, not an average that would just wash back out to grey.
                var best = buckets.OrderByDescending(b => b.Value.Count * b.Value.Saturation).First();

                return $"#{best.Key.R:X2}{best.Key.G:X2}{best.Key.B:X2}";
            }
            catch
            {
                return FallbackColor;
            }
        }

        private static (double H, double S, double V) ToHsv(byte r, byte g, byte b)
        {
            double rd = r / 255.0, gd = g / 255.0, bd = b / 255.0;
            var max = Math.Max(rd, Math.Max(gd, bd));
            var min = Math.Min(rd, Math.Min(gd, bd));
            var delta = max - min;

            var s = max <= 0 ? 0 : delta / max;
            var v = max;
            var h = 0.0;

            if (delta > 0)
            {
                if (max == rd) h = 60 * (((gd - bd) / delta) % 6);
                else if (max == gd) h = 60 * (((bd - rd) / delta) + 2);
                else h = 60 * (((rd - gd) / delta) + 4);
            }

            return (h < 0 ? h + 360 : h, s, v);
        }
    }
}
