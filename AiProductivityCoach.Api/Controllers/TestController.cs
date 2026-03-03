using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using FirebaseAdmin.Auth;
using System.Security.Claims;

namespace AiProductivityCoach.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize] // 🔐 All endpoints require authentication
    public class TestController : ControllerBase
    {
        // ✅ Endpoint accessible to ANY authenticated user
        [HttpGet("me")]
        public IActionResult GetCurrentUser()
        {
            var uid = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var role = User.FindFirst(ClaimTypes.Role)?.Value ?? "user";

            return Ok(new
            {
                message = "Authenticated successfully",
                uid,
                role
            });
        }

        // ✅ Endpoint accessible to ADMIN only
        [HttpGet("admin-users")]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> GetAllUsers()
        {
            var auth = FirebaseAuth.DefaultInstance;
            var usersList = new List<object>();

            var pagedUsers = auth.ListUsersAsync(null);

            await foreach (var user in pagedUsers)
            {
                usersList.Add(new
                {
                    user.Uid,
                    user.Email
                });
            }

            return Ok(usersList);
        }
    }
}