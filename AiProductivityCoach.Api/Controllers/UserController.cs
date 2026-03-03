using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Google.Cloud.Firestore;
using Google.Apis.Auth.OAuth2;
using System.Security.Claims;

namespace AiProductivityCoach.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class UserController : ControllerBase
    {
        private readonly FirestoreDb _firestore;

        public UserController()
        {
            var credential = GoogleCredential
                .FromFile("Firebase/firebase-service-account.json");

            _firestore = new FirestoreDbBuilder
            {
                ProjectId = "ai-productivity-coach-d40b7",
                Credential = credential
            }.Build();
        }

        // DTO to receive optional full name from frontend
        public class SyncUserDto
        {
            public string? FullName { get; set; }
        }

        // =====================================================
        // 🔥 SYNC USER (CREATE IF NOT EXISTS + AUTO UPDATE NAME)
        // =====================================================
        [HttpPost("sync")]
        public async Task<IActionResult> SyncUser([FromBody] SyncUserDto? dto)
        {
            try
            {
                var uid = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                var email = User.FindFirst(ClaimTypes.Email)?.Value;

                // 🔥 Try multiple possible name claim mappings
                var tokenName =
                    User.FindFirst("name")?.Value ??
                    User.FindFirst(ClaimTypes.Name)?.Value;

                if (string.IsNullOrWhiteSpace(uid))
                    return Unauthorized();

                var userDoc = _firestore.Collection("users").Document(uid);
                var snapshot = await userDoc.GetSnapshotAsync();

                // ===============================
                // 🔥 DETERMINE CORRECT FULL NAME
                // ===============================
                string fullName = "User";

                // 1️⃣ Highest priority → frontend provided name (Google login sends this)
                if (!string.IsNullOrWhiteSpace(dto?.FullName))
                {
                    fullName = dto.FullName.Trim();
                }
                // 2️⃣ Second priority → Firebase token name claim
                else if (!string.IsNullOrWhiteSpace(tokenName))
                {
                    fullName = tokenName.Trim();
                }
                // 3️⃣ Last fallback → email prefix
                else if (!string.IsNullOrWhiteSpace(email))
                {
                    fullName = email.Split('@')[0];
                }

                if (!snapshot.Exists)
                {
                    // ===============================
                    // 🔥 CREATE USER
                    // ===============================
                    var newUser = new Dictionary<string, object>
                    {
                        { "email", email ?? "" },
                        { "fullName", fullName },
                        { "role", "user" },
                        { "createdAt", Timestamp.GetCurrentTimestamp() }
                    };

                    await userDoc.SetAsync(newUser);
                }
                else
                {
                    // ===============================
                    // 🔥 AUTO UPDATE NAME IF CHANGED
                    // ===============================
                    var existingData = snapshot.ToDictionary();
                    var existingName = existingData.ContainsKey("fullName")
                        ? existingData["fullName"]?.ToString()
                        : null;

                    if (!string.IsNullOrWhiteSpace(fullName) &&
                        existingName != fullName)
                    {
                        await userDoc.UpdateAsync(new Dictionary<string, object>
                        {
                            { "fullName", fullName }
                        });
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

                return Ok(new
                {
                    uid,
                    email = data.ContainsKey("email") ? data["email"] : "",
                    fullName = data.ContainsKey("fullName") ? data["fullName"] : "",
                    role = data.ContainsKey("role") ? data["role"] : "user"
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Failed to get user: {ex.Message}");
            }
        }
    }
}