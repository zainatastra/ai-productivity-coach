using Microsoft.AspNetCore.Mvc;
using AiProductivityCoach.Api.AiPublishing.Security;

namespace AiProductivityCoach.Api.Controllers
{
    /// <summary>Shared helpers for the AI Publishing Engine controllers.</summary>
    public abstract class AiControllerBase : ControllerBase
    {
        /// <summary>
        /// Trusted caller identity. Comes only from the verified Firebase token;
        /// request bodies can never supply a role, platform or company.
        /// </summary>
        protected TenantContext? Actor => TenantContext.From(User);

        protected IActionResult Error(int status, string code, string message) =>
            StatusCode(status, new { code, message });
    }
}
