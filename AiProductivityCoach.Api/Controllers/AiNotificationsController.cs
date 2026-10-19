using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AiProductivityCoach.Api.AiPublishing.Services;

namespace AiProductivityCoach.Api.Controllers
{
    [ApiController]
    [Route("api/ai/notifications")]
    [Authorize(Policy = "AdminOnly")]
    public class AiNotificationsController : AiControllerBase
    {
        private readonly AiNotificationService _notifications;
        private readonly AiAuditService _audit;

        public AiNotificationsController(AiNotificationService notifications, AiAuditService audit)
        {
            _notifications = notifications;
            _audit = audit;
        }

        public class MarkReadDto
        {
            /// <summary>Notification ids to mark read; empty/null marks all.</summary>
            public List<string>? Ids { get; set; }
        }

        [HttpGet]
        public async Task<IActionResult> List([FromQuery] bool unreadOnly = false, [FromQuery] int limit = 30)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            var (items, unread) = await _notifications.ListForAdminAsync(
                actor.UserId, unreadOnly, Math.Clamp(limit, 1, 100));

            return Ok(new { items, unread });
        }

        [HttpPost("read")]
        public async Task<IActionResult> MarkRead([FromBody] MarkReadDto? request)
        {
            var actor = Actor;
            if (actor == null || !actor.IsAdmin) return Unauthorized();

            await _notifications.MarkReadAsync(actor.UserId, request?.Ids);
            return NoContent();
        }
    }
}
