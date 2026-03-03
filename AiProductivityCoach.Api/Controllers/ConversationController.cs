using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Google.Cloud.Firestore;
using Google.Apis.Auth.OAuth2;
using System.Text.Json;

namespace AiProductivityCoach.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class ConversationController : ControllerBase
    {
        private readonly FirestoreDb _firestore;

        public ConversationController()
        {
            var credential = GoogleCredential
                .FromFile("Firebase/firebase-service-account.json");

            _firestore = new FirestoreDbBuilder
            {
                ProjectId = "ai-productivity-coach-d40b7",
                Credential = credential
            }.Build();
        }

        // =========================================
        // SAVE CONVERSATION
        // =========================================
        [HttpPost("save")]
        public async Task<IActionResult> SaveConversation([FromBody] ConversationDto model)
        {
            try
            {
                var uid = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(uid))
                    return Unauthorized();

                if (string.IsNullOrWhiteSpace(model.Industry) ||
                    string.IsNullOrWhiteSpace(model.Description) ||
                    string.IsNullOrWhiteSpace(model.Response))
                {
                    return BadRequest("Invalid conversation payload.");
                }

                var conversationsRef = _firestore
                    .Collection("users")
                    .Document(uid)
                    .Collection("conversations");

                string title = model.Industry;

                try
                {
                    var parsed = JsonDocument.Parse(model.Response);

                    if (parsed.RootElement.TryGetProperty("summary", out var summary))
                    {
                        var summaryText = summary.GetString();
                        if (!string.IsNullOrWhiteSpace(summaryText))
                        {
                            var firstSentence = summaryText
                                .Split('.', StringSplitOptions.RemoveEmptyEntries)
                                .FirstOrDefault();

                            if (!string.IsNullOrWhiteSpace(firstSentence))
                                title = firstSentence.Trim();
                        }
                    }
                }
                catch { }

                var newConversation = new Dictionary<string, object>
                {
                    { "title", title },
                    { "industry", model.Industry },
                    { "description", model.Description },
                    { "response", model.Response },
                    { "language", model.Language ?? "en" }, // 🔥 STORE LANGUAGE
                    { "isPinned", false },
                    { "createdAt", Timestamp.GetCurrentTimestamp() }
                };

                await conversationsRef.AddAsync(newConversation);

                return Ok(new { message = "Conversation saved successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Save failed: {ex.Message}");
            }
        }

        // =========================================
        // GET CONVERSATIONS
        // =========================================
        [HttpGet]
        public async Task<IActionResult> GetConversations()
        {
            try
            {
                var uid = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(uid))
                    return Unauthorized();

                var snapshot = await _firestore
                    .Collection("users")
                    .Document(uid)
                    .Collection("conversations")
                    .GetSnapshotAsync();

                var conversations = snapshot.Documents.Select(doc =>
                {
                    var data = doc.ToDictionary();

                    return new
                    {
                        id = doc.Id,
                        title = data.ContainsKey("title") ? data["title"]?.ToString() : "",
                        industry = data.ContainsKey("industry") ? data["industry"]?.ToString() : "",
                        description = data.ContainsKey("description") ? data["description"]?.ToString() : "",
                        response = data.ContainsKey("response") ? data["response"]?.ToString() : "",
                        language = data.ContainsKey("language") ? data["language"]?.ToString() : "en",
                        isPinned = data.ContainsKey("isPinned") && (bool)data["isPinned"],
                        createdAt = data.ContainsKey("createdAt")
                            ? ((Timestamp)data["createdAt"]).ToDateTime().ToString("o")
                            : null
                    };
                })
                .OrderByDescending(c => c.isPinned)
                .ThenByDescending(c => c.createdAt);

                return Ok(conversations);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Fetch failed: {ex.Message}");
            }
        }

        // =========================================
        // UPDATE
        // =========================================
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateConversation(string id, [FromBody] UpdateConversationDto model)
        {
            try
            {
                var uid = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(uid))
                    return Unauthorized();

                var docRef = _firestore
                    .Collection("users")
                    .Document(uid)
                    .Collection("conversations")
                    .Document(id);

                var snapshot = await docRef.GetSnapshotAsync();
                if (!snapshot.Exists)
                    return NotFound();

                var updates = new Dictionary<string, object>();

                if (!string.IsNullOrWhiteSpace(model.Title))
                    updates["title"] = model.Title.Trim();

                if (model.IsPinned.HasValue)
                    updates["isPinned"] = model.IsPinned.Value;

                if (updates.Count == 0)
                    return BadRequest("No valid update fields.");

                await docRef.UpdateAsync(updates);

                return Ok(new { message = "Conversation updated successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Update failed: {ex.Message}");
            }
        }

        // =========================================
        // DELETE
        // =========================================
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteConversation(string id)
        {
            try
            {
                var uid = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(uid))
                    return Unauthorized();

                var docRef = _firestore
                    .Collection("users")
                    .Document(uid)
                    .Collection("conversations")
                    .Document(id);

                var snapshot = await docRef.GetSnapshotAsync();
                if (!snapshot.Exists)
                    return NotFound();

                await docRef.DeleteAsync();

                return Ok(new { message = "Conversation deleted successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Delete failed: {ex.Message}");
            }
        }
    }

    public class ConversationDto
    {
        public string Industry { get; set; } = "";
        public string Description { get; set; } = "";
        public string Response { get; set; } = "";
        public string? Language { get; set; } = "en"; // 🔥 NEW
    }

    public class UpdateConversationDto
    {
        public string? Title { get; set; }
        public bool? IsPinned { get; set; }
    }
}