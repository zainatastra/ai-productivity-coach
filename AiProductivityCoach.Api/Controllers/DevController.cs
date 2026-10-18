using Microsoft.AspNetCore.Mvc;
using FirebaseAdmin.Auth;
using Microsoft.AspNetCore.Authorization;

namespace AiProductivityCoach.Api.Controllers
{
    [ApiController]
    [Route("api/dev")]
    [Authorize(Policy = "AdminOnly")]
    public class DevController : ControllerBase
    {
        [HttpPost("make-admin/{uid}")]
        public async Task<IActionResult> MakeAdmin(string uid)
        {
            await FirebaseAuth.DefaultInstance.SetCustomUserClaimsAsync(
                uid,
                new Dictionary<string, object>
                {
                    { "role", "admin" }
                });

            return Ok("Admin claim set successfully");
        }
    }
}