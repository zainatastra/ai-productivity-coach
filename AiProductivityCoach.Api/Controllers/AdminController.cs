using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Google.Cloud.Firestore;
using FirebaseAdmin.Auth;
using System.Security.Claims;
using AiProductivityCoach.Api.Services;

namespace AiProductivityCoach.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Policy = "AdminOnly")]
    public class AdminController : ControllerBase
    {
        private readonly FirestoreDb _firestore;
        private readonly ProviderMediaStorage _mediaStorage;

        public AdminController(
            FirestoreDb firestore,
            ProviderMediaStorage mediaStorage)
        {
            _firestore = firestore;
            _mediaStorage = mediaStorage;
        }

        public class CreatePublisherDto
        {
            public string FullName { get; set; } = string.Empty;
            public string Email { get; set; } = string.Empty;
            public string Password { get; set; } = string.Empty;
        }

        public class ModerationDecisionDto
        {
            public string Action { get; set; } = string.Empty;
            public string Note { get; set; } = string.Empty;
        }

        public class ChangePublisherPasswordDto
        {
            public string Password { get; set; } = string.Empty;
        }

        public class UpdatePublisherCredentialsDto
        {
            public string Email { get; set; } = string.Empty;
            public string Password { get; set; } = string.Empty;
        }

        // =====================================================
        // 👤 CREATE PUBLISHER ACCOUNT (ADMIN ONLY)
        // =====================================================
        [HttpPost("publishers")]
        public async Task<IActionResult> CreatePublisher([FromBody] CreatePublisherDto request)
        {
            var adminUid = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

            if (string.IsNullOrWhiteSpace(adminUid))
                return Unauthorized();

            var fullName = request.FullName?.Trim() ?? string.Empty;
            var email = request.Email?.Trim().ToLowerInvariant() ?? string.Empty;
            var password = request.Password ?? string.Empty;

            if (string.IsNullOrWhiteSpace(fullName))
                return BadRequest(new { message = "Full name is required." });

            if (string.IsNullOrWhiteSpace(email))
                return BadRequest(new { message = "Email is required." });

            if (string.IsNullOrWhiteSpace(password) || password.Length < 6)
                return BadRequest(new { message = "Password must be at least 6 characters." });

            UserRecord? firebaseUser = null;

            try
            {
                firebaseUser = await FirebaseAuth.DefaultInstance.CreateUserAsync(
                    new UserRecordArgs
                    {
                        Email = email,
                        Password = password,
                        DisplayName = fullName,
                        Disabled = false,
                        EmailVerified = false
                    }
                );

                await FirebaseAuth.DefaultInstance.SetCustomUserClaimsAsync(
                    firebaseUser.Uid,
                    new Dictionary<string, object>
                    {
                        { "role", "publisher" }
                    }
                );

                var userDoc = _firestore.Collection("users").Document(firebaseUser.Uid);

                await userDoc.SetAsync(new Dictionary<string, object>
                {
                    { "email", email },
                    { "fullName", fullName },
                    { "role", "publisher" },
                    { "status", "active" },
                    { "createdBy", adminUid },
                    { "createdAt", Timestamp.GetCurrentTimestamp() },
                    { "updatedAt", Timestamp.GetCurrentTimestamp() }
                });

                await WriteAuditLogAsync(
                    adminUid,
                    "admin",
                    "publisher.created",
                    string.Empty,
                    "publisher",
                    firebaseUser.Uid,
                    null,
                    "active"
                );

                return StatusCode(StatusCodes.Status201Created, new
                {
                    uid = firebaseUser.Uid,
                    email,
                    fullName,
                    role = "publisher",
                    status = "active"
                });
            }
            catch (FirebaseAuthException ex)
            {
                return Conflict(new
                {
                    message = "Unable to create publisher account.",
                    code = ex.AuthErrorCode.ToString()
                });
            }
            catch (Exception ex)
            {
                // Best-effort rollback: if Firebase Auth was created but Firestore failed,
                // remove the partially-created account so we do not leave inconsistent state.
                if (firebaseUser != null)
                {
                    try
                    {
                        await FirebaseAuth.DefaultInstance.DeleteUserAsync(firebaseUser.Uid);
                    }
                    catch
                    {
                        // Preserve the original error response.
                    }
                }

                return StatusCode(500, new
                {
                    message = "Failed to create publisher account.",
                    detail = ex.Message
                });
            }
        }


        // =====================================================
        // 🔐 PUBLISHER CREDENTIAL / ACCESS MANAGEMENT (ADMIN ONLY)
        // =====================================================
        [HttpPut("publishers/{uid}/credentials")]
        public async Task<IActionResult> UpdatePublisherCredentials(
            string uid,
            [FromBody] UpdatePublisherCredentialsDto request)
        {
            var adminUid = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

            if (string.IsNullOrWhiteSpace(adminUid))
                return Unauthorized();

            if (string.IsNullOrWhiteSpace(uid))
                return BadRequest(new { message = "Publisher UID is required." });

            var email = request.Email?.Trim().ToLowerInvariant() ?? string.Empty;
            var password = request.Password ?? string.Empty;

            if (string.IsNullOrWhiteSpace(email) ||
                !System.Net.Mail.MailAddress.TryCreate(email, out _))
            {
                return BadRequest(new { message = "A valid email address is required." });
            }

            if (!string.IsNullOrEmpty(password) && password.Length < 8)
                return BadRequest(new { message = "New password must be at least 8 characters." });

            try
            {
                var target = await FirebaseAuth.DefaultInstance.GetUserAsync(uid);

                if (!IsPublisher(target))
                    return NotFound(new { message = "Publisher account not found." });

                if (target.Disabled)
                    return Conflict(new { message = "Access is revoked for this publisher." });

                var currentEmail = (target.Email ?? string.Empty).Trim().ToLowerInvariant();
                var emailChanged = !string.Equals(currentEmail, email, StringComparison.OrdinalIgnoreCase);
                var passwordChanged = !string.IsNullOrEmpty(password);

                if (!emailChanged && !passwordChanged)
                {
                    return BadRequest(new
                    {
                        message = "Change the email address or provide a new password before updating credentials."
                    });
                }

                var args = new UserRecordArgs
                {
                    Uid = uid
                };

                if (emailChanged)
                {
                    args.Email = email;
                    args.EmailVerified = false;
                }

                if (passwordChanged)
                    args.Password = password;

                await FirebaseAuth.DefaultInstance.UpdateUserAsync(args);

                // Force the publisher to sign in again with the updated credentials.
                await FirebaseAuth.DefaultInstance.RevokeRefreshTokensAsync(uid);

                var now = Timestamp.GetCurrentTimestamp();
                var updates = new Dictionary<string, object>
                {
                    { "email", email },
                    { "updatedAt", now },
                    { "credentialsUpdatedAt", now },
                    { "credentialsUpdatedBy", adminUid }
                };

                if (emailChanged)
                {
                    updates["emailChangedAt"] = now;
                    updates["emailChangedBy"] = adminUid;
                }

                if (passwordChanged)
                {
                    updates["passwordChangedAt"] = now;
                    updates["passwordChangedBy"] = adminUid;
                }

                await _firestore.Collection("users").Document(uid).SetAsync(
                    updates,
                    SetOptions.MergeAll
                );

                var noteParts = new List<string>();

                if (emailChanged)
                    noteParts.Add($"email: {currentEmail} -> {email}");

                if (passwordChanged)
                    noteParts.Add("password changed");

                await WriteAuditLogAsync(
                    adminUid,
                    "admin",
                    "publisher.credentials_updated",
                    string.Empty,
                    "publisher",
                    uid,
                    null,
                    "credentials_updated",
                    string.Join(" · ", noteParts)
                );

                return Ok(new
                {
                    success = true,
                    uid,
                    email,
                    emailChanged,
                    passwordChanged,
                    message = "Publisher credentials updated successfully."
                });
            }
            catch (FirebaseAuthException ex)
            {
                if (ex.AuthErrorCode == AuthErrorCode.EmailAlreadyExists)
                {
                    return Conflict(new
                    {
                        message = "Another account already uses this email address."
                    });
                }

                return NotFound(new { message = "Publisher account not found." });
            }
        }

        [HttpPut("publishers/{uid}/password")]
        public async Task<IActionResult> ChangePublisherPassword(
            string uid,
            [FromBody] ChangePublisherPasswordDto request)
        {
            var adminUid = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

            if (string.IsNullOrWhiteSpace(adminUid))
                return Unauthorized();

            if (string.IsNullOrWhiteSpace(uid))
                return BadRequest(new { message = "Publisher UID is required." });

            var password = request.Password ?? string.Empty;

            if (password.Length < 8)
                return BadRequest(new { message = "New password must be at least 8 characters." });

            try
            {
                var target = await FirebaseAuth.DefaultInstance.GetUserAsync(uid);

                if (!IsPublisher(target))
                    return NotFound(new { message = "Publisher account not found." });

                if (target.Disabled)
                    return Conflict(new { message = "Access is revoked for this publisher." });

                await FirebaseAuth.DefaultInstance.UpdateUserAsync(
                    new UserRecordArgs
                    {
                        Uid = uid,
                        Password = password
                    }
                );

                // Invalidate all existing sessions immediately.
                await FirebaseAuth.DefaultInstance.RevokeRefreshTokensAsync(uid);

                var now = Timestamp.GetCurrentTimestamp();

                await _firestore.Collection("users").Document(uid).SetAsync(
                    new Dictionary<string, object>
                    {
                        { "updatedAt", now },
                        { "passwordChangedAt", now },
                        { "passwordChangedBy", adminUid }
                    },
                    SetOptions.MergeAll
                );

                await WriteAuditLogAsync(
                    adminUid,
                    "admin",
                    "publisher.password_changed",
                    string.Empty,
                    "publisher",
                    uid,
                    null,
                    "password_changed",
                    target.Email ?? string.Empty
                );

                return Ok(new
                {
                    success = true,
                    uid,
                    message = "Publisher password changed successfully."
                });
            }
            catch (FirebaseAuthException)
            {
                return NotFound(new { message = "Publisher account not found." });
            }
        }

        [HttpPost("publishers/{uid}/revoke")]
        public async Task<IActionResult> RevokePublisherAccess(string uid)
        {
            var adminUid = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

            if (string.IsNullOrWhiteSpace(adminUid))
                return Unauthorized();

            if (string.IsNullOrWhiteSpace(uid))
                return BadRequest(new { message = "Publisher UID is required." });

            try
            {
                var target = await FirebaseAuth.DefaultInstance.GetUserAsync(uid);

                if (!IsPublisher(target))
                    return NotFound(new { message = "Publisher account not found." });

                if (target.Disabled)
                    return Conflict(new { message = "Publisher access is already revoked." });

                var userRef = _firestore.Collection("users").Document(uid);
                var now = Timestamp.GetCurrentTimestamp();

                // Fail closed first at the API layer.
                await userRef.SetAsync(
                    new Dictionary<string, object>
                    {
                        { "status", "disabled" },
                        { "revokedAt", now },
                        { "revokedBy", adminUid },
                        { "updatedAt", now }
                    },
                    SetOptions.MergeAll
                );

                await FirebaseAuth.DefaultInstance.UpdateUserAsync(
                    new UserRecordArgs
                    {
                        Uid = uid,
                        Disabled = true
                    }
                );

                await FirebaseAuth.DefaultInstance.RevokeRefreshTokensAsync(uid);

                await WriteAuditLogAsync(
                    adminUid,
                    "admin",
                    "publisher.access_revoked",
                    string.Empty,
                    "publisher",
                    uid,
                    "active",
                    "disabled",
                    target.Email ?? string.Empty
                );

                return Ok(new
                {
                    success = true,
                    uid,
                    status = "disabled",
                    message = "Publisher access revoked successfully."
                });
            }
            catch (FirebaseAuthException)
            {
                return NotFound(new { message = "Publisher account not found." });
            }
        }

        [HttpPost("publishers/{uid}/restore")]
        public async Task<IActionResult> RestorePublisherAccess(string uid)
        {
            var adminUid = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

            if (string.IsNullOrWhiteSpace(adminUid))
                return Unauthorized();

            if (string.IsNullOrWhiteSpace(uid))
                return BadRequest(new { message = "Publisher UID is required." });

            try
            {
                var target = await FirebaseAuth.DefaultInstance.GetUserAsync(uid);

                if (!IsPublisher(target))
                    return NotFound(new { message = "Publisher account not found." });

                var userRef = _firestore.Collection("users").Document(uid);
                var userSnapshot = await userRef.GetSnapshotAsync();
                var currentStatus = userSnapshot.Exists
                    ? GetString(userSnapshot.ToDictionary(), "status", target.Disabled ? "disabled" : "active")
                    : (target.Disabled ? "disabled" : "active");

                if (!target.Disabled &&
                    string.Equals(currentStatus, "active", StringComparison.OrdinalIgnoreCase))
                {
                    return Conflict(new { message = "Publisher access is already active." });
                }

                // Enable Firebase Auth first. If Firestore update fails afterwards,
                // the API still fails closed because users/{uid}.status remains disabled.
                await FirebaseAuth.DefaultInstance.UpdateUserAsync(
                    new UserRecordArgs
                    {
                        Uid = uid,
                        Disabled = false
                    }
                );

                var now = Timestamp.GetCurrentTimestamp();

                await userRef.SetAsync(
                    new Dictionary<string, object>
                    {
                        { "status", "active" },
                        { "restoredAt", now },
                        { "restoredBy", adminUid },
                        { "revokedAt", FieldValue.Delete },
                        { "revokedBy", FieldValue.Delete },
                        { "updatedAt", now }
                    },
                    SetOptions.MergeAll
                );

                // Require a freshly issued token after restoration.
                await FirebaseAuth.DefaultInstance.RevokeRefreshTokensAsync(uid);

                await WriteAuditLogAsync(
                    adminUid,
                    "admin",
                    "publisher.access_restored",
                    string.Empty,
                    "publisher",
                    uid,
                    currentStatus,
                    "active",
                    target.Email ?? string.Empty
                );

                return Ok(new
                {
                    success = true,
                    uid,
                    status = "active",
                    message = "Publisher access restored successfully."
                });
            }
            catch (FirebaseAuthException)
            {
                return NotFound(new { message = "Publisher account not found." });
            }
        }

        [HttpDelete("publishers/{uid}")]
        public async Task<IActionResult> DeletePublisher(string uid)
        {
            var adminUid = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

            if (string.IsNullOrWhiteSpace(adminUid))
                return Unauthorized();

            if (string.IsNullOrWhiteSpace(uid))
                return BadRequest(new { message = "Publisher UID is required." });

            UserRecord target;

            try
            {
                target = await FirebaseAuth.DefaultInstance.GetUserAsync(uid);
            }
            catch (FirebaseAuthException)
            {
                return NotFound(new { message = "Publisher account not found." });
            }

            if (!IsPublisher(target))
                return NotFound(new { message = "Publisher account not found." });

            var userRef = _firestore.Collection("users").Document(uid);
            var userSnapshot = await userRef.GetSnapshotAsync();

            var displayName = target.DisplayName ?? string.Empty;
            var email = target.Email ?? string.Empty;

            if (userSnapshot.Exists)
            {
                var data = userSnapshot.ToDictionary();

                if (string.IsNullOrWhiteSpace(displayName))
                    displayName = GetString(data, "fullName");

                if (string.IsNullOrWhiteSpace(email))
                    email = GetString(data, "email");
            }

            // Block protected API access before performing destructive deletion.
            await userRef.SetAsync(
                new Dictionary<string, object>
                {
                    { "status", "disabled" },
                    { "updatedAt", Timestamp.GetCurrentTimestamp() },
                    { "deletedBy", adminUid }
                },
                SetOptions.MergeAll
            );

            await FirebaseAuth.DefaultInstance.RevokeRefreshTokensAsync(uid);
            await FirebaseAuth.DefaultInstance.DeleteUserAsync(uid);

            // Only credential/user metadata is deleted. Provider/company content is preserved.
            await userRef.DeleteAsync();

            await WriteAuditLogAsync(
                adminUid,
                "admin",
                "publisher.deleted",
                string.Empty,
                "publisher",
                uid,
                "disabled",
                "deleted",
                string.Join(" · ", new[] { displayName, email }.Where(v => !string.IsNullOrWhiteSpace(v)))
            );

            return Ok(new
            {
                success = true,
                deletedUid = uid,
                message = "Publisher account deleted successfully. Provider content was preserved."
            });
        }

        private static bool IsPublisher(UserRecord user)
        {
            if (user.CustomClaims == null ||
                !user.CustomClaims.TryGetValue("role", out var rawRole))
            {
                return false;
            }

            return string.Equals(
                rawRole?.ToString()?.Trim(),
                "publisher",
                StringComparison.OrdinalIgnoreCase
            );
        }


        // =====================================================
        // 🏢 PROVIDER PROFILE MODERATION (ADMIN ONLY)
        // =====================================================
        [HttpGet("provider-reviews")]
        public async Task<IActionResult> GetProviderReviews([FromQuery] string? state = null)
        {
            var snapshot = await _firestore.Collection("companies").GetSnapshotAsync();

            var rows = new List<Dictionary<string, object?>>();

            foreach (var companyDoc in snapshot.Documents)
            {
                var data = companyDoc.ToDictionary();
                var moderationState = GetString(data, "moderationState", "draft");

                if (!string.IsNullOrWhiteSpace(state) &&
                    !string.Equals(state.Trim(), moderationState, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var ownerUid = GetString(data, "ownerUid");
                string publisherName = string.Empty;
                string publisherEmail = string.Empty;

                if (!string.IsNullOrWhiteSpace(ownerUid))
                {
                    var userDoc = await _firestore.Collection("users").Document(ownerUid).GetSnapshotAsync();

                    if (userDoc.Exists)
                    {
                        var userData = userDoc.ToDictionary();
                        publisherName = GetString(userData, "fullName");
                        publisherEmail = GetString(userData, "email");
                    }
                }

                rows.Add(new Dictionary<string, object?>
                {
                    ["id"] = companyDoc.Id,
                    ["name"] = GetString(data, "name"),
                    ["slug"] = GetString(data, "slug"),
                    ["status"] = GetString(data, "status", "draft"),
                    ["moderationState"] = moderationState,
                    ["publisherName"] = publisherName,
                    ["publisherEmail"] = publisherEmail,
                    ["submittedAt"] = GetTimestampIso(data, "submittedAt"),
                    ["approvedAt"] = GetTimestampIso(data, "approvedAt"),
                    ["updatedAt"] = GetTimestampIso(data, "updatedAt")
                });
            }

            var ordered = rows
                .OrderByDescending(row =>
                    row.TryGetValue("submittedAt", out var submitted) && !string.IsNullOrWhiteSpace(submitted?.ToString())
                        ? submitted?.ToString()
                        : row.TryGetValue("updatedAt", out var updated)
                            ? updated?.ToString()
                            : string.Empty)
                .ToList();

            return Ok(ordered);
        }

        [HttpGet("provider-reviews/{companyId}")]
        public async Task<IActionResult> GetProviderReview(string companyId)
        {
            if (string.IsNullOrWhiteSpace(companyId))
                return BadRequest(new { message = "Company ID is required." });

            var companyDoc = await _firestore.Collection("companies").Document(companyId).GetSnapshotAsync();

            if (!companyDoc.Exists)
                return NotFound(new { message = "Company not found." });

            var companyData = companyDoc.ToDictionary();
            var ownerUid = GetString(companyData, "ownerUid");

            var publisher = new Dictionary<string, object?>
            {
                ["uid"] = ownerUid,
                ["fullName"] = "",
                ["email"] = ""
            };

            if (!string.IsNullOrWhiteSpace(ownerUid))
            {
                var userDoc = await _firestore.Collection("users").Document(ownerUid).GetSnapshotAsync();

                if (userDoc.Exists)
                {
                    var userData = userDoc.ToDictionary();
                    publisher["fullName"] = GetString(userData, "fullName");
                    publisher["email"] = GetString(userData, "email");
                }
            }

            var aboutDoc = await companyDoc.Reference.Collection("about").Document("profile").GetSnapshotAsync();

            var response = new Dictionary<string, object?>
            {
                ["company"] = ToAdminCompany(companyDoc),
                ["publisher"] = publisher,
                ["about"] = aboutDoc.Exists ? ToApiDocument(aboutDoc, false) : new Dictionary<string, object?>(),
                ["posts"] = await ReadSubcollectionAsync(companyDoc.Reference, "posts"),
                ["whitepapers"] = await ReadSubcollectionAsync(companyDoc.Reference, "whitepapers"),
                ["products"] = await ReadSubcollectionAsync(companyDoc.Reference, "products"),
                ["contacts"] = await ReadSubcollectionAsync(companyDoc.Reference, "contacts"),
                ["appointments"] = await ReadSubcollectionAsync(companyDoc.Reference, "appointments"),
                ["webinars"] = await ReadSubcollectionAsync(companyDoc.Reference, "webinars"),
                ["events"] = await ReadSubcollectionAsync(companyDoc.Reference, "events")
            };

            return Ok(response);
        }

        [HttpPost("provider-reviews/{companyId}/decision")]
        public async Task<IActionResult> DecideProviderReview(
            string companyId,
            [FromBody] ModerationDecisionDto request)
        {
            var adminUid = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

            if (string.IsNullOrWhiteSpace(adminUid))
                return Unauthorized();

            if (string.IsNullOrWhiteSpace(companyId))
                return BadRequest(new { message = "Company ID is required." });

            var companyRef = _firestore.Collection("companies").Document(companyId);
            var companyDoc = await companyRef.GetSnapshotAsync();

            if (!companyDoc.Exists)
                return NotFound(new { message = "Company not found." });

            var action = request.Action?.Trim().ToLowerInvariant() ?? string.Empty;
            var note = request.Note?.Trim() ?? string.Empty;
            var companyData = companyDoc.ToDictionary();
            var moderationState = GetString(companyData, "moderationState", "draft");
            var currentStatus = GetString(companyData, "status", "draft");
            var hasApprovedSnapshot = companyData.ContainsKey("approvedSnapshot");
            var now = Timestamp.GetCurrentTimestamp();

            if (action == "approve")
            {
                if (!string.Equals(moderationState, "pending_review", StringComparison.OrdinalIgnoreCase))
                {
                    return Conflict(new
                    {
                        message = "Only a profile currently pending review can be approved."
                    });
                }

                var snapshot = await BuildApprovedSnapshotAsync(companyDoc);

                var currentVersion = 0L;
                if (companyData.TryGetValue("approvedVersion", out var rawVersion))
                {
                    if (rawVersion is long longVersion) currentVersion = longVersion;
                    else long.TryParse(rawVersion?.ToString(), out currentVersion);
                }

                var approvedCompany = snapshot.TryGetValue("company", out var approvedCompanyRaw) &&
                                      approvedCompanyRaw is Dictionary<string, object> approvedCompanyMap
                    ? approvedCompanyMap
                    : new Dictionary<string, object>();

                await companyRef.UpdateAsync(new Dictionary<string, object>
                {
                    { "status", "published" },
                    { "moderationState", "approved" },
                    { "approvedSnapshot", snapshot },
                    { "approvedSlug", GetString(approvedCompany, "slug") },
                    { "approvedVersion", currentVersion + 1 },
                    { "approvedAt", now },
                    { "approvedBy", adminUid },
                    { "reviewedAt", now },
                    { "reviewedBy", adminUid },
                    { "reviewNote", note },
                    { "revisionNote", FieldValue.Delete },
                    { "rejectionNote", FieldValue.Delete },
                    { "updatedAt", now }
                });

                await WriteAuditLogAsync(
                    adminUid,
                    "admin",
                    "company.approved",
                    companyId,
                    "company",
                    companyId,
                    moderationState,
                    "approved",
                    note
                );
            }
            else if (action == "request_revision")
            {
                if (!string.Equals(moderationState, "pending_review", StringComparison.OrdinalIgnoreCase))
                {
                    return Conflict(new
                    {
                        message = "Only a profile currently pending review can be sent back for revision."
                    });
                }

                if (string.IsNullOrWhiteSpace(note))
                    return BadRequest(new { message = "Revision notes are required." });

                var nextStatus = hasApprovedSnapshot &&
                                 string.Equals(currentStatus, "published", StringComparison.OrdinalIgnoreCase)
                    ? "published"
                    : "draft";

                await companyRef.UpdateAsync(new Dictionary<string, object>
                {
                    { "status", nextStatus },
                    { "moderationState", "changes_requested" },
                    { "revisionNote", note },
                    { "reviewedAt", now },
                    { "reviewedBy", adminUid },
                    { "updatedAt", now }
                });

                await WriteAuditLogAsync(
                    adminUid,
                    "admin",
                    "company.revision_requested",
                    companyId,
                    "company",
                    companyId,
                    moderationState,
                    "changes_requested",
                    note
                );
            }
            else if (action == "reject")
            {
                if (!string.Equals(moderationState, "pending_review", StringComparison.OrdinalIgnoreCase))
                {
                    return Conflict(new
                    {
                        message = "Only a profile currently pending review can be rejected."
                    });
                }

                if (string.IsNullOrWhiteSpace(note))
                    return BadRequest(new { message = "A rejection reason is required." });

                var nextStatus = hasApprovedSnapshot &&
                                 string.Equals(currentStatus, "published", StringComparison.OrdinalIgnoreCase)
                    ? "published"
                    : "draft";

                await companyRef.UpdateAsync(new Dictionary<string, object>
                {
                    { "status", nextStatus },
                    { "moderationState", "rejected" },
                    { "rejectionNote", note },
                    { "reviewedAt", now },
                    { "reviewedBy", adminUid },
                    { "updatedAt", now }
                });

                await WriteAuditLogAsync(
                    adminUid,
                    "admin",
                    "company.rejected",
                    companyId,
                    "company",
                    companyId,
                    moderationState,
                    "rejected",
                    note
                );
            }
            else if (action == "unpublish")
            {
                if (!string.Equals(currentStatus, "published", StringComparison.OrdinalIgnoreCase))
                {
                    return Conflict(new { message = "Only a published profile can be unpublished." });
                }

                if (string.IsNullOrWhiteSpace(note))
                    return BadRequest(new { message = "An unpublish reason is required." });

                await companyRef.UpdateAsync(new Dictionary<string, object>
                {
                    { "status", "unpublished" },
                    { "unpublishedAt", now },
                    { "unpublishedBy", adminUid },
                    { "unpublishNote", note },
                    { "updatedAt", now }
                });

                await WriteAuditLogAsync(
                    adminUid,
                    "admin",
                    "company.unpublished",
                    companyId,
                    "company",
                    companyId,
                    currentStatus,
                    "unpublished",
                    note
                );
            }
            else if (action == "republish")
            {
                if (!string.Equals(currentStatus, "unpublished", StringComparison.OrdinalIgnoreCase) ||
                    !hasApprovedSnapshot)
                {
                    return Conflict(new
                    {
                        message = "Only an unpublished profile with an approved snapshot can be republished."
                    });
                }

                await companyRef.UpdateAsync(new Dictionary<string, object>
                {
                    { "status", "published" },
                    { "republishedAt", now },
                    { "republishedBy", adminUid },
                    { "unpublishNote", FieldValue.Delete },
                    { "updatedAt", now }
                });

                await WriteAuditLogAsync(
                    adminUid,
                    "admin",
                    "company.republished",
                    companyId,
                    "company",
                    companyId,
                    "unpublished",
                    "published",
                    note
                );
            }
            else
            {
                return BadRequest(new
                {
                    message = "Unsupported moderation action. Use approve, request_revision, reject, unpublish or republish."
                });
            }

            var updated = await companyRef.GetSnapshotAsync();

            return Ok(new
            {
                company = ToAdminCompany(updated),
                success = true
            });
        }

        [HttpDelete("provider-reviews/{companyId}")]
        public async Task<IActionResult> DeleteProviderProfile(string companyId)
        {
            var adminUid = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

            if (string.IsNullOrWhiteSpace(adminUid))
                return Unauthorized();

            if (string.IsNullOrWhiteSpace(companyId))
                return BadRequest(new { message = "Company ID is required." });

            var companyRef = _firestore.Collection("companies").Document(companyId);
            var companyDoc = await companyRef.GetSnapshotAsync();

            if (!companyDoc.Exists)
                return NotFound(new { message = "Company not found." });

            var companyData = companyDoc.ToDictionary();

            await _mediaStorage.DeleteIfExistsAsync(GetString(companyData, "logoObjectPath"));
            await _mediaStorage.DeleteIfExistsAsync(GetString(companyData, "bannerObjectPath"));

            foreach (var subcollection in new[]
            {
                "about", "posts", "whitepapers", "products",
                "contacts", "appointments", "webinars", "events"
            })
            {
                await DeleteSubcollectionAsync(companyRef.Collection(subcollection), deleteMedia: true);
            }

            await companyRef.DeleteAsync();

            await WriteAuditLogAsync(
                adminUid,
                "admin",
                "company.deleted",
                companyId,
                "company",
                companyId,
                GetString(companyData, "moderationState", "draft"),
                "deleted",
                GetString(companyData, "name")
            );

            return Ok(new
            {
                success = true,
                deletedCompanyId = companyId,
                deletedBy = adminUid
            });
        }

        private async Task<List<Dictionary<string, object?>>> ReadSubcollectionAsync(
            DocumentReference companyRef,
            string collectionName)
        {
            var snapshot = await companyRef.Collection(collectionName).GetSnapshotAsync();

            return snapshot.Documents
                .Select(doc => ToApiDocument(doc))
                .OrderByDescending(item =>
                    item.TryGetValue("updatedAt", out var value)
                        ? value?.ToString()
                        : string.Empty)
                .ToList();
        }

        private async Task<Dictionary<string, object>> BuildApprovedSnapshotAsync(DocumentSnapshot companyDoc)
        {
            var data = companyDoc.ToDictionary();

            var company = new Dictionary<string, object>
            {
                { "id", companyDoc.Id },
                { "name", GetString(data, "name") },
                { "slug", GetString(data, "slug") },
                { "shortDescription", GetString(data, "shortDescription") },
                { "websiteUrl", GetString(data, "websiteUrl") },
                { "email", GetString(data, "email") },
                { "phone", GetString(data, "phone") },
                { "address", GetString(data, "address") },
                { "categories", GetStringList(data, "categories") },
                { "logoUrl", GetString(data, "logoUrl") },
                { "bannerUrl", GetString(data, "bannerUrl") }
            };

            var aboutDoc = await companyDoc.Reference.Collection("about").Document("profile").GetSnapshotAsync();

            return new Dictionary<string, object>
            {
                { "company", company },
                { "about", aboutDoc.Exists ? ToFirestoreSafeDictionary(aboutDoc) : new Dictionary<string, object>() },
                { "posts", await ReadSubcollectionForSnapshotAsync(companyDoc.Reference, "posts") },
                { "whitepapers", await ReadSubcollectionForSnapshotAsync(companyDoc.Reference, "whitepapers") },
                { "products", await ReadSubcollectionForSnapshotAsync(companyDoc.Reference, "products") },
                { "contacts", await ReadSubcollectionForSnapshotAsync(companyDoc.Reference, "contacts") },
                { "appointments", await ReadSubcollectionForSnapshotAsync(companyDoc.Reference, "appointments") },
                { "webinars", await ReadSubcollectionForSnapshotAsync(companyDoc.Reference, "webinars") },
                { "events", await ReadSubcollectionForSnapshotAsync(companyDoc.Reference, "events") }
            };
        }

        private async Task<List<object>> ReadSubcollectionForSnapshotAsync(
            DocumentReference companyRef,
            string collectionName)
        {
            var snapshot = await companyRef.Collection(collectionName).GetSnapshotAsync();

            return snapshot.Documents
                .Select(doc => (object)ToFirestoreSafeDictionary(doc))
                .ToList();
        }

        private static Dictionary<string, object> ToFirestoreSafeDictionary(DocumentSnapshot doc)
        {
            var result = new Dictionary<string, object>
            {
                { "id", doc.Id }
            };

            foreach (var pair in doc.ToDictionary())
            {
                if (pair.Key is "createdBy" or "ownerUid" ||
                    pair.Key.EndsWith("ObjectPath", StringComparison.Ordinal))
                    continue;

                result[pair.Key] = pair.Value;
            }

            return result;
        }

        private async Task DeleteSubcollectionAsync(
            CollectionReference collection,
            bool deleteMedia = false)
        {
            while (true)
            {
                var snapshot = await collection.Limit(100).GetSnapshotAsync();

                if (snapshot.Count == 0)
                    break;

                if (deleteMedia)
                {
                    foreach (var doc in snapshot.Documents)
                    {
                        var data = doc.ToDictionary();

                        foreach (var objectPathField in new[]
                        {
                            "fileObjectPath",
                            "imageObjectPath",
                            "photoObjectPath",
                            "thumbnailObjectPath"
                        })
                        {
                            await _mediaStorage.DeleteIfExistsAsync(
                                GetString(data, objectPathField)
                            );
                        }
                    }
                }

                var batch = _firestore.StartBatch();

                foreach (var doc in snapshot.Documents)
                    batch.Delete(doc.Reference);

                await batch.CommitAsync();
            }
        }

        private static Dictionary<string, object?> ToAdminCompany(DocumentSnapshot doc)
        {
            var data = doc.ToDictionary();

            return new Dictionary<string, object?>
            {
                ["id"] = doc.Id,
                ["name"] = GetString(data, "name"),
                ["slug"] = GetString(data, "slug"),
                ["shortDescription"] = GetString(data, "shortDescription"),
                ["websiteUrl"] = GetString(data, "websiteUrl"),
                ["email"] = GetString(data, "email"),
                ["phone"] = GetString(data, "phone"),
                ["address"] = GetString(data, "address"),
                ["categories"] = GetStringList(data, "categories"),
                ["logoUrl"] = GetString(data, "logoUrl"),
                ["bannerUrl"] = GetString(data, "bannerUrl"),
                ["status"] = GetString(data, "status", "draft"),
                ["moderationState"] = GetString(data, "moderationState", "draft"),
                ["revisionNote"] = GetString(data, "revisionNote"),
                ["rejectionNote"] = GetString(data, "rejectionNote"),
                ["reviewNote"] = GetString(data, "reviewNote"),
                ["approvedVersion"] = data.TryGetValue("approvedVersion", out var version) ? version : 0,
                ["submittedAt"] = GetTimestampIso(data, "submittedAt"),
                ["approvedAt"] = GetTimestampIso(data, "approvedAt"),
                ["updatedAt"] = GetTimestampIso(data, "updatedAt")
            };
        }

        private static Dictionary<string, object?> ToApiDocument(
            DocumentSnapshot doc,
            bool includeId = true)
        {
            var result = new Dictionary<string, object?>();

            if (includeId)
                result["id"] = doc.Id;

            foreach (var pair in doc.ToDictionary())
            {
                if (pair.Key is "createdBy" or "ownerUid" ||
                    pair.Key.EndsWith("ObjectPath", StringComparison.Ordinal))
                    continue;

                if (pair.Value is Timestamp timestamp)
                    result[pair.Key] = timestamp.ToDateTime().ToString("O");
                else if (pair.Value is IEnumerable<object> items && pair.Value is not string)
                    result[pair.Key] = items.ToList();
                else
                    result[pair.Key] = pair.Value;
            }

            return result;
        }

        private static string GetString(
            Dictionary<string, object> data,
            string key,
            string fallback = "")
        {
            return data.TryGetValue(key, out var value)
                ? value?.ToString() ?? fallback
                : fallback;
        }

        private static List<string> GetStringList(
            Dictionary<string, object> data,
            string key)
        {
            if (!data.TryGetValue(key, out var value) || value is not IEnumerable<object> items)
                return new List<string>();

            return items
                .Select(item => item?.ToString() ?? string.Empty)
                .Where(item => !string.IsNullOrWhiteSpace(item))
                .ToList();
        }

        private static string GetTimestampIso(
            Dictionary<string, object> data,
            string key)
        {
            return data.TryGetValue(key, out var value) && value is Timestamp timestamp
                ? timestamp.ToDateTime().ToString("O")
                : string.Empty;
        }

        // =====================================================
        // 🧾 AUDIT LOGS (READ-ONLY)
        // =====================================================
        [HttpGet("audit-logs")]
        public async Task<IActionResult> GetAuditLogs(
            [FromQuery] string? companyId = null,
            [FromQuery] string? action = null,
            [FromQuery] string? actorRole = null,
            [FromQuery] string? dateFrom = null,
            [FromQuery] string? dateTo = null,
            [FromQuery] int limit = 100)
        {
            limit = Math.Clamp(limit, 1, 250);

            DateTimeOffset? from = null;
            DateTimeOffset? to = null;

            if (!string.IsNullOrWhiteSpace(dateFrom))
            {
                if (!DateTimeOffset.TryParse(dateFrom, out var parsedFrom))
                    return BadRequest(new { message = "dateFrom is invalid." });

                from = parsedFrom.ToUniversalTime();
            }

            if (!string.IsNullOrWhiteSpace(dateTo))
            {
                if (!DateTimeOffset.TryParse(dateTo, out var parsedTo))
                    return BadRequest(new { message = "dateTo is invalid." });

                // Date-only values should include the whole selected day.
                to = parsedTo.TimeOfDay == TimeSpan.Zero
                    ? parsedTo.Date.AddDays(1).AddTicks(-1)
                    : parsedTo;

                to = to.Value.ToUniversalTime();
            }

            if (from.HasValue && to.HasValue && to.Value < from.Value)
                return BadRequest(new { message = "dateTo cannot be before dateFrom." });

            // Read a bounded recent window and apply the optional filters in memory.
            // This avoids forcing compound Firestore indexes for every filter combination.
            var snapshot = await _firestore
                .Collection("auditLogs")
                .OrderByDescending("createdAt")
                .Limit(750)
                .GetSnapshotAsync();

            var logs = snapshot.Documents
                .Select(doc =>
                {
                    var data = doc.ToDictionary();
                    var createdAt = data.TryGetValue("createdAt", out var rawCreatedAt) &&
                                    rawCreatedAt is Timestamp timestamp
                        ? timestamp.ToDateTimeOffset()
                        : (DateTimeOffset?)null;

                    return new
                    {
                        Id = doc.Id,
                        Data = data,
                        CreatedAt = createdAt
                    };
                })
                .Where(item =>
                    string.IsNullOrWhiteSpace(companyId) ||
                    string.Equals(
                        GetString(item.Data, "companyId"),
                        companyId.Trim(),
                        StringComparison.OrdinalIgnoreCase))
                .Where(item =>
                    string.IsNullOrWhiteSpace(action) ||
                    string.Equals(
                        GetString(item.Data, "action"),
                        action.Trim(),
                        StringComparison.OrdinalIgnoreCase))
                .Where(item =>
                    string.IsNullOrWhiteSpace(actorRole) ||
                    string.Equals(
                        GetString(item.Data, "actorRole"),
                        actorRole.Trim(),
                        StringComparison.OrdinalIgnoreCase))
                .Where(item =>
                    !from.HasValue ||
                    (item.CreatedAt.HasValue && item.CreatedAt.Value >= from.Value))
                .Where(item =>
                    !to.HasValue ||
                    (item.CreatedAt.HasValue && item.CreatedAt.Value <= to.Value))
                .Take(limit)
                .Select(item => new Dictionary<string, object?>
                {
                    ["id"] = item.Id,
                    ["actorUid"] = GetString(item.Data, "actorUid"),
                    ["actorRole"] = GetString(item.Data, "actorRole"),
                    ["action"] = GetString(item.Data, "action"),
                    ["companyId"] = GetString(item.Data, "companyId"),
                    ["resourceType"] = GetString(item.Data, "resourceType"),
                    ["resourceId"] = GetString(item.Data, "resourceId"),
                    ["fromState"] = GetString(item.Data, "fromState"),
                    ["toState"] = GetString(item.Data, "toState"),
                    ["note"] = GetString(item.Data, "note"),
                    ["createdAt"] = GetTimestampIso(item.Data, "createdAt")
                })
                .ToList();

            return Ok(logs);
        }

        private async Task WriteAuditLogAsync(
            string actorUid,
            string actorRole,
            string action,
            string companyId,
            string resourceType,
            string resourceId,
            string? fromState = null,
            string? toState = null,
            string? note = null)
        {
            var auditRef = _firestore.Collection("auditLogs").Document();

            var data = new Dictionary<string, object>
            {
                { "actorUid", actorUid },
                { "actorRole", actorRole },
                { "action", action },
                { "companyId", companyId },
                { "resourceType", resourceType },
                { "resourceId", resourceId },
                { "createdAt", Timestamp.GetCurrentTimestamp() }
            };

            if (!string.IsNullOrWhiteSpace(fromState))
                data["fromState"] = fromState;

            if (!string.IsNullOrWhiteSpace(toState))
                data["toState"] = toState;

            if (!string.IsNullOrWhiteSpace(note))
                data["note"] = note.Trim();

            await auditRef.SetAsync(data);
        }

        // =====================================================
        // 🔥 GET UI TEXT (AUTO-CREATE IF NOT EXISTS)
        // =====================================================
        [HttpGet("ui-texts")]
        [AllowAnonymous] // ⚠️ TEMP: allow frontend access
        public async Task<IActionResult> GetUIText()
        {
            var docRef = _firestore
                .Collection("ui_texts")
                .Document("global");

            var doc = await docRef.GetSnapshotAsync();

            // ✅ AUTO CREATE
            if (!doc.Exists)
            {
                var defaultData = new Dictionary<string, object>
                {
                    { "productivityCoach", new Dictionary<string, string> {
                        { "en", "Productivity Coach" },
                        { "de", "Produktivitäts-Coach" }
                    }},
                    { "newChat", new Dictionary<string, string> {
                        { "en", "New Chat" },
                        { "de", "Neuer Chat" }
                    }},
                    { "recentConversations", new Dictionary<string, string> {
                        { "en", "Recent Conversations" },
                        { "de", "Letzte Gespräche" }
                    }},
                    { "aiProductivityCoach", new Dictionary<string, string> {
                        { "en", "Ey Eric! Make me Productive!" },
                        { "de", "KI Produktivitäts-Coach" }
                    }},
                    { "clear", new Dictionary<string, string> {
                        { "en", "Clear" },
                        { "de", "Löschen" }
                    }},
                    { "industryPlaceholder", new Dictionary<string, string> {
                        { "en", "Write your industry..." },
                        { "de", "Geben Sie Ihre Branche ein..." }
                    }},
                    { "jobPlaceholder", new Dictionary<string, string> {
                        { "en", "Tell about your job 3-5 sentences..." },
                        { "de", "Beschreiben Sie Ihren Job in 3-5 Sätzen..." }
                    }},
                    { "makeProductive", new Dictionary<string, string> {
                        { "en", "Make Me Productive" },
                        { "de", "Mach mich produktiv" }
                    }},
                    { "compare", new Dictionary<string, string> {
                        { "en", "Compare" },
                        { "de", "Vergleichen" }
                    }}
                };

                await docRef.SetAsync(defaultData);
                return Ok(defaultData);
            }

            return Ok(doc.ToDictionary());
        }

        // =====================================================
        // 💾 SAVE UI TEXT (ADMIN ONLY)
        // =====================================================
[HttpPost("ui-texts")]
public async Task<IActionResult> SaveUIText([FromBody] Dictionary<string, Dictionary<string, string>> data)
{
    var docRef = _firestore
        .Collection("ui_texts")
        .Document("global");

    await docRef.SetAsync(data);

    return Ok(new { success = true });
}

        // =====================================================
        // 📊 DASHBOARD (UNCHANGED)
        // =====================================================
        [HttpGet("dashboard")]
        public async Task<IActionResult> GetDashboard()
        {
            var usersSnapshot = await _firestore
                .Collection("users")
                .GetSnapshotAsync();

            int totalUsers = usersSnapshot.Count;
            int totalResponses = 0;

            // RBAC publisher accounts: active + revoked
            int grantedUsersTotal = 0;
            int grantedUsersActive = 0;
            int grantedUsersRevoked = 0;

            foreach (var userDoc in usersSnapshot.Documents)
            {
                var userData = userDoc.ToDictionary();
                var role = GetString(userData, "role").Trim().ToLowerInvariant();

                if (role != "publisher")
                    continue;

                grantedUsersTotal++;

                var status = GetString(userData, "status", "active").Trim().ToLowerInvariant();

                if (status == "disabled" || status == "revoked")
                    grantedUsersRevoked++;
                else
                    grantedUsersActive++;
            }

            // Provider profile moderation counts
            var companiesSnapshot = await _firestore
                .Collection("companies")
                .GetSnapshotAsync();

            int profilesTotal = companiesSnapshot.Count;
            int profilesPending = 0;
            int profilesApproved = 0;
            int profilesRejected = 0;

            foreach (var companyDoc in companiesSnapshot.Documents)
            {
                var companyData = companyDoc.ToDictionary();
                var moderationState = GetString(companyData, "moderationState", "draft")
                    .Trim()
                    .ToLowerInvariant();

                if (moderationState == "pending_review")
                    profilesPending++;
                else if (moderationState == "approved")
                    profilesApproved++;
                else if (moderationState == "rejected")
                    profilesRejected++;
            }

            var last7Days = new Dictionary<string, int>();

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
                    status = data.ContainsKey("status") ? data["status"]?.ToString() : "active",
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

                grantedUsersTotal,
                grantedUsersActive,
                grantedUsersRevoked,

                profilesTotal,
                profilesPending,
                profilesApproved,
                profilesRejected,

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