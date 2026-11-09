using Google.Cloud.Firestore;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AiProductivityCoach.Api.AiPublishing.Content;
using AiProductivityCoach.Api.AiPublishing.Domain;
using AiProductivityCoach.Api.AiPublishing.Media;
using AiProductivityCoach.Api.AiPublishing.Profile;
using AiProductivityCoach.Api.AiPublishing.Review;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.Controllers
{
    /// <summary>
    /// Admin side of the Phase 2 provider profile builder (spec sections 4-8): the editable "About"
    /// fields on top of the AI research, the logo (caught from the website or set manually), the
    /// AI-generated header/banner, and the private "preview with link". Company-facing publishing
    /// (EY ERIC/MIDRANGE send & approval) is a later phase; nothing here makes a profile public.
    /// </summary>
    [ApiController]
    [Route("api/ai/providers/{providerId}/profile")]
    [Authorize(Policy = "AdminOnly")]
    public class AiProfileController : AiControllerBase
    {
        private readonly FirestoreDb _firestore;
        private readonly ProfileMediaService _media;
        private readonly ProfilePreviewService _preview;
        private readonly InvitationMailer _mailer;
        private readonly AiAuditService _audit;

        public AiProfileController(
            FirestoreDb firestore,
            ProfileMediaService media,
            ProfilePreviewService preview,
            InvitationMailer mailer,
            AiAuditService audit)
        {
            _firestore = firestore;
            _media = media;
            _preview = preview;
            _mailer = mailer;
            _audit = audit;
        }

        public class ProfileFieldsDto
        {
            public string? ShortDescription { get; set; }
            public string? Headline { get; set; }
            public string? Overview { get; set; }
            public string? Headquarters { get; set; }
            public string? FoundedYear { get; set; }
            public string? EmployeeRange { get; set; }
            public List<string>? Specialties { get; set; }
            public List<string>? Categories { get; set; }
            public string? Email { get; set; }
            public string? Phone { get; set; }
            public string? Address { get; set; }
        }

        public class LogoDto { public string? Url { get; set; } }

        private async Task<DocumentSnapshot?> GetProviderAsync(string providerId)
        {
            var doc = await _firestore.Collection(AiCollections.Providers).Document(providerId).GetSnapshotAsync();
            return doc.Exists ? doc : null;
        }

        private static IActionResult NotFoundResult() => new NotFoundObjectResult(new { code = "provider_not_found", message = "Provider not found." });

        // ───────────── profile fields ─────────────

        [HttpGet]
        public async Task<IActionResult> Get(string providerId)
        {
            var doc = await GetProviderAsync(providerId);
            if (doc == null) return NotFoundResult();

            var data = doc.ToDictionary();

            return Ok(new
            {
                ai = ToJson(ProfileFieldsMapper.FromAi(data)),
                overrides = ToJson(ProfileFieldsMapper.FromOverrides(data)),
                effective = ToJson(ProfileFieldsMapper.Effective(data)),
                hasResearch = data.ContainsKey("knowledgeProfile"),
                logo = new
                {
                    url = FirestoreApi.GetString(data, "logoUrl"),
                    source = FirestoreApi.GetString(data, "logoSource"),
                    candidates = Candidates(data)
                },
                header = new
                {
                    url = FirestoreApi.GetString(data, "headerImageUrl"),
                    model = FirestoreApi.GetString(data, "headerModel")
                },
                headerConfigured = _media.HeaderGenerationConfigured,
                logoStorageConfigured = _media.LogoStorageConfigured
            });
        }

        [HttpPut]
        public async Task<IActionResult> Save(string providerId, [FromBody] ProfileFieldsDto? request)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var doc = await GetProviderAsync(providerId);
            if (doc == null) return NotFoundResult();
            if (request == null) return Error(400, "invalid_profile", "The profile is missing.");

            List<string> Lines(List<string>? list, int max, int length) =>
                (list ?? new List<string>()).Select(x => DocumentParser.Clean(x, length)).Where(x => x.Length > 0).Take(max).ToList();

            var fields = new ProfileFields(
                DocumentParser.Clean(request.ShortDescription, 200),
                DocumentParser.Clean(request.Headline, 180),
                DocumentParser.Clean(request.Overview, 4000),
                DocumentParser.Clean(request.Headquarters, 200),
                CleanYear(request.FoundedYear),
                DocumentParser.Clean(request.EmployeeRange, 80),
                Lines(request.Specialties, 20, 80),
                Lines(request.Categories, 10, 80),
                DocumentParser.Clean(request.Email, 254).ToLowerInvariant(),
                DocumentParser.Clean(request.Phone, 50),
                DocumentParser.Clean(request.Address, 300));

            await doc.Reference.UpdateAsync(new Dictionary<string, object>
            {
                ["profileEdits"] = ProfileFieldsMapper.ToOverrideMap(fields),
                ["updatedAt"] = Timestamp.GetCurrentTimestamp()
            });

            await _audit.LogAsync(actor, AuditActions.ProviderProfileEdited, providerId);

            var updated = (await doc.Reference.GetSnapshotAsync()).ToDictionary();
            return Ok(ToJson(ProfileFieldsMapper.Effective(updated)));
        }

        private static string CleanYear(string? value)
        {
            var digits = new string((value ?? string.Empty).Where(char.IsDigit).ToArray());
            return digits.Length == 4 && int.TryParse(digits, out var year) && year is >= 1600 and <= 2100
                ? digits
                : string.Empty;
        }

        // ───────────── logo ─────────────

        [HttpPost("logo/refresh")]
        public async Task<IActionResult> RefreshLogo(string providerId, CancellationToken ct)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var doc = await GetProviderAsync(providerId);
            if (doc == null) return NotFoundResult();

            var website = FirestoreApi.GetString(doc.ToDictionary(), "website");
            if (website.Length == 0) return Error(400, "no_website", "This provider has no website set.");

            var result = await _media.DiscoverAsync(providerId, website, ct);

            await _audit.LogAsync(actor, AuditActions.ProviderLogoCandidatesRefreshed, providerId, null, null,
                new Dictionary<string, object> { ["candidates"] = result.Candidates.Count });

            return Ok(new { url = result.Url, source = result.Source, candidates = result.Candidates.Select(c => new { c.Url, c.Kind }) });
        }

        [HttpPut("logo")]
        public async Task<IActionResult> SetLogo(string providerId, [FromBody] LogoDto? request, CancellationToken ct)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var url = request?.Url?.Trim() ?? string.Empty;
            if (url.Length == 0) return Error(400, "logo_url_required", "Please provide an image address.");

            return await Guard(async () =>
            {
                var result = await _media.ApplyAsync(providerId, url, LogoSource.Manual, ct);

                await _audit.LogAsync(actor, AuditActions.ProviderLogoSelected, providerId, null, null,
                    new Dictionary<string, object> { ["source"] = LogoSource.Manual });

                return Ok(new { url = result.Url, source = result.Source });
            });
        }

        [HttpPut("logo/candidates/{index:int}")]
        public async Task<IActionResult> PickLogoCandidate(string providerId, int index, CancellationToken ct)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var doc = await GetProviderAsync(providerId);
            if (doc == null) return NotFoundResult();

            var candidates = Candidates(doc.ToDictionary());
            if (index < 0 || index >= candidates.Count) return Error(404, "candidate_not_found", "Candidate not found.");

            return await Guard(async () =>
            {
                var result = await _media.ApplyAsync(providerId, candidates[index].Url, LogoSource.Website, ct);

                await _audit.LogAsync(actor, AuditActions.ProviderLogoSelected, providerId, null, null,
                    new Dictionary<string, object> { ["source"] = LogoSource.Website, ["kind"] = candidates[index].Kind });

                return Ok(new { url = result.Url, source = result.Source });
            });
        }

        [HttpDelete("logo")]
        public async Task<IActionResult> RemoveLogo(string providerId, CancellationToken ct)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            await _media.RemoveAsync(providerId, ct);
            await _audit.LogAsync(actor, AuditActions.ProviderLogoRemoved, providerId);

            return NoContent();
        }

        // ───────────── header ─────────────

        [HttpPost("header/generate")]
        public async Task<IActionResult> GenerateHeader(string providerId, CancellationToken ct)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            return await Guard(async () =>
            {
                var result = await _media.GenerateHeaderAsync(providerId, null, ct);

                await _audit.LogAsync(actor, AuditActions.ProviderHeaderGenerated, providerId, null, null,
                    new Dictionary<string, object> { ["model"] = result.Model });

                return Ok(new { url = result.Url, prompt = result.Prompt, model = result.Model });
            });
        }

        [HttpDelete("header")]
        public async Task<IActionResult> RemoveHeader(string providerId, CancellationToken ct)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            await _media.RemoveHeaderAsync(providerId, ct);
            await _audit.LogAsync(actor, AuditActions.ProviderHeaderRemoved, providerId);

            return NoContent();
        }

        // ───────────── preview link ─────────────

        [HttpGet("preview-link")]
        public async Task<IActionResult> GetPreviewLink(string providerId)
        {
            var status = await _preview.StatusAsync(providerId);
            return Ok(new { active = status.Active, createdAt = status.CreatedAt?.ToString("O") });
        }

        [HttpPost("preview-link")]
        public async Task<IActionResult> CreatePreviewLink(string providerId)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var doc = await GetProviderAsync(providerId);
            if (doc == null) return NotFoundResult();

            var token = await _preview.CreateOrRotateAsync(providerId);
            var url = $"{_mailer.FrontendBaseUrl}/providers/preview/{Uri.EscapeDataString(token)}";

            await _audit.LogAsync(actor, AuditActions.ProviderPreviewLinkCreated, providerId);

            // The link is only ever shown here; afterwards just its hash exists.
            return StatusCode(201, new { url });
        }

        [HttpDelete("preview-link")]
        public async Task<IActionResult> RevokePreviewLink(string providerId)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            await _preview.RevokeAsync(providerId);
            await _audit.LogAsync(actor, AuditActions.ProviderPreviewLinkRevoked, providerId);

            return NoContent();
        }

        // ───────────── helpers ─────────────

        private static List<LogoCandidate> Candidates(IDictionary<string, object> data) =>
            data.TryGetValue("logoCandidates", out var raw) && raw is IEnumerable<object> list
                ? list.OfType<IDictionary<string, object>>()
                    .Select(c => new LogoCandidate(FirestoreApi.GetString(c, "url"), FirestoreApi.GetString(c, "kind"), 0))
                    .ToList()
                : new List<LogoCandidate>();

        private static object ToJson(ProfileFields f) => new
        {
            shortDescription = f.ShortDescription,
            headline = f.Headline,
            overview = f.Overview,
            headquarters = f.Headquarters,
            foundedYear = f.FoundedYear,
            employeeRange = f.EmployeeRange,
            specialties = f.Specialties,
            categories = f.Categories,
            email = f.Email,
            phone = f.Phone,
            address = f.Address
        };

        private async Task<IActionResult> Guard(Func<Task<IActionResult>> action)
        {
            try
            {
                return await action();
            }
            catch (ImageGenerationException ex)
            {
                var status = ex.Code switch
                {
                    "provider_not_found" => 404,
                    "invalid_logo_url" or "invalid_logo_format" or "logo_fetch_failed" => 400,
                    "storage_not_configured" or "image_not_configured" => 503,
                    _ => 502
                };

                return Error(status, ex.Code, ex.Message);
            }
        }
    }
}
