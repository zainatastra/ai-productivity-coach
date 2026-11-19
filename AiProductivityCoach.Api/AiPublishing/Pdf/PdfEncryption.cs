using Microsoft.Extensions.Logging;
using QuestPDF.Fluent;

namespace AiProductivityCoach.Api.AiPublishing.Pdf
{
    /// <summary>
    /// Sets the PDF's own copy/print permission flags via the qpdf engine QuestPDF bundles.
    /// These are the standard PDF-specification restrictions - advisory, not real DRM; any PDF
    /// reader's own "print to PDF" or a screenshot bypasses them. We disclose that to the user
    /// rather than claim copying can be fully prevented, per the standing default for this feature.
    /// </summary>
    public static class PdfEncryption
    {
        /// <summary>
        /// True once a restriction attempt has actually failed in this process - checked so a
        /// known environment incompatibility doesn't retry (and log) on every single PDF.
        /// </summary>
        public static bool LastAttemptFailed { get; private set; }

        public static byte[] Restrict(byte[] pdfBytes, ILogger? logger = null)
        {
            var inputPath = Path.Combine(Path.GetTempPath(), $"aipc-wp-{Guid.NewGuid():N}-in.pdf");
            var outputPath = Path.Combine(Path.GetTempPath(), $"aipc-wp-{Guid.NewGuid():N}-out.pdf");

            try
            {
                File.WriteAllBytes(inputPath, pdfBytes);

                DocumentOperation
                    .LoadFile(inputPath, "source")
                    .Encrypt(new DocumentOperation.Encryption256Bit
                    {
                        AllowContentExtraction = false,
                        AllowPrinting = false,
                        AllowAnnotation = false,
                        AllowAssembly = false,
                        AllowFillingForms = false,
                        AllowModification = false,
                        EncryptMetadata = false
                    })
                    .Save(outputPath);

                var result = File.ReadAllBytes(outputPath);
                LastAttemptFailed = false;
                return result;
            }
            catch (Exception ex)
            {
                // A known environment conflict (QuestPDF's qpdf JSON serializer vs. the
                // System.Text.Json version the Anthropic SDK forces into this project) can make
                // restriction unavailable. Copy-restriction is advisory anyway - never block
                // delivering the PDF itself over it, just ship it unrestricted and say so.
                LastAttemptFailed = true;
                logger?.LogWarning(ex, "[WhitepaperPdf] Could not apply copy-restriction; sending the PDF unrestricted.");
                return pdfBytes;
            }
            finally
            {
                TryDelete(inputPath);
                TryDelete(outputPath);
            }
        }

        private static void TryDelete(string path)
        {
            try { if (File.Exists(path)) File.Delete(path); } catch { /* best-effort cleanup */ }
        }
    }
}
