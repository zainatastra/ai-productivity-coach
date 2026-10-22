namespace AiProductivityCoach.Api.AiPublishing.Knowledge
{
    public static class VectorMath
    {
        /// <summary>Cosine similarity of two vectors (works for normalised and raw vectors).</summary>
        public static double Cosine(IReadOnlyList<double> a, IReadOnlyList<double> b)
        {
            if (a.Count == 0 || a.Count != b.Count) return 0;

            double dot = 0, na = 0, nb = 0;

            for (var i = 0; i < a.Count; i++)
            {
                dot += a[i] * b[i];
                na += a[i] * a[i];
                nb += b[i] * b[i];
            }

            return na == 0 || nb == 0 ? 0 : dot / (Math.Sqrt(na) * Math.Sqrt(nb));
        }
    }
}
