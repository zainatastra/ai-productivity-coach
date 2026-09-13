using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Google.Cloud.Firestore;
using System.Security.Claims;

namespace AiProductivityCoach.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class UserController : ControllerBase
    {
        private readonly FirestoreDb _firestore;

        // 🔥 Firestore injected via DI
        public UserController(FirestoreDb firestore)
        {
            _firestore = firestore;
        }

        // DTO to receive optional full name from frontend
        public class SyncUserDto
        {
            public string? FullName { get; set; }
        }

        // =====================================================
        // 🔥 SYNC USER (NORMAL APP USER ONLY + AUTO UPDATE NAME)
        // =====================================================
        [HttpPost("sync")]
        public async Task<IActionResult> SyncUser([FromBody] SyncUserDto? dto)
        {
            try
            {
                var uid = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                var email = User.FindFirst(ClaimTypes.Email)?.Value;

                var tokenName =
                    User.FindFirst("name")?.Value ??
                    User.FindFirst(ClaimTypes.Name)?.Value;

                if (string.IsNullOrWhiteSpace(uid))
                    return Unauthorized();

                var userDoc = _firestore.Collection("users").Document(uid);
                var snapshot = await userDoc.GetSnapshotAsync();

                string fullName = "User";

                if (!string.IsNullOrWhiteSpace(dto?.FullName))
                {
                    fullName = dto.FullName.Trim();
                }
                else if (!string.IsNullOrWhiteSpace(tokenName))
                {
                    fullName = tokenName.Trim();
                }
                else if (!string.IsNullOrWhiteSpace(email))
                {
                    fullName = email.Split('@')[0];
                }

                if (!snapshot.Exists)
                {
                    var newUser = new Dictionary<string, object>
                    {
                        { "email", email ?? "" },
                        { "fullName", fullName },
                        { "role", "user" }, // metadata only; authorization uses trusted token claims
                        { "status", "active" },
                        { "createdAt", Timestamp.GetCurrentTimestamp() }
                    };

                    await userDoc.SetAsync(newUser);
                }
                else
                {
                    var existingData = snapshot.ToDictionary();
                    var existingName = existingData.ContainsKey("fullName")
                        ? existingData["fullName"]?.ToString()
                        : null;

                    var updates = new Dictionary<string, object>();

                    if (!string.IsNullOrWhiteSpace(fullName) &&
                        existingName != fullName)
                    {
                        updates["fullName"] = fullName;
                    }

                    // Backfill only legacy accounts that do not yet have a status.
                    // Never overwrite an existing suspended/disabled state.
                    if (!existingData.ContainsKey("status") ||
                        string.IsNullOrWhiteSpace(existingData["status"]?.ToString()))
                    {
                        updates["status"] = "active";
                    }

                    if (updates.Count > 0)
                    {
                        await userDoc.UpdateAsync(updates);
                    }
                }

                return Ok(new { message = "User synced successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Sync failed: {ex.Message}");
            }
        }

        // ===============================
        // 🔥 GET CURRENT USER INFO
        // ===============================
        [HttpGet("me")]
        public async Task<IActionResult> Me()
        {
            try
            {
                var uid = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

                if (string.IsNullOrWhiteSpace(uid))
                    return Unauthorized();

                var userDoc = _firestore.Collection("users").Document(uid);
                var snapshot = await userDoc.GetSnapshotAsync();

                if (!snapshot.Exists)
                    return NotFound("User not found");

                var data = snapshot.ToDictionary();

                // Authorization role comes from the trusted ClaimsPrincipal created
                // by FirebaseAuthenticationHandler, not from editable Firestore metadata.
                var trustedRole = User.FindFirst(ClaimTypes.Role)?.Value ?? "user";
                var accountStatus = User.FindFirst("account_status")?.Value ?? "active";

                return Ok(new
                {
                    uid,
                    email = data.ContainsKey("email") ? data["email"] : "",
                    fullName = data.ContainsKey("fullName") ? data["fullName"] : "",
                    role = trustedRole,
                    status = accountStatus
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Failed to get user: {ex.Message}");
            }
        }
    }
}