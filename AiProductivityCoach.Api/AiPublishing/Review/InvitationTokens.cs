using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace AiProductivityCoach.Api.AiPublishing.Review
{
    /// <summary>
    /// Invitation links carry a random 256-bit token. Only its SHA-256 hash is stored, so a copy of
    /// the database can never be used to accept an invitation.
    /// </summary>
    public static class InvitationTokens
    {
        public const int TokenBytes = 32;
        public static readonly TimeSpan Lifetime = TimeSpan.FromDays(14);

        private static readonly Regex Email = new(@"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$", RegexOptions.Compiled);

        public static string Generate() => Base64Url(RandomNumberGenerator.GetBytes(TokenBytes));

        public static string Hash(string token) =>
            Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();

        /// <summary>Cheap shape check before any database lookup.</summary>
        public static bool LooksValid(string? token) =>
            !string.IsNullOrWhiteSpace(token) && token.Length is >= 40 and <= 64 && token.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_');

        public static string? NormalizeEmail(string? email)
        {
            var value = email?.Trim().ToLowerInvariant();
            return value is { Length: > 0 and <= 200 } && Email.IsMatch(value) ? value : null;
        }

        /// <summary>At least 10 characters with a letter and a digit.</summary>
        public static bool IsAcceptablePassword(string? password) =>
            !string.IsNullOrEmpty(password) && password.Length is >= 10 and <= 128 &&
            password.Any(char.IsLetter) && password.Any(char.IsDigit);

        private static string Base64Url(byte[] bytes) =>
            Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }
}
