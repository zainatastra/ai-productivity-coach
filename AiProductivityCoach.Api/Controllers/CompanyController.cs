using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Google.Cloud.Firestore;
using System.Security.Claims;
using System.Text;
using System.Text.RegularExpressions;
using System.Globalization;
using System.Net;
using System.Net.Mail;
using AiProductivityCoach.Api.Services;

namespace AiProductivityCoach.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Policy = "PublisherOnly")]
    public class CompanyController : ControllerBase
    {
        private readonly FirestoreDb _firestore;
        private readonly ProviderMediaStorage _mediaStorage;

        public CompanyController(
            FirestoreDb firestore,
            ProviderMediaStorage mediaStorage)
        {
            _firestore = firestore;
            _mediaStorage = mediaStorage;
        }

        public class CreateCompanyDto
        {
            public string Name { get; set; } = string.Empty;
        }

        public class UpdateCompanyDto
        {
            public string Name { get; set; } = string.Empty;
            public string ShortDescription { get; set; } = string.Empty;
            public string WebsiteUrl { get; set; } = string.Empty;
            public string Email { get; set; } = string.Empty;
            public string Phone { get; set; } = string.Empty;
            public string Address { get; set; } = string.Empty;
            public List<string> Categories { get; set; } = new();

            // Media URLs are committed only by the trusted backend after a Vercel Blob upload is verified.
        }

        public class AboutDto
        {
            public string Headline { get; set; } = string.Empty;
            public string Overview { get; set; } = string.Empty;
            public string Mission { get; set; } = string.Empty;
            public string Vision { get; set; } = string.Empty;
            public string FoundedYear { get; set; } = string.Empty;
            public string EmployeeRange { get; set; } = string.Empty;
            public string Headquarters { get; set; } = string.Empty;
            public List<string> Specialties { get; set; } = new();
        }

        public class PostDto
        {
            public string Title { get; set; } = string.Empty;
            public string SubHeading { get; set; } = string.Empty;
            public string Excerpt { get; set; } = string.Empty;
            public string Body { get; set; } = string.Empty;
            public string VideoEmbedUrl { get; set; } = string.Empty;
        }

        public class WhitepaperDto
        {
            public string Title { get; set; } = string.Empty;
            public string Content { get; set; } = string.Empty;
        }

        public class ProductDto
        {
            public string Name { get; set; } = string.Empty;
            public string Category { get; set; } = string.Empty;
            public string ShortDescription { get; set; } = string.Empty;
            public List<string> Features { get; set; } = new();
        }

        public class ContactDto
        {
            public string FullName { get; set; } = string.Empty;
            public string JobTitle { get; set; } = string.Empty;
            public string Email { get; set; } = string.Empty;
            public string Phone { get; set; } = string.Empty;
            public string LinkedInUrl { get; set; } = string.Empty;
        }

        public class AppointmentDto
        {
            public string Title { get; set; } = string.Empty;
            public string StartAt { get; set; } = string.Empty;
            public string EndAt { get; set; } = string.Empty;
            public string Location { get; set; } = string.Empty;
            public string BookingUrl { get; set; } = string.Empty;
            public string Notes { get; set; } = string.Empty;
        }

        public class WebinarDto
        {
            public string Title { get; set; } = string.Empty;
            public string SubTitle { get; set; } = string.Empty;
            public string Content { get; set; } = string.Empty;
            public string SpeakerName { get; set; } = string.Empty;

            // Used only when the Publisher UI needs a real Firestore resource
            // before uploading banner/speaker media. Final saves still use the
            // strict validation in CreateWebinar / UpdateWebinar.
            public bool MediaDraft { get; set; }
        }

        public class EventDto
        {
            public string Title { get; set; } = string.Empty;
            public string Summary { get; set; } = string.Empty;
            public string StartDate { get; set; } = string.Empty;
            public string StartTime { get; set; } = string.Empty;
            public string EndDate { get; set; } = string.Empty;
            public string EndTime { get; set; } = string.Empty;
            public string Location { get; set; } = string.Empty;
            public string EventUrl { get; set; } = string.Empty;
            public string StartAt { get; set; } = string.Empty;
            public string EndAt { get; set; } = string.Empty;
        }

        // =====================================================
        // 🏢 COMPANY
        // =====================================================
        [HttpPost]
        public async Task<IActionResult> CreateCompany([FromBody] CreateCompanyDto request)
        {
            var publisherUid = GetPublisherUid();

            if (string.IsNullOrWhiteSpace(publisherUid))
                return Unauthorized();

            var name = Clean(request.Name);

            if (string.IsNullOrWhiteSpace(name))
                return BadRequest(new { message = "Company name is required." });

            if (name.Length > 160)
                return BadRequest(new { message = "Company name must be 160 characters or fewer." });

            var existingOwnedCompanies = await _firestore
                .Collection("companies")
                .WhereEqualTo("ownerUid", publisherUid)
                .GetSnapshotAsync();

            var normalizedName = NormalizeForComparison(name);

            var duplicate = existingOwnedCompanies.Documents.Any(doc =>
            {
                var data = doc.ToDictionary();
                return NormalizeForComparison(GetString(data, "name")) == normalizedName;
            });

            if (duplicate)
                return Conflict(new { message = "You already have a company with this name." });

            var baseSlug = CreateSlug(name);

            if (string.IsNullOrWhiteSpace(baseSlug))
                baseSlug = $"company-{Guid.NewGuid():N}".Substring(0, 16);

            var slug = await GenerateUniqueSlugAsync(baseSlug);
            var companyRef = _firestore.Collection("companies").Document();
            var now = Timestamp.GetCurrentTimestamp();

            await companyRef.SetAsync(new Dictionary<string, object>
            {
                { "name", name },
                { "slug", slug },
                { "ownerUid", publisherUid },
                { "status", "draft" },
                { "moderationState", "draft" },
                { "logoUrl", string.Empty },
                { "bannerUrl", string.Empty },
                { "createdBy", publisherUid },
                { "createdAt", now },
                { "updatedAt", now }
            });

            await WriteAuditLogAsync(
                publisherUid,
                "publisher",
                "company.created",
                companyRef.Id,
                "company",
                companyRef.Id,
                "none",
                "draft"
            );

            return StatusCode(StatusCodes.Status201Created, new
            {
                id = companyRef.Id,
                name,
                slug,
                ownerUid = publisherUid,
                status = "draft",
                moderationState = "draft",
                logoUrl = "",
                bannerUrl = ""
            });
        }

        [HttpGet("mine")]
        public async Task<IActionResult> GetMyCompanies()
        {
            var publisherUid = GetPublisherUid();

            if (string.IsNullOrWhiteSpace(publisherUid))
                return Unauthorized();

            var snapshot = await _firestore
                .Collection("companies")
                .WhereEqualTo("ownerUid", publisherUid)
                .GetSnapshotAsync();

            var companies = snapshot.Documents
                .Select(ToCompanySummary)
                .OrderByDescending(company => company.TryGetValue("createdAt", out var createdAt) ? createdAt?.ToString() : "")
                .ToList();

            return Ok(companies);
        }

        [HttpGet("{companyId}")]
        public async Task<IActionResult> GetCompany(string companyId)
        {
            var ownership = await GetOwnedCompanyAsync(companyId);
            if (ownership.Error != null) return ownership.Error;

            return Ok(ToCompanyDetails(ownership.Company!));
        }

        [HttpPut("{companyId}")]
        public async Task<IActionResult> UpdateCompany(
            string companyId,
            [FromBody] UpdateCompanyDto request)
        {
            var ownership = await GetOwnedCompanyAsync(companyId);
            if (ownership.Error != null) return ownership.Error;

            var companyDoc = ownership.Company!;

            var mutationError = await PrepareForPublisherMutationAsync(companyDoc);
            if (mutationError != null) return mutationError;

            // Re-read after workflow normalization so returned state stays accurate.
            companyDoc = await companyDoc.Reference.GetSnapshotAsync();
            var existingData = companyDoc.ToDictionary();

            var name = Clean(request.Name);
            var shortDescription = Clean(request.ShortDescription);
            var websiteUrl = Clean(request.WebsiteUrl);
            var email = Clean(request.Email).ToLowerInvariant();
            var phone = Clean(request.Phone);
            var address = Clean(request.Address);
            var categories = CleanList(request.Categories);

            if (string.IsNullOrWhiteSpace(name))
                return BadRequest(new { message = "Company name is required." });
            if (name.Length > 160)
                return BadRequest(new { message = "Company name must be 160 characters or fewer." });
            if (shortDescription.Length > 500)
                return BadRequest(new { message = "Short description must be 500 characters or fewer." });
            if (websiteUrl.Length > 300 || !IsValidOptionalUrl(websiteUrl))
                return BadRequest(new { message = "Enter a valid website URL beginning with http:// or https://." });
            if (email.Length > 254 || (!string.IsNullOrWhiteSpace(email) && !IsValidEmail(email)))
                return BadRequest(new { message = "Enter a valid company email address." });
            if (phone.Length > 50)
                return BadRequest(new { message = "Phone number must be 50 characters or fewer." });
            if (address.Length > 300)
                return BadRequest(new { message = "Address must be 300 characters or fewer." });
            if (categories.Count > 10 || categories.Any(category => category.Length > 80))
                return BadRequest(new { message = "Use up to 10 categories, each 80 characters or fewer." });

            var ownedCompanies = await _firestore
                .Collection("companies")
                .WhereEqualTo("ownerUid", GetPublisherUid())
                .GetSnapshotAsync();

            var duplicateName = ownedCompanies.Documents.Any(doc =>
                !string.Equals(doc.Id, companyId, StringComparison.Ordinal) &&
                NormalizeForComparison(GetString(doc.ToDictionary(), "name")) ==
                NormalizeForComparison(name));

            if (duplicateName)
                return Conflict(new { message = "You already have another company with this name." });

            var updates = new Dictionary<string, object>
            {
                { "name", name },
                { "shortDescription", shortDescription },
                { "websiteUrl", websiteUrl },
                { "email", email },
                { "phone", phone },
                { "address", address },
                { "categories", categories },
                { "updatedAt", Timestamp.GetCurrentTimestamp() }
            };

            var existingName = GetString(existingData, "name");

            if (!string.Equals(
                    NormalizeForComparison(existingName),
                    NormalizeForComparison(name),
                    StringComparison.Ordinal))
            {
                var baseSlug = CreateSlug(name);

                if (string.IsNullOrWhiteSpace(baseSlug))
                    baseSlug = $"company-{Guid.NewGuid():N}".Substring(0, 16);

                updates["slug"] = await GenerateUniqueSlugAsync(baseSlug, companyId);
            }

            await companyDoc.Reference.UpdateAsync(updates);

            await WriteAuditLogAsync(
                GetPublisherUid()!,
                "publisher",
                "company.updated",
                companyId,
                "company",
                companyId,
                null,
                null
            );

            var updatedDoc = await companyDoc.Reference.GetSnapshotAsync();
            return Ok(ToCompanyDetails(updatedDoc));
        }

        // =====================================================
        // 🧾 ABOUT
        // companies/{companyId}/about/profile
        // =====================================================
        [HttpGet("{companyId}/about")]
        public async Task<IActionResult> GetAbout(string companyId)
        {
            var ownership = await GetOwnedCompanyAsync(companyId);
            if (ownership.Error != null) return ownership.Error;

            var doc = await ownership.Company!.Reference
                .Collection("about")
                .Document("profile")
                .GetSnapshotAsync();

            if (!doc.Exists)
            {
                return Ok(new
                {
                    headline = "",
                    overview = "",
                    mission = "",
                    vision = "",
                    foundedYear = "",
                    employeeRange = "",
                    headquarters = "",
                    specialties = Array.Empty<string>()
                });
            }

            return Ok(ToApiDocument(doc, false));
        }

        [HttpPut("{companyId}/about")]
        public async Task<IActionResult> SaveAbout(
            string companyId,
            [FromBody] AboutDto request)
        {
            var ownership = await GetOwnedCompanyAsync(companyId);
            if (ownership.Error != null) return ownership.Error;

            var mutationError = await PrepareForPublisherMutationAsync(ownership.Company!);
            if (mutationError != null) return mutationError;

            var headline = Clean(request.Headline);
            var overview = Clean(request.Overview);
            var mission = Clean(request.Mission);
            var vision = Clean(request.Vision);
            var foundedYear = Clean(request.FoundedYear);
            var employeeRange = Clean(request.EmployeeRange);
            var headquarters = Clean(request.Headquarters);
            var specialties = CleanList(request.Specialties);

            if (headline.Length > 180)
                return BadRequest(new { message = "Headline must be 180 characters or fewer." });
            if (overview.Length > 4000 || mission.Length > 2000 || vision.Length > 2000)
                return BadRequest(new { message = "About text exceeds the allowed length." });
            if (foundedYear.Length > 20 || employeeRange.Length > 80 || headquarters.Length > 200)
                return BadRequest(new { message = "One or more About fields are too long." });

            if (!string.IsNullOrWhiteSpace(foundedYear))
            {
                if (!int.TryParse(foundedYear, out var parsedYear) ||
                    parsedYear < 1600 ||
                    parsedYear > DateTime.UtcNow.Year)
                {
                    return BadRequest(new
                    {
                        message = $"Founded year must be between 1600 and {DateTime.UtcNow.Year}."
                    });
                }
            }
            if (specialties.Count > 20 || specialties.Any(item => item.Length > 80))
                return BadRequest(new { message = "Use up to 20 specialties, each 80 characters or fewer." });

            var publisherUid = GetPublisherUid()!;
            var docRef = ownership.Company!.Reference.Collection("about").Document("profile");
            var existing = await docRef.GetSnapshotAsync();
            var now = Timestamp.GetCurrentTimestamp();

            var data = new Dictionary<string, object>
            {
                { "headline", headline },
                { "overview", overview },
                { "mission", mission },
                { "vision", vision },
                { "foundedYear", foundedYear },
                { "employeeRange", employeeRange },
                { "headquarters", headquarters },
                { "specialties", specialties },
                { "updatedAt", now }
            };

            if (!existing.Exists)
            {
                data["createdAt"] = now;
                data["createdBy"] = publisherUid;
            }

            await docRef.SetAsync(data, SetOptions.MergeAll);

            await WriteAuditLogAsync(
                publisherUid,
                "publisher",
                existing.Exists ? "about.updated" : "about.created",
                companyId,
                "about",
                "profile",
                null,
                null
            );

            var saved = await docRef.GetSnapshotAsync();

            return Ok(ToApiDocument(saved, false));
        }

        // =====================================================
        // 📰 POSTS
        // =====================================================
        [HttpGet("{companyId}/posts")]
        public Task<IActionResult> GetPosts(string companyId) =>
            ListResourcesAsync(companyId, "posts");

        [HttpPost("{companyId}/posts")]
        public async Task<IActionResult> CreatePost(string companyId, [FromBody] PostDto request)
        {
            var title = Clean(request.Title);
            var subHeading = Clean(request.SubHeading);
            var excerpt = Clean(request.Excerpt);
            var body = SanitizePostBody(request.Body);
            var rawVideoEmbedUrl = Clean(request.VideoEmbedUrl);
            var videoEmbedUrl = NormalizeVideoEmbedUrl(rawVideoEmbedUrl);

            if (!string.IsNullOrWhiteSpace(rawVideoEmbedUrl) &&
                string.IsNullOrWhiteSpace(videoEmbedUrl))
            {
                return BadRequest(
                    "Use a supported video URL from YouTube, Vimeo, Loom, Dailymotion or Wistia.");
            }

            if (string.IsNullOrWhiteSpace(title) || title.Length > 180)
                return BadRequest("Post title is required and must be 180 characters or fewer.");
            if (subHeading.Length > 320)
                return BadRequest("Post sub-heading must be 320 characters or fewer.");
            if (excerpt.Length > 500 || body.Length > 60000)
                return BadRequest("Post content exceeds the allowed length.");
            if (CountPostContentImages(body) > 15)
                return BadRequest("A maximum of 15 images is allowed inside post content.");

            var slug = await GenerateUniquePostSlugAsync(companyId, title);

            return await CreateResourceAsync(companyId, "posts", new Dictionary<string, object>
            {
                { "title", title },
                { "slug", slug },
                { "subHeading", subHeading },
                { "excerpt", excerpt },
                { "body", body },
                { "videoEmbedUrl", videoEmbedUrl },
                { "imageUrl", string.Empty },
                { "galleryMedia", new List<Dictionary<string, object>>() },
                { "contentMedia", new List<Dictionary<string, object>>() }
            });
        }

        [HttpPut("{companyId}/posts/{resourceId}")]
        public async Task<IActionResult> UpdatePost(string companyId, string resourceId, [FromBody] PostDto request)
        {
            var title = Clean(request.Title);
            var subHeading = Clean(request.SubHeading);
            var excerpt = Clean(request.Excerpt);
            var body = SanitizePostBody(request.Body);
            var rawVideoEmbedUrl = Clean(request.VideoEmbedUrl);
            var videoEmbedUrl = NormalizeVideoEmbedUrl(rawVideoEmbedUrl);

            if (!string.IsNullOrWhiteSpace(rawVideoEmbedUrl) &&
                string.IsNullOrWhiteSpace(videoEmbedUrl))
            {
                return BadRequest(
                    "Use a supported video URL from YouTube, Vimeo, Loom, Dailymotion or Wistia.");
            }

            if (string.IsNullOrWhiteSpace(title) || title.Length > 180)
                return BadRequest("Post title is required and must be 180 characters or fewer.");
            if (subHeading.Length > 320)
                return BadRequest("Post sub-heading must be 320 characters or fewer.");
            if (excerpt.Length > 500 || body.Length > 60000)
                return BadRequest("Post content exceeds the allowed length.");
            if (CountPostContentImages(body) > 15)
                return BadRequest("A maximum of 15 images is allowed inside post content.");

            var slug = await GenerateUniquePostSlugAsync(companyId, title, resourceId);

            return await UpdateResourceAsync(companyId, "posts", resourceId, new Dictionary<string, object>
            {
                { "title", title },
                { "slug", slug },
                { "subHeading", subHeading },
                { "excerpt", excerpt },
                { "body", body },
                { "videoEmbedUrl", videoEmbedUrl }
            });
        }

        [HttpDelete("{companyId}/posts/{resourceId}")]
        public Task<IActionResult> DeletePost(string companyId, string resourceId) =>
            DeleteResourceAsync(companyId, "posts", resourceId);

        // =====================================================
        // 📄 WHITEPAPERS
        // =====================================================
        [HttpGet("{companyId}/whitepapers")]
        public Task<IActionResult> GetWhitepapers(string companyId) =>
            ListResourcesAsync(companyId, "whitepapers");

        [HttpPost("{companyId}/whitepapers")]
        public Task<IActionResult> CreateWhitepaper(string companyId, [FromBody] WhitepaperDto request)
        {
            var title = Clean(request.Title);
            var content = SanitizeWhitepaperBody(request.Content);

            if (string.IsNullOrWhiteSpace(title) || title.Length > 180)
                return BadRequestTask("Whitepaper title is required and must be 180 characters or fewer.");
            if (content.Length > 60000)
                return BadRequestTask("Whitepaper content exceeds the allowed length.");

            return CreateResourceAsync(companyId, "whitepapers", new Dictionary<string, object>
            {
                { "title", title },
                { "content", content },
                { "imageUrl", string.Empty }
            });
        }

        [HttpPut("{companyId}/whitepapers/{resourceId}")]
        public Task<IActionResult> UpdateWhitepaper(string companyId, string resourceId, [FromBody] WhitepaperDto request)
        {
            var title = Clean(request.Title);
            var content = SanitizeWhitepaperBody(request.Content);

            if (string.IsNullOrWhiteSpace(title) || title.Length > 180)
                return BadRequestTask("Whitepaper title is required and must be 180 characters or fewer.");
            if (content.Length > 60000)
                return BadRequestTask("Whitepaper content exceeds the allowed length.");

            return UpdateResourceAsync(companyId, "whitepapers", resourceId, new Dictionary<string, object>
            {
                { "title", title },
                { "content", content }
            });
        }

        [HttpDelete("{companyId}/whitepapers/{resourceId}")]
        public Task<IActionResult> DeleteWhitepaper(string companyId, string resourceId) =>
            DeleteResourceAsync(companyId, "whitepapers", resourceId);

        // =====================================================
        // 📦 PRODUCTS
        // =====================================================
        [HttpGet("{companyId}/products")]
        public Task<IActionResult> GetProducts(string companyId) =>
            ListResourcesAsync(companyId, "products");

        [HttpPost("{companyId}/products")]
        public Task<IActionResult> CreateProduct(string companyId, [FromBody] ProductDto request)
        {
            var name = Clean(request.Name);
            var category = Clean(request.Category);
            var shortDescription = Clean(request.ShortDescription);
            var features = CleanList(request.Features);

            if (string.IsNullOrWhiteSpace(name) || name.Length > 180)
                return BadRequestTask("Product name is required and must be 180 characters or fewer.");
            if (string.IsNullOrWhiteSpace(category) || category.Length > 120)
                return BadRequestTask("Product category is required and must be 120 characters or fewer.");
            if (string.IsNullOrWhiteSpace(shortDescription) || shortDescription.Length > 1200)
                return BadRequestTask("Brief description is required and must be 1200 characters or fewer.");
            if (features.Count > 30 || features.Any(feature => feature.Length > 100))
                return BadRequestTask("Use up to 30 product features, each 100 characters or fewer.");

            return CreateResourceAsync(companyId, "products", new Dictionary<string, object>
            {
                { "name", name },
                { "category", category },
                { "shortDescription", shortDescription },
                { "features", features }
            });
        }

        [HttpPut("{companyId}/products/{resourceId}")]
        public Task<IActionResult> UpdateProduct(string companyId, string resourceId, [FromBody] ProductDto request)
        {
            var name = Clean(request.Name);
            var category = Clean(request.Category);
            var shortDescription = Clean(request.ShortDescription);
            var features = CleanList(request.Features);

            if (string.IsNullOrWhiteSpace(name) || name.Length > 180)
                return BadRequestTask("Product name is required and must be 180 characters or fewer.");
            if (string.IsNullOrWhiteSpace(category) || category.Length > 120)
                return BadRequestTask("Product category is required and must be 120 characters or fewer.");
            if (string.IsNullOrWhiteSpace(shortDescription) || shortDescription.Length > 1200)
                return BadRequestTask("Brief description is required and must be 1200 characters or fewer.");
            if (features.Count > 30 || features.Any(feature => feature.Length > 100))
                return BadRequestTask("Use up to 30 product features, each 100 characters or fewer.");

            return UpdateResourceAsync(companyId, "products", resourceId, new Dictionary<string, object>
            {
                { "name", name },
                { "category", category },
                { "shortDescription", shortDescription },
                { "features", features }
            });
        }

        [HttpDelete("{companyId}/products/{resourceId}")]
        public Task<IActionResult> DeleteProduct(string companyId, string resourceId) =>
            DeleteResourceAsync(companyId, "products", resourceId);

        // 👤 CONTACTS
        // =====================================================
        [HttpGet("{companyId}/contacts")]
        public Task<IActionResult> GetContacts(string companyId) =>
            ListResourcesAsync(companyId, "contacts");

        [HttpPost("{companyId}/contacts")]
        public Task<IActionResult> CreateContact(string companyId, [FromBody] ContactDto request)
        {
            var fullName = Clean(request.FullName);
            var jobTitle = Clean(request.JobTitle);
            var email = Clean(request.Email).ToLowerInvariant();
            var phone = Clean(request.Phone);
            var linkedInUrl = Clean(request.LinkedInUrl);

            if (string.IsNullOrWhiteSpace(fullName) || fullName.Length > 160)
                return BadRequestTask("Contact name is required and must be 160 characters or fewer.");
            if (jobTitle.Length > 160 || phone.Length > 50)
                return BadRequestTask("One or more contact fields are too long.");
            if (!string.IsNullOrWhiteSpace(email) && !IsValidEmail(email))
                return BadRequestTask("Enter a valid contact email.");
            if (!IsValidOptionalUrl(linkedInUrl))
                return BadRequestTask("Enter a valid LinkedIn URL.");

            return CreateResourceAsync(companyId, "contacts", new Dictionary<string, object>
            {
                { "fullName", fullName },
                { "jobTitle", jobTitle },
                { "email", email },
                { "phone", phone },
                { "linkedInUrl", linkedInUrl },
                { "photoUrl", string.Empty }
            });
        }

        [HttpPut("{companyId}/contacts/{resourceId}")]
        public Task<IActionResult> UpdateContact(string companyId, string resourceId, [FromBody] ContactDto request)
        {
            var fullName = Clean(request.FullName);
            var jobTitle = Clean(request.JobTitle);
            var email = Clean(request.Email).ToLowerInvariant();
            var phone = Clean(request.Phone);
            var linkedInUrl = Clean(request.LinkedInUrl);

            if (string.IsNullOrWhiteSpace(fullName) || fullName.Length > 160)
                return BadRequestTask("Contact name is required and must be 160 characters or fewer.");
            if (jobTitle.Length > 160 || phone.Length > 50)
                return BadRequestTask("One or more contact fields are too long.");
            if (!string.IsNullOrWhiteSpace(email) && !IsValidEmail(email))
                return BadRequestTask("Enter a valid contact email.");
            if (!IsValidOptionalUrl(linkedInUrl))
                return BadRequestTask("Enter a valid LinkedIn URL.");

            return UpdateResourceAsync(companyId, "contacts", resourceId, new Dictionary<string, object>
            {
                { "fullName", fullName },
                { "jobTitle", jobTitle },
                { "email", email },
                { "phone", phone },
                { "linkedInUrl", linkedInUrl }
            });
        }

        [HttpDelete("{companyId}/contacts/{resourceId}")]
        public Task<IActionResult> DeleteContact(string companyId, string resourceId) =>
            DeleteResourceAsync(companyId, "contacts", resourceId);

        // =====================================================
        // 📅 CALENDAR / APPOINTMENTS
        // =====================================================
        [HttpGet("{companyId}/appointments")]
        public Task<IActionResult> GetAppointments(string companyId) =>
            ListResourcesAsync(companyId, "appointments");

        [HttpPost("{companyId}/appointments")]
        public Task<IActionResult> CreateAppointment(string companyId, [FromBody] AppointmentDto request)
        {
            var title = Clean(request.Title);
            var startAt = Clean(request.StartAt);
            var endAt = Clean(request.EndAt);
            var location = Clean(request.Location);
            var bookingUrl = Clean(request.BookingUrl);
            var notes = Clean(request.Notes);

            if (string.IsNullOrWhiteSpace(title) || title.Length > 180)
                return BadRequestTask("Appointment title is required and must be 180 characters or fewer.");
            if (location.Length > 250 || notes.Length > 2000 || !IsValidOptionalUrl(bookingUrl))
                return BadRequestTask("One or more appointment fields are invalid.");

            var dateError = ValidateDateRange(startAt, endAt, "appointment");
            if (dateError != null) return BadRequestTask(dateError);

            return CreateResourceAsync(companyId, "appointments", new Dictionary<string, object>
            {
                { "title", title },
                { "startAt", startAt },
                { "endAt", endAt },
                { "location", location },
                { "bookingUrl", bookingUrl },
                { "notes", notes }
            });
        }

        [HttpPut("{companyId}/appointments/{resourceId}")]
        public Task<IActionResult> UpdateAppointment(string companyId, string resourceId, [FromBody] AppointmentDto request)
        {
            var title = Clean(request.Title);
            var startAt = Clean(request.StartAt);
            var endAt = Clean(request.EndAt);
            var location = Clean(request.Location);
            var bookingUrl = Clean(request.BookingUrl);
            var notes = Clean(request.Notes);

            if (string.IsNullOrWhiteSpace(title) || title.Length > 180)
                return BadRequestTask("Appointment title is required and must be 180 characters or fewer.");
            if (location.Length > 250 || notes.Length > 2000 || !IsValidOptionalUrl(bookingUrl))
                return BadRequestTask("One or more appointment fields are invalid.");

            var dateError = ValidateDateRange(startAt, endAt, "appointment");
            if (dateError != null) return BadRequestTask(dateError);

            return UpdateResourceAsync(companyId, "appointments", resourceId, new Dictionary<string, object>
            {
                { "title", title },
                { "startAt", startAt },
                { "endAt", endAt },
                { "location", location },
                { "bookingUrl", bookingUrl },
                { "notes", notes }
            });
        }

        [HttpDelete("{companyId}/appointments/{resourceId}")]
        public Task<IActionResult> DeleteAppointment(string companyId, string resourceId) =>
            DeleteResourceAsync(companyId, "appointments", resourceId);

        // =====================================================
        // 🎥 WEBINARS
        // =====================================================
        [HttpGet("{companyId}/webinars")]
        public Task<IActionResult> GetWebinars(string companyId) =>
            ListResourcesAsync(companyId, "webinars");

        [HttpPost("{companyId}/webinars")]
        public Task<IActionResult> CreateWebinar(string companyId, [FromBody] WebinarDto request)
        {
            var title = Clean(request.Title);
            var subTitle = Clean(request.SubTitle);
            var content = SanitizeWhitepaperBody(request.Content);
            var speakerName = Clean(request.SpeakerName);

            if (string.IsNullOrWhiteSpace(title) || title.Length > 180)
                return BadRequestTask("Webinar title is required and must be 180 characters or fewer.");

            if (request.MediaDraft)
            {
                // Media upload needs a real webinar document first so Vercel Blob
                // can commit against a verified owned resource. Keep this draft
                // intentionally incomplete; UpdateWebinar remains strict.
                if (subTitle.Length > 320)
                    return BadRequestTask("Webinar sub-title must be 320 characters or fewer.");
                if (content.Length > 60000)
                    return BadRequestTask("Webinar content must be 60000 characters or fewer.");
                if (speakerName.Length > 180)
                    return BadRequestTask("Speaker name must be 180 characters or fewer.");
            }
            else
            {
                if (string.IsNullOrWhiteSpace(subTitle) || subTitle.Length > 320)
                    return BadRequestTask("Webinar sub-title is required and must be 320 characters or fewer.");
                if (string.IsNullOrWhiteSpace(content) || content.Length > 60000)
                    return BadRequestTask("Webinar content is required and must be 60000 characters or fewer.");
                if (string.IsNullOrWhiteSpace(speakerName) || speakerName.Length > 180)
                    return BadRequestTask("Speaker name is required and must be 180 characters or fewer.");
            }

            return CreateResourceAsync(companyId, "webinars", new Dictionary<string, object>
            {
                { "title", title },
                { "subTitle", subTitle },
                { "content", content },
                { "speakerName", speakerName },
                { "bannerUrl", string.Empty },
                { "speakerImageUrl", string.Empty }
            });
        }

        [HttpPut("{companyId}/webinars/{resourceId}")]
        public Task<IActionResult> UpdateWebinar(string companyId, string resourceId, [FromBody] WebinarDto request)
        {
            var title = Clean(request.Title);
            var subTitle = Clean(request.SubTitle);
            var content = SanitizeWhitepaperBody(request.Content);
            var speakerName = Clean(request.SpeakerName);

            if (string.IsNullOrWhiteSpace(title) || title.Length > 180)
                return BadRequestTask("Webinar title is required and must be 180 characters or fewer.");
            if (string.IsNullOrWhiteSpace(subTitle) || subTitle.Length > 320)
                return BadRequestTask("Webinar sub-title is required and must be 320 characters or fewer.");
            if (string.IsNullOrWhiteSpace(content) || content.Length > 60000)
                return BadRequestTask("Webinar content is required and must be 60000 characters or fewer.");
            if (string.IsNullOrWhiteSpace(speakerName) || speakerName.Length > 180)
                return BadRequestTask("Speaker name is required and must be 180 characters or fewer.");

            return UpdateResourceAsync(companyId, "webinars", resourceId, new Dictionary<string, object>
            {
                { "title", title },
                { "subTitle", subTitle },
                { "content", content },
                { "speakerName", speakerName }
            });
        }

        [HttpDelete("{companyId}/webinars/{resourceId}")]
        public Task<IActionResult> DeleteWebinar(string companyId, string resourceId) =>
            DeleteResourceAsync(companyId, "webinars", resourceId);

        // ✨ EVENTS
        // =====================================================
        [HttpGet("{companyId}/events")]
        public Task<IActionResult> GetEvents(string companyId) =>
            ListResourcesAsync(companyId, "events");

        [HttpPost("{companyId}/events")]
        public Task<IActionResult> CreateEvent(string companyId, [FromBody] EventDto request)
        {
            var title = Clean(request.Title);
            var summary = Clean(request.Summary);
            var startDate = Clean(request.StartDate);
            var startTime = Clean(request.StartTime);
            var endDate = Clean(request.EndDate);
            var endTime = Clean(request.EndTime);
            var location = Clean(request.Location);
            var eventUrl = Clean(request.EventUrl);

            ApplyLegacyEventDateTimeFallback(request, ref startDate, ref startTime, ref endDate, ref endTime);

            if (string.IsNullOrWhiteSpace(title) || title.Length > 180)
                return BadRequestTask("Event title is required and must be 180 characters or fewer.");
            if (string.IsNullOrWhiteSpace(location) || location.Length > 250)
                return BadRequestTask("Event location is required and must be 250 characters or fewer.");
            if (summary.Length > 3000 || !IsValidOptionalUrl(eventUrl))
                return BadRequestTask("One or more event fields are invalid.");

            var scheduleError = ValidateEventSchedule(startDate, startTime, endDate, endTime);
            if (scheduleError != null) return BadRequestTask(scheduleError);

            var startAt = $"{startDate}T{startTime}";
            var endAt = $"{endDate}T{endTime}";

            return CreateResourceAsync(companyId, "events", new Dictionary<string, object>
            {
                { "title", title },
                { "summary", summary },
                { "startDate", startDate },
                { "startTime", startTime },
                { "endDate", endDate },
                { "endTime", endTime },
                { "startAt", startAt },
                { "endAt", endAt },
                { "location", location },
                { "eventUrl", eventUrl },
                { "imageUrl", string.Empty }
            });
        }

        [HttpPut("{companyId}/events/{resourceId}")]
        public Task<IActionResult> UpdateEvent(string companyId, string resourceId, [FromBody] EventDto request)
        {
            var title = Clean(request.Title);
            var summary = Clean(request.Summary);
            var startDate = Clean(request.StartDate);
            var startTime = Clean(request.StartTime);
            var endDate = Clean(request.EndDate);
            var endTime = Clean(request.EndTime);
            var location = Clean(request.Location);
            var eventUrl = Clean(request.EventUrl);

            ApplyLegacyEventDateTimeFallback(request, ref startDate, ref startTime, ref endDate, ref endTime);

            if (string.IsNullOrWhiteSpace(title) || title.Length > 180)
                return BadRequestTask("Event title is required and must be 180 characters or fewer.");
            if (string.IsNullOrWhiteSpace(location) || location.Length > 250)
                return BadRequestTask("Event location is required and must be 250 characters or fewer.");
            if (summary.Length > 3000 || !IsValidOptionalUrl(eventUrl))
                return BadRequestTask("One or more event fields are invalid.");

            var scheduleError = ValidateEventSchedule(startDate, startTime, endDate, endTime);
            if (scheduleError != null) return BadRequestTask(scheduleError);

            var startAt = $"{startDate}T{startTime}";
            var endAt = $"{endDate}T{endTime}";

            return UpdateResourceAsync(companyId, "events", resourceId, new Dictionary<string, object>
            {
                { "title", title },
                { "summary", summary },
                { "startDate", startDate },
                { "startTime", startTime },
                { "endDate", endDate },
                { "endTime", endTime },
                { "startAt", startAt },
                { "endAt", endAt },
                { "location", location },
                { "eventUrl", eventUrl }
            });
        }

        [HttpDelete("{companyId}/events/{resourceId}")]
        public Task<IActionResult> DeleteEvent(string companyId, string resourceId) =>
            DeleteResourceAsync(companyId, "events", resourceId);

        // 📤 PREVIEW / SUBMISSION FOUNDATION
        // =====================================================
        [HttpPost("{companyId}/submit")]
        public async Task<IActionResult> SubmitForReview(string companyId)
        {
            var ownership = await GetOwnedCompanyAsync(companyId);
            if (ownership.Error != null) return ownership.Error;

            var companyDoc = ownership.Company!;
            var data = companyDoc.ToDictionary();
            var moderationState = GetString(data, "moderationState", "draft");

            if (string.Equals(moderationState, "pending_review", StringComparison.OrdinalIgnoreCase))
                return Conflict(new { message = "This company profile is already pending review." });

            var allowedSubmitStates = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "draft",
                "changes_requested",
                "rejected"
            };

            if (!allowedSubmitStates.Contains(moderationState))
            {
                return Conflict(new
                {
                    message = $"A profile in '{moderationState}' state cannot be submitted for review."
                });
            }

            var now = Timestamp.GetCurrentTimestamp();

            var submissionUpdates = new Dictionary<string, object>
            {
                { "moderationState", "pending_review" },
                { "submittedAt", now },
                { "updatedAt", now },
                { "revisionNote", FieldValue.Delete },
                { "rejectionNote", FieldValue.Delete }
            };

            // Keep status = published when an already-approved profile has a new
            // revision submitted. The last approved snapshot can therefore stay
            // available publicly until the new revision is approved.
            if (string.Equals(GetString(data, "status", "draft"), "published", StringComparison.OrdinalIgnoreCase))
            {
                submissionUpdates["revisionSubmittedAt"] = now;
            }

            await companyDoc.Reference.UpdateAsync(submissionUpdates);

            await WriteAuditLogAsync(
                GetPublisherUid()!,
                "publisher",
                string.Equals(moderationState, "draft", StringComparison.OrdinalIgnoreCase)
                    ? "company.submitted"
                    : "company.resubmitted",
                companyId,
                "company",
                companyId,
                moderationState,
                "pending_review"
            );

            var updated = await companyDoc.Reference.GetSnapshotAsync();
            return Ok(ToCompanyDetails(updated));
        }

        // =====================================================
        // 🔐 OWNERSHIP + RESOURCE HELPERS
        // =====================================================
        private async Task<(DocumentSnapshot? Company, IActionResult? Error)> GetOwnedCompanyAsync(string companyId)
        {
            var publisherUid = GetPublisherUid();

            if (string.IsNullOrWhiteSpace(publisherUid))
                return (null, Unauthorized());

            if (string.IsNullOrWhiteSpace(companyId))
                return (null, BadRequest(new { message = "Company ID is required." }));

            var companyDoc = await _firestore
                .Collection("companies")
                .Document(companyId)
                .GetSnapshotAsync();

            if (!companyDoc.Exists)
                return (null, NotFound(new { message = "Company not found." }));

            var ownerUid = GetString(companyDoc.ToDictionary(), "ownerUid");

            if (!string.Equals(ownerUid, publisherUid, StringComparison.Ordinal))
                return (null, Forbid());

            return (companyDoc, null);
        }

        private async Task<IActionResult> ListResourcesAsync(
            string companyId,
            string collectionName)
        {
            var ownership = await GetOwnedCompanyAsync(companyId);
            if (ownership.Error != null) return ownership.Error;

            var snapshot = await ownership.Company!.Reference
                .Collection(collectionName)
                .GetSnapshotAsync();

            var items = snapshot.Documents
                .Select(doc => ToApiDocument(doc))
                .OrderByDescending(item => item.TryGetValue("updatedAt", out var updatedAt) ? updatedAt?.ToString() : "")
                .ToList();

            return Ok(items);
        }

        private async Task<IActionResult> CreateResourceAsync(
            string companyId,
            string collectionName,
            Dictionary<string, object> fields)
        {
            var ownership = await GetOwnedCompanyAsync(companyId);
            if (ownership.Error != null) return ownership.Error;

            var mutationError = await PrepareForPublisherMutationAsync(ownership.Company!);
            if (mutationError != null) return mutationError;

            var publisherUid = GetPublisherUid()!;
            var now = Timestamp.GetCurrentTimestamp();
            var docRef = ownership.Company!.Reference.Collection(collectionName).Document();

            fields["status"] = "draft";
            fields["createdBy"] = publisherUid;
            fields["createdAt"] = now;
            fields["updatedAt"] = now;

            await docRef.SetAsync(fields);

            await WriteAuditLogAsync(
                publisherUid,
                "publisher",
                $"{collectionName}.created",
                companyId,
                collectionName,
                docRef.Id,
                null,
                null
            );

            var saved = await docRef.GetSnapshotAsync();

            return StatusCode(StatusCodes.Status201Created, ToApiDocument(saved));
        }

        private async Task<IActionResult> UpdateResourceAsync(
            string companyId,
            string collectionName,
            string resourceId,
            Dictionary<string, object> fields)
        {
            var ownership = await GetOwnedCompanyAsync(companyId);
            if (ownership.Error != null) return ownership.Error;

            var mutationError = await PrepareForPublisherMutationAsync(ownership.Company!);
            if (mutationError != null) return mutationError;

            if (string.IsNullOrWhiteSpace(resourceId))
                return BadRequest(new { message = "Resource ID is required." });

            var docRef = ownership.Company!.Reference
                .Collection(collectionName)
                .Document(resourceId);

            var existing = await docRef.GetSnapshotAsync();

            if (!existing.Exists)
                return NotFound(new { message = "Resource not found." });

            fields["updatedAt"] = Timestamp.GetCurrentTimestamp();

            await docRef.UpdateAsync(fields);

            await WriteAuditLogAsync(
                GetPublisherUid()!,
                "publisher",
                $"{collectionName}.updated",
                companyId,
                collectionName,
                resourceId,
                null,
                null
            );

            var saved = await docRef.GetSnapshotAsync();

            return Ok(ToApiDocument(saved));
        }

        private async Task<IActionResult> DeleteResourceAsync(
            string companyId,
            string collectionName,
            string resourceId)
        {
            var ownership = await GetOwnedCompanyAsync(companyId);
            if (ownership.Error != null) return ownership.Error;

            var mutationError = await PrepareForPublisherMutationAsync(ownership.Company!);
            if (mutationError != null) return mutationError;

            if (string.IsNullOrWhiteSpace(resourceId))
                return BadRequest(new { message = "Resource ID is required." });

            var docRef = ownership.Company!.Reference
                .Collection(collectionName)
                .Document(resourceId);

            var existing = await docRef.GetSnapshotAsync();

            if (!existing.Exists)
                return NotFound(new { message = "Resource not found." });

            var resourceData = existing.ToDictionary();

            foreach (var objectPathField in new[]
            {
                "fileObjectPath",
                "imageObjectPath",
                "photoObjectPath",
                "thumbnailObjectPath",
                "bannerObjectPath",
                "speakerImageObjectPath"
            })
            {
                await _mediaStorage.DeleteIfExistsAsync(
                    GetString(resourceData, objectPathField)
                );
            }

            if (resourceData.TryGetValue("galleryMedia", out var rawGallery) &&
                rawGallery is IEnumerable<object> galleryItems)
            {
                foreach (var galleryItem in galleryItems)
                {
                    if (galleryItem is Dictionary<string, object> galleryMap)
                    {
                        await _mediaStorage.DeleteIfExistsAsync(
                            GetString(galleryMap, "objectPath")
                        );
                    }
                }
            }

            if (resourceData.TryGetValue("contentMedia", out var rawContentMedia) &&
                rawContentMedia is IEnumerable<object> contentMediaItems)
            {
                foreach (var contentMediaItem in contentMediaItems)
                {
                    if (contentMediaItem is Dictionary<string, object> contentMediaMap)
                    {
                        await _mediaStorage.DeleteIfExistsAsync(
                            GetString(contentMediaMap, "objectPath")
                        );
                    }
                }
            }

            await docRef.DeleteAsync();

            await WriteAuditLogAsync(
                GetPublisherUid()!,
                "publisher",
                $"{collectionName}.deleted",
                companyId,
                collectionName,
                resourceId,
                null,
                "deleted"
            );

            return NoContent();
        }

        private async Task<IActionResult?> PrepareForPublisherMutationAsync(DocumentSnapshot companyDoc)
        {
            var data = companyDoc.ToDictionary();
            var moderationState = GetString(data, "moderationState", "draft");

            if (string.Equals(moderationState, "pending_review", StringComparison.OrdinalIgnoreCase))
            {
                return Conflict(new
                {
                    message = "This profile is pending admin review. Editing is temporarily locked until the review is completed."
                });
            }

            // If an already-approved profile is edited, keep the last approved
            // snapshot/status available for the future public profile while the
            // publisher works on a new draft revision.
            if (string.Equals(moderationState, "approved", StringComparison.OrdinalIgnoreCase))
            {
                await companyDoc.Reference.UpdateAsync(new Dictionary<string, object>
                {
                    { "moderationState", "draft" },
                    { "draftRevisionStartedAt", Timestamp.GetCurrentTimestamp() },
                    { "updatedAt", Timestamp.GetCurrentTimestamp() }
                });

                await WriteAuditLogAsync(
                    GetPublisherUid()!,
                    "publisher",
                    "company.revision_started",
                    companyDoc.Id,
                    "company",
                    companyDoc.Id,
                    "approved",
                    "draft"
                );
            }

            return null;
        }

        private Task<IActionResult> BadRequestTask(string message) =>
            Task.FromResult<IActionResult>(BadRequest(new { message }));

        // =====================================================
        // 🔧 GENERAL HELPERS
        // =====================================================
        private string? GetPublisherUid() =>
            User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        private async Task<string> GenerateUniqueSlugAsync(
            string baseSlug,
            string? currentCompanyId = null)
        {
            var candidate = baseSlug;
            var suffix = 2;

            while (true)
            {
                var existing = await _firestore
                    .Collection("companies")
                    .WhereEqualTo("slug", candidate)
                    .Limit(5)
                    .GetSnapshotAsync();

                var conflict = existing.Documents.Any(doc =>
                    string.IsNullOrWhiteSpace(currentCompanyId) ||
                    !string.Equals(doc.Id, currentCompanyId, StringComparison.Ordinal));

                if (!conflict)
                    return candidate;

                candidate = $"{baseSlug}-{suffix}";
                suffix++;
            }
        }

        private async Task<string> GenerateUniquePostSlugAsync(
            string companyId,
            string title,
            string? currentResourceId = null)
        {
            var baseSlug = CreateSlug(title);

            if (string.IsNullOrWhiteSpace(baseSlug))
                baseSlug = "post";

            var snapshot = await _firestore
                .Collection("companies")
                .Document(companyId)
                .Collection("posts")
                .GetSnapshotAsync();

            var usedSlugs = snapshot.Documents
                .Where(doc =>
                    string.IsNullOrWhiteSpace(currentResourceId) ||
                    !string.Equals(doc.Id, currentResourceId, StringComparison.Ordinal))
                .Select(doc =>
                {
                    var data = doc.ToDictionary();
                    var storedSlug = GetString(data, "slug");
                    return string.IsNullOrWhiteSpace(storedSlug)
                        ? CreateSlug(GetString(data, "title"))
                        : storedSlug;
                })
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            var candidate = baseSlug;
            var suffix = 2;

            while (usedSlugs.Contains(candidate))
            {
                candidate = $"{baseSlug}-{suffix}";
                suffix++;
            }

            return candidate;
        }

        private static string CreateSlug(string value)
        {
            var normalized = value.Normalize(NormalizationForm.FormD);
            var builder = new StringBuilder();

            foreach (var ch in normalized)
            {
                var category = CharUnicodeInfo.GetUnicodeCategory(ch);

                if (category != UnicodeCategory.NonSpacingMark)
                    builder.Append(ch);
            }

            var withoutDiacritics = builder
                .ToString()
                .Normalize(NormalizationForm.FormC)
                .ToLowerInvariant();

            var slug = Regex.Replace(withoutDiacritics, @"[^a-z0-9]+", "-");
            slug = Regex.Replace(slug, @"-+", "-").Trim('-');

            return slug;
        }

        private static Dictionary<string, object?> ToCompanySummary(DocumentSnapshot doc)
        {
            var data = doc.ToDictionary();

            return new Dictionary<string, object?>
            {
                ["id"] = doc.Id,
                ["name"] = GetString(data, "name"),
                ["slug"] = GetString(data, "slug"),
                ["status"] = GetString(data, "status", "draft"),
                ["moderationState"] = GetString(data, "moderationState", "draft"),
                ["logoUrl"] = GetString(data, "logoUrl"),
                ["bannerUrl"] = GetString(data, "bannerUrl"),
                ["revisionNote"] = GetString(data, "revisionNote"),
                ["rejectionNote"] = GetString(data, "rejectionNote"),
                ["reviewNote"] = GetString(data, "reviewNote"),
                ["unpublishNote"] = GetString(data, "unpublishNote"),
                ["approvedVersion"] = data.TryGetValue("approvedVersion", out var approvedVersion) ? approvedVersion : 0,
                ["submittedAt"] = GetTimestampIso(data, "submittedAt"),
                ["approvedAt"] = GetTimestampIso(data, "approvedAt"),
                ["createdAt"] = GetTimestampIso(data, "createdAt")
            };
        }

        private static object ToCompanyDetails(DocumentSnapshot companyDoc)
        {
            var data = companyDoc.ToDictionary();

            return new
            {
                id = companyDoc.Id,
                name = GetString(data, "name"),
                slug = GetString(data, "slug"),
                shortDescription = GetString(data, "shortDescription"),
                websiteUrl = GetString(data, "websiteUrl"),
                email = GetString(data, "email"),
                phone = GetString(data, "phone"),
                address = GetString(data, "address"),
                categories = GetStringList(data, "categories"),
                logoUrl = GetString(data, "logoUrl"),
                bannerUrl = GetString(data, "bannerUrl"),
                status = GetString(data, "status", "draft"),
                moderationState = GetString(data, "moderationState", "draft"),
                revisionNote = GetString(data, "revisionNote"),
                rejectionNote = GetString(data, "rejectionNote"),
                reviewNote = GetString(data, "reviewNote"),
                unpublishNote = GetString(data, "unpublishNote"),
                approvedVersion = data.TryGetValue("approvedVersion", out var approvedVersion) ? approvedVersion : 0,
                submittedAt = GetTimestampIso(data, "submittedAt"),
                approvedAt = GetTimestampIso(data, "approvedAt"),
                createdAt = GetTimestampIso(data, "createdAt"),
                updatedAt = GetTimestampIso(data, "updatedAt")
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

                result[pair.Key] = ConvertFirestoreValue(pair.Value);
            }

            return result;
        }

        private static object? ConvertFirestoreValue(object? value)
        {
            if (value is Timestamp timestamp)
                return timestamp.ToDateTime().ToString("O");

            if (value is IEnumerable<object> items && value is not string)
                return items.Select(ConvertFirestoreValue).ToList();

            if (value is Dictionary<string, object> dictionary)
            {
                return dictionary.ToDictionary(
                    pair => pair.Key,
                    pair => ConvertFirestoreValue(pair.Value));
            }

            return value;
        }

        private static string SanitizePostBody(string? value)
        {
            var html = value?.Trim() ?? string.Empty;

            if (string.IsNullOrWhiteSpace(html))
                return string.Empty;

            html = Regex.Replace(
                html,
                @"<!--[\s\S]*?-->",
                string.Empty,
                RegexOptions.IgnoreCase);

            html = Regex.Replace(
                html,
                @"<(script|style|iframe|object|embed)[^>]*>[\s\S]*?</\1\s*>",
                string.Empty,
                RegexOptions.IgnoreCase);

            html = Regex.Replace(html, @"<\s*div\b[^>]*>", "<p>", RegexOptions.IgnoreCase);
            html = Regex.Replace(html, @"<\s*/\s*div\s*>", "</p>", RegexOptions.IgnoreCase);

            var tokens = new List<string>();

            // Preserve only verified Vercel Blob images. All other IMG tags are
            // discarded before the general formatting whitelist is applied.
            html = Regex.Replace(
                html,
                @"<\s*img\b(?<attrs>[^>]*)/?>",
                match =>
                {
                    var attributes = match.Groups["attrs"].Value;
                    var src = ExtractHtmlAttribute(attributes, "src");

                    if (!IsValidPostContentImageUrl(src))
                        return string.Empty;

                    var alt = ExtractHtmlAttribute(attributes, "alt");
                    if (string.IsNullOrWhiteSpace(alt))
                        alt = "Post content image";

                    if (alt.Length > 180)
                        alt = alt[..180];

                    var normalized =
                        $"<img src=\"{WebUtility.HtmlEncode(src)}\" alt=\"{WebUtility.HtmlEncode(alt)}\">";

                    var token = $"__EYERIC_RICH_TAG_{tokens.Count}__";
                    tokens.Add(normalized);
                    return token;
                },
                RegexOptions.IgnoreCase);

            var allowedTag = new Regex(
                @"<\s*(/?)\s*(p|br|strong|b|em|i|u|h1|h2|h3|blockquote|ul|ol|li)\b[^>]*>",
                RegexOptions.IgnoreCase);

            html = allowedTag.Replace(html, match =>
            {
                var closing = match.Groups[1].Value == "/";
                var tag = match.Groups[2].Value.ToLowerInvariant();

                var normalized = tag == "br"
                    ? "<br>"
                    : closing
                        ? $"</{tag}>"
                        : $"<{tag}>";

                var token = $"__EYERIC_RICH_TAG_{tokens.Count}__";
                tokens.Add(normalized);
                return token;
            });

            html = Regex.Replace(html, @"<[^>]*>", string.Empty);

            for (var index = 0; index < tokens.Count; index++)
                html = html.Replace($"__EYERIC_RICH_TAG_{index}__", tokens[index]);

            return html.Trim();
        }


        private static string SanitizeWhitepaperBody(string? value)
        {
            var html = value?.Trim() ?? string.Empty;

            if (string.IsNullOrWhiteSpace(html))
                return string.Empty;

            html = Regex.Replace(
                html,
                @"<!--[\s\S]*?-->",
                string.Empty,
                RegexOptions.IgnoreCase);

            html = Regex.Replace(
                html,
                @"<(script|style|iframe|object|embed)[^>]*>[\s\S]*?</\1\s*>",
                string.Empty,
                RegexOptions.IgnoreCase);

            // Whitepaper rich text intentionally does not allow embedded images.
            html = Regex.Replace(
                html,
                @"<\s*img\b[^>]*>",
                string.Empty,
                RegexOptions.IgnoreCase);

            html = Regex.Replace(html, @"<\s*div\b[^>]*>", "<p>", RegexOptions.IgnoreCase);
            html = Regex.Replace(html, @"<\s*/\s*div\s*>", "</p>", RegexOptions.IgnoreCase);

            var tokens = new List<string>();

            var allowedTag = new Regex(
                @"<\s*(/?)\s*(p|br|strong|b|em|i|u|h1|h2|h3|blockquote|ul|ol|li)\b[^>]*>",
                RegexOptions.IgnoreCase);

            html = allowedTag.Replace(html, match =>
            {
                var closing = match.Groups[1].Value == "/";
                var tag = match.Groups[2].Value.ToLowerInvariant();

                var normalized = tag == "br"
                    ? "<br>"
                    : closing
                        ? $"</{tag}>"
                        : $"<{tag}>";

                var token = $"__EYERIC_WHITEPAPER_TAG_{tokens.Count}__";
                tokens.Add(normalized);
                return token;
            });

            html = Regex.Replace(html, @"<[^>]*>", string.Empty);

            for (var index = 0; index < tokens.Count; index++)
                html = html.Replace($"__EYERIC_WHITEPAPER_TAG_{index}__", tokens[index]);

            return html.Trim();
        }

        private static int CountPostContentImages(string html) =>
            Regex.Matches(
                html ?? string.Empty,
                @"<\s*img\b",
                RegexOptions.IgnoreCase
            ).Count;

        private static string ExtractHtmlAttribute(
            string attributes,
            string name)
        {
            var match = Regex.Match(
                attributes ?? string.Empty,
                $@"\b{Regex.Escape(name)}\s*=\s*(?:""(?<dq>[^""]*)""|'(?<sq>[^']*)'|(?<uq>[^\s>]+))",
                RegexOptions.IgnoreCase);

            if (!match.Success)
                return string.Empty;

            if (match.Groups["dq"].Success) return match.Groups["dq"].Value;
            if (match.Groups["sq"].Success) return match.Groups["sq"].Value;
            return match.Groups["uq"].Value;
        }

        private static bool IsValidPostContentImageUrl(string value)
        {
            if (!Uri.TryCreate(value?.Trim(), UriKind.Absolute, out var uri))
                return false;

            return uri.Scheme == Uri.UriSchemeHttps &&
                   uri.Host.EndsWith(
                       ".blob.vercel-storage.com",
                       StringComparison.OrdinalIgnoreCase);
        }

        private static string NormalizeVideoEmbedUrl(string? value)
        {
            var raw = Clean(value);

            if (string.IsNullOrWhiteSpace(raw))
                return string.Empty;

            if (!Uri.TryCreate(raw, UriKind.Absolute, out var uri) ||
                (uri.Scheme != Uri.UriSchemeHttp &&
                 uri.Scheme != Uri.UriSchemeHttps))
            {
                return string.Empty;
            }

            var host = uri.Host
                .ToLowerInvariant();

            if (host.StartsWith("www."))
                host = host[4..];

            var segments = uri.AbsolutePath
                .Split('/', StringSplitOptions.RemoveEmptyEntries);

            static bool SafeId(string candidate) =>
                !string.IsNullOrWhiteSpace(candidate) &&
                Regex.IsMatch(candidate, @"^[A-Za-z0-9_-]+$");

            // YouTube: watch, shorts, live and existing embed URLs.
            if (host is "youtube.com" or "m.youtube.com" or
                "music.youtube.com" or "youtube-nocookie.com")
            {
                var id = string.Empty;

                if (segments.Length > 0 &&
                    string.Equals(segments[0], "watch", StringComparison.OrdinalIgnoreCase))
                {
                    var match = Regex.Match(
                        uri.Query,
                        @"(?:^\?|&)v=(?<id>[A-Za-z0-9_-]+)",
                        RegexOptions.IgnoreCase);

                    if (match.Success)
                        id = match.Groups["id"].Value;
                }
                else if (segments.Length >= 2 &&
                         new[] { "embed", "shorts", "live" }
                             .Contains(segments[0], StringComparer.OrdinalIgnoreCase))
                {
                    id = segments[1];
                }

                return SafeId(id)
                    ? $"https://www.youtube-nocookie.com/embed/{id}"
                    : string.Empty;
            }

            if (host == "youtu.be")
            {
                var id = segments.FirstOrDefault() ?? string.Empty;

                return SafeId(id)
                    ? $"https://www.youtube-nocookie.com/embed/{id}"
                    : string.Empty;
            }

            // Vimeo
            if (host is "vimeo.com" or "player.vimeo.com")
            {
                var id = segments.FirstOrDefault(segment =>
                    Regex.IsMatch(segment, @"^\d+$")) ?? string.Empty;

                return !string.IsNullOrWhiteSpace(id)
                    ? $"https://player.vimeo.com/video/{id}"
                    : string.Empty;
            }

            // Loom
            if (host == "loom.com")
            {
                for (var index = 0; index + 1 < segments.Length; index++)
                {
                    if ((segments[index].Equals("share", StringComparison.OrdinalIgnoreCase) ||
                         segments[index].Equals("embed", StringComparison.OrdinalIgnoreCase)) &&
                        SafeId(segments[index + 1]))
                    {
                        return $"https://www.loom.com/embed/{segments[index + 1]}";
                    }
                }

                return string.Empty;
            }

            // Dailymotion
            if (host == "dailymotion.com")
            {
                for (var index = 0; index + 1 < segments.Length; index++)
                {
                    if (segments[index].Equals("video", StringComparison.OrdinalIgnoreCase) &&
                        SafeId(segments[index + 1]))
                    {
                        return $"https://www.dailymotion.com/embed/video/{segments[index + 1]}";
                    }
                }

                return string.Empty;
            }

            if (host == "dai.ly")
            {
                var id = segments.FirstOrDefault() ?? string.Empty;

                return SafeId(id)
                    ? $"https://www.dailymotion.com/embed/video/{id}"
                    : string.Empty;
            }

            // Wistia
            if (host == "wistia.com" ||
                host.EndsWith(".wistia.com", StringComparison.OrdinalIgnoreCase) ||
                host == "fast.wistia.net")
            {
                for (var index = 0; index + 1 < segments.Length; index++)
                {
                    if ((segments[index].Equals("medias", StringComparison.OrdinalIgnoreCase) ||
                         segments[index].Equals("iframe", StringComparison.OrdinalIgnoreCase)) &&
                        SafeId(segments[index + 1]))
                    {
                        return $"https://fast.wistia.net/embed/iframe/{segments[index + 1]}";
                    }
                }
            }

            return string.Empty;
        }

        private static string Clean(string? value) =>
            value?.Trim() ?? string.Empty;

        private static List<string> CleanList(IEnumerable<string>? values)
        {
            return (values ?? Array.Empty<string>())
                .Select(Clean)
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
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

        private static void ApplyLegacyEventDateTimeFallback(
            EventDto request,
            ref string startDate,
            ref string startTime,
            ref string endDate,
            ref string endTime)
        {
            static (string Date, string Time) SplitLegacy(string value)
            {
                var clean = value?.Trim() ?? string.Empty;
                if (string.IsNullOrWhiteSpace(clean))
                    return (string.Empty, string.Empty);

                if (DateTime.TryParse(clean, CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, out var parsed))
                {
                    return (
                        parsed.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                        parsed.ToString("HH:mm", CultureInfo.InvariantCulture));
                }

                return (string.Empty, string.Empty);
            }

            if (string.IsNullOrWhiteSpace(startDate) || string.IsNullOrWhiteSpace(startTime))
            {
                var legacy = SplitLegacy(request.StartAt);
                if (string.IsNullOrWhiteSpace(startDate)) startDate = legacy.Date;
                if (string.IsNullOrWhiteSpace(startTime)) startTime = legacy.Time;
            }

            if (string.IsNullOrWhiteSpace(endDate) || string.IsNullOrWhiteSpace(endTime))
            {
                var legacy = SplitLegacy(request.EndAt);
                if (string.IsNullOrWhiteSpace(endDate)) endDate = legacy.Date;
                if (string.IsNullOrWhiteSpace(endTime)) endTime = legacy.Time;
            }
        }

        private static string? ValidateEventSchedule(
            string startDate,
            string startTime,
            string endDate,
            string endTime)
        {
            if (string.IsNullOrWhiteSpace(startDate) ||
                string.IsNullOrWhiteSpace(startTime) ||
                string.IsNullOrWhiteSpace(endDate) ||
                string.IsNullOrWhiteSpace(endTime))
            {
                return "Start date, start time, end date and end time are required.";
            }

            if (!DateTime.TryParseExact(
                    $"{startDate} {startTime}",
                    "yyyy-MM-dd HH:mm",
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.None,
                    out var start))
            {
                return "Event start date or time is invalid.";
            }

            if (!DateTime.TryParseExact(
                    $"{endDate} {endTime}",
                    "yyyy-MM-dd HH:mm",
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.None,
                    out var end))
            {
                return "Event end date or time is invalid.";
            }

            if (end < start)
                return "Event end date/time cannot be before the start.";

            return null;
        }

        private static string? ValidateDateRange(
            string startAt,
            string endAt,
            string label)
        {
            DateTimeOffset? start = null;
            DateTimeOffset? end = null;

            if (!string.IsNullOrWhiteSpace(startAt))
            {
                if (!DateTimeOffset.TryParse(startAt, out var parsedStart))
                    return $"{char.ToUpperInvariant(label[0]) + label[1..]} start date/time is invalid.";

                start = parsedStart;
            }

            if (!string.IsNullOrWhiteSpace(endAt))
            {
                if (!DateTimeOffset.TryParse(endAt, out var parsedEnd))
                    return $"{char.ToUpperInvariant(label[0]) + label[1..]} end date/time is invalid.";

                end = parsedEnd;
            }

            if (start.HasValue && end.HasValue && end.Value < start.Value)
                return $"{char.ToUpperInvariant(label[0]) + label[1..]} end date/time cannot be before the start.";

            return null;
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

        private static bool IsValidEmail(string value)
        {
            try
            {
                var address = new MailAddress(value);
                return string.Equals(address.Address, value, StringComparison.OrdinalIgnoreCase);
            }
            catch
            {
                return false;
            }
        }

        private static bool IsValidOptionalUrl(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return true;

            return Uri.TryCreate(value, UriKind.Absolute, out var uri) &&
                   (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
        }

        private static string NormalizeForComparison(string value)
        {
            return Regex.Replace(value.Trim().ToLowerInvariant(), @"\s+", " ");
        }
    }
}
