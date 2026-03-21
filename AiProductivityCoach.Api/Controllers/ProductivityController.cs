using Microsoft.AspNetCore.Mvc;

namespace AiProductivityCoach.Api.Controllers
{
    public class ProductivityRequest
    {
        public string Industry { get; set; }
        public string Description { get; set; }
        public string Mode { get; set; }
        public string Language { get; set; }
    }

    [ApiController]
    [Route("api/[controller]")]
    public class ProductivityController : ControllerBase
    {
        [HttpPost]
        public IActionResult HandleProductivity([FromBody] ProductivityRequest request)
        {
            if (request == null)
            {
                return BadRequest(new { success = false, message = "Invalid request" });
            }

            var response = new
            {
                success = true,
                data = new
                {
                    message = $"Generated response for {request.Industry} ({request.Mode}) in {request.Language}"
                }
            };

            return Ok(response);
        }
    }
}