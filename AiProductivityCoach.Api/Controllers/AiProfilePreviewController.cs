using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AiProductivityCoach.Api.AiPublishing.Profile;
using AiProductivityCoach.Api.AiPublishing.Review;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.Controllers
{
    /// <summary>
    /// Public, unauthenticated side of the provider "preview with link" (spec section 5): resolves a
    /// secret token to a read-only snapshot of the profile. Never lists providers, never exposes an
    /// id search, and an unknown/expired/revoked token looks identical to "not found" - nothing here
    /// reveals whether a token ever existed.
    /// </summary>
    [ApiController]
    [Route("api/ai/profile-preview")]
    [AllowAnonymous]
    public class AiProfilePreviewController : AiControllerBase
    {
        private static readonly TimeSpan Window = TimeSpan.FromHours(1);

        private readonly ProfilePreviewService _preview;

        public AiProfilePreviewController(ProfilePreviewService preview)
        {
            _preview = preview;
        }

        private string Caller => AiProductivityCoach.Api.AiPublishing.Security.ClientIp.Of(HttpContext);

        [HttpGet("{token}")]
        public async Task<IActionResult> Get(string token)
        {
            if (!AttemptLimiter.Allow($"profile-preview:{Caller}", 60, Window))
                return Error(429, "too_many_attempts", "Too many attempts. Please try again later.");

            var doc = await _preview.ResolveAsync(token);
            if (doc == null) return Ok(new { valid = false });

            var data = doc.ToDictionary();
            var profile = ProfileFieldsMapper.Effective(data);
            var content = await _preview.GetContentAsync(doc.Id);

            return Ok(new
            {
                valid = true,
                name = FirestoreApi.GetString(data, "name"),
                website = FirestoreApi.GetString(data, "website"),
                language = FirestoreApi.GetString(data, "defaultLanguage", "de"),
                logoUrl = FirestoreApi.GetString(data, "logoUrl"),
                headerImageUrl = FirestoreApi.GetString(data, "headerImageUrl"),
                content = content.Select(c => new { c.Id, c.Type, c.Title, c.Excerpt, c.WordCount }),
                profile = new
                {
                    shortDescription = profile.ShortDescription,
                    headline = profile.Headline,
                    overview = profile.Overview,
                    headquarters = profile.Headquarters,
                    foundedYear = profile.FoundedYear,
                    employeeRange = profile.EmployeeRange,
                    specialties = profile.Specialties,
                    categories = profile.Categories,
                    email = profile.Email,
                    phone = profile.Phone,
                    address = profile.Address
                }
            });
        }
    }
}
