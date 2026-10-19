using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.Controllers
{
    [ApiController]
    [Route("api/ai/audit")]
    [Authorize(Policy = "AdminOnly")]
    public class AiAuditController : AiControllerBase
    {
        private readonly AiAuditService _audit;

        public AiAuditController(AiAuditService audit)
        {
            _audit = audit;
        }

        [HttpGet]
        public async Task<IActionResult> List(
            [FromQuery] string? providerId = null,
            [FromQuery] int limit = 100,
            CancellationToken cancellationToken = default)
        {
            return Ok(await _audit.ListAsync(providerId, Math.Clamp(limit, 1, 300), cancellationToken));
        }
    }
}
