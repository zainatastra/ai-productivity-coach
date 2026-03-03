using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Google.Cloud.Firestore;

namespace AiProductivityCoach.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Roles = "admin")]
    public class AdminController : ControllerBase
    {
        private readonly FirestoreDb _firestore;

        // 🔥 Firestore injected via DI
        public AdminController(FirestoreDb firestore)
        {
            _firestore = firestore;
        }

        [HttpGet("dashboard")]
        public async Task<IActionResult> GetDashboard()
        {
            var usersSnapshot = await _firestore
                .Collection("users")
                .GetSnapshotAsync();

            int totalUsers = usersSnapshot.Count;
            int totalResponses = 0;

            var last7Days = new Dictionary<string, int>();

            // ============================
            // INITIALIZE LAST 7 DAYS GRAPH
            // ============================
            for (int i = 6; i >= 0; i--)
            {
                var date = DateTime.UtcNow.Date.AddDays(-i);
                last7Days[date.ToString("yyyy-MM-dd")] = 0;
            }

            var last30DaysDate = DateTime.UtcNow.Date.AddDays(-30);
            var last7DaysDate = DateTime.UtcNow.Date.AddDays(-7);

            int newUsers = 0;
            int returningUsers = 0;
            int inactiveOldUsers = 0;

            int highlyActiveUsers = 0;
            int moderateUsers = 0;
            int inactiveUsers = 0;

            foreach (var userDoc in usersSnapshot.Documents)
            {
                var userData = userDoc.ToDictionary();

                DateTime? createdAt = null;

                if (userData.ContainsKey("createdAt") &&
                    userData["createdAt"] is Timestamp createdTs)
                {
                    createdAt = createdTs.ToDateTime().Date;
                }

                bool hasConversationLast30Days = false;
                int promptsLast7Days = 0;

                var convSnapshot = await _firestore
                    .Collection("users")
                    .Document(userDoc.Id)
                    .Collection("conversations")
                    .GetSnapshotAsync();

                totalResponses += convSnapshot.Count;

                foreach (var conv in convSnapshot.Documents)
                {
                    var convData = conv.ToDictionary();

                    if (convData.ContainsKey("createdAt") &&
                        convData["createdAt"] is Timestamp ts)
                    {
                        var convDate = ts.ToDateTime().Date;

                        var graphKey = convDate.ToString("yyyy-MM-dd");
                        if (last7Days.ContainsKey(graphKey))
                            last7Days[graphKey]++;

                        if (convDate >= last30DaysDate)
                            hasConversationLast30Days = true;

                        if (convDate >= last7DaysDate)
                            promptsLast7Days++;
                    }
                }

                if (createdAt.HasValue)
                {
                    if (createdAt.Value >= last30DaysDate)
                        newUsers++;
                    else if (hasConversationLast30Days)
                        returningUsers++;
                    else
                        inactiveOldUsers++;
                }

                if (promptsLast7Days >= 10)
                    highlyActiveUsers++;
                else if (promptsLast7Days >= 1)
                    moderateUsers++;
                else
                    inactiveUsers++;
            }

            int openBugs = 0;
            int resolvedBugs = 0;

            var usersList = usersSnapshot.Documents.Select(doc =>
            {
                var data = doc.ToDictionary();

                return new
                {
                    id = doc.Id,
                    email = data.ContainsKey("email") ? data["email"]?.ToString() : "",
                    fullName = data.ContainsKey("fullName") ? data["fullName"]?.ToString() : "",
                    role = data.ContainsKey("role") ? data["role"]?.ToString() : "",
                    createdAt = data.ContainsKey("createdAt")
                        ? ((Timestamp)data["createdAt"]).ToDateTime().ToString("yyyy-MM-dd")
                        : ""
                };
            });

            return Ok(new
            {
                totalUsers,
                totalResponses,
                openBugs,
                resolvedBugs,
                graph = last7Days,
                users = usersList,

                newUsers,
                returningUsers,
                inactiveOldUsers,

                highlyActiveUsers,
                moderateUsers,
                inactiveUsers
            });
        }
    }
}