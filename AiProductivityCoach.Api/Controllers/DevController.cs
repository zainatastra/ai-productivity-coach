using Microsoft.AspNetCore.Mvc;
using FirebaseAdmin.Auth;

namespace AiProductivityCoach.Api.Controllers
{
    [ApiController]
    [Route("api/dev")]
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