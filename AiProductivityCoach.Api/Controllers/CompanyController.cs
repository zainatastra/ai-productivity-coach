using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Google.Cloud.Firestore;
using System.Security.Claims;
using System.Text;
using System.Text.RegularExpressions;
using System.Globalization;
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
            public string Excerpt { get; set; } = string.Empty;
            public string Body { get; set; } = string.Empty;
        }

        public class WhitepaperDto
        {
            public string Title { get; set; } = string.Empty;
            public string Summary { get; set; } = string.Empty;
            public string Authors { get; set; } = string.Empty;
            public string ExternalUrl { get; set; } = string.Empty;
        }

        public class ProductDto
        {
            public string Name { get; set; } = string.Empty;
            public string ShortDescription { get; set; } = string.Empty;
            public string Description { get; set; } = string.Empty;
            public string ProductUrl { get; set; } = string.Empty;
            public string PriceLabel { get; set; } = string.Empty;
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
            public string Summary { get; set; } = string.Empty;
            public string ScheduledAt { get; set; } = string.Empty;
            public string Speaker { get; set; } = string.Empty;
            public string RegistrationUrl { get; set; } = string.Empty;
        }

        public class EventDto
        {
            public string Title { get; set; } = string.Empty;
            public string Summary { get; set; } = string.Empty;
            public string StartAt { get; set; } = string.Empty;
            public string EndAt { get; set; } = string.Empty;
            public string Location { get; set; } = string.Empty;
            public string EventUrl { get; set; } = string.Empty;
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
        public Task<IActionResult> CreatePost(string companyId, [FromBody] PostDto request)
        {
            var title = Clean(request.Title);
            var excerpt = Clean(request.Excerpt);
            var body = Clean(request.Body);

            if (string.IsNullOrWhiteSpace(title) || title.Length > 180)
                return BadRequestTask("Post title is required and must be 180 characters or fewer.");
            if (excerpt.Length > 500 || body.Length > 20000)
                return BadRequestTask("Post content exceeds the allowed length.");

            return CreateResourceAsync(companyId, "posts", new Dictionary<string, object>
            {
                { "title", title },
                { "excerpt", excerpt },
                { "body", body }
            });
        }

        [HttpPut("{companyId}/posts/{resourceId}")]
        public Task<IActionResult> UpdatePost(string companyId, string resourceId, [FromBody] PostDto request)
        {
            var title = Clean(request.Title);
            var excerpt = Clean(request.Excerpt);
            var body = Clean(request.Body);

            if (string.IsNullOrWhiteSpace(title) || title.Length > 180)
                return BadRequestTask("Post title is required and must be 180 characters or fewer.");
            if (excerpt.Length > 500 || body.Length > 20000)
                return BadRequestTask("Post content exceeds the allowed length.");

            return UpdateResourceAsync(companyId, "posts", resourceId, new Dictionary<string, object>
            {
                { "title", title },
                { "excerpt", excerpt },
                { "body", body }
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
            var summary = Clean(request.Summary);
            var authors = Clean(request.Authors);
            var externalUrl = Clean(request.ExternalUrl);

            if (string.IsNullOrWhiteSpace(title) || title.Length > 180)
                return BadRequestTask("Whitepaper title is required and must be 180 characters or fewer.");
            if (summary.Length > 3000 || authors.Length > 300 || !IsValidOptionalUrl(externalUrl))
                return BadRequestTask("One or more whitepaper fields are invalid.");

            return CreateResourceAsync(companyId, "whitepapers", new Dictionary<string, object>
            {
                { "title", title },
                { "summary", summary },
                { "authors", authors },
                { "externalUrl", externalUrl },
                { "fileUrl", string.Empty }
            });
        }

        [HttpPut("{companyId}/whitepapers/{resourceId}")]
        public Task<IActionResult> UpdateWhitepaper(string companyId, string resourceId, [FromBody] WhitepaperDto request)
        {
            var title = Clean(request.Title);
            var summary = Clean(request.Summary);
            var authors = Clean(request.Authors);
            var externalUrl = Clean(request.ExternalUrl);

            if (string.IsNullOrWhiteSpace(title) || title.Length > 180)
                return BadRequestTask("Whitepaper title is required and must be 180 characters or fewer.");
            if (summary.Length > 3000 || authors.Length > 300 || !IsValidOptionalUrl(externalUrl))
                return BadRequestTask("One or more whitepaper fields are invalid.");

            return UpdateResourceAsync(companyId, "whitepapers", resourceId, new Dictionary<string, object>
            {
                { "title", title },
                { "summary", summary },
                { "authors", authors },
                { "externalUrl", externalUrl }
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
            var shortDescription = Clean(request.ShortDescription);
            var description = Clean(request.Description);
            var productUrl = Clean(request.ProductUrl);
            var priceLabel = Clean(request.PriceLabel);

            if (string.IsNullOrWhiteSpace(name) || name.Length > 180)
                return BadRequestTask("Product name is required and must be 180 characters or fewer.");
            if (shortDescription.Length > 500 || description.Length > 6000 ||
                priceLabel.Length > 80 || !IsValidOptionalUrl(productUrl))
                return BadRequestTask("One or more product fields are invalid.");

            return CreateResourceAsync(companyId, "products", new Dictionary<string, object>
            {
                { "name", name },
                { "shortDescription", shortDescription },
                { "description", description },
                { "productUrl", productUrl },
                { "priceLabel", priceLabel },
                { "imageUrl", string.Empty }
            });
        }

        [HttpPut("{companyId}/products/{resourceId}")]
        public Task<IActionResult> UpdateProduct(string companyId, string resourceId, [FromBody] ProductDto request)
        {
            var name = Clean(request.Name);
            var shortDescription = Clean(request.ShortDescription);
            var description = Clean(request.Description);
            var productUrl = Clean(request.ProductUrl);
            var priceLabel = Clean(request.PriceLabel);

            if (string.IsNullOrWhiteSpace(name) || name.Length > 180)
                return BadRequestTask("Product name is required and must be 180 characters or fewer.");
            if (shortDescription.Length > 500 || description.Length > 6000 ||
                priceLabel.Length > 80 || !IsValidOptionalUrl(productUrl))
                return BadRequestTask("One or more product fields are invalid.");

            return UpdateResourceAsync(companyId, "products", resourceId, new Dictionary<string, object>
            {
                { "name", name },
                { "shortDescription", shortDescription },
                { "description", description },
                { "productUrl", productUrl },
                { "priceLabel", priceLabel }
            });
        }

        [HttpDelete("{companyId}/products/{resourceId}")]
        public Task<IActionResult> DeleteProduct(string companyId, string resourceId) =>
            DeleteResourceAsync(companyId, "products", resourceId);

        // =====================================================
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
            var summary = Clean(request.Summary);
            var scheduledAt = Clean(request.ScheduledAt);
            var speaker = Clean(request.Speaker);
            var registrationUrl = Clean(request.RegistrationUrl);

            if (string.IsNullOrWhiteSpace(title) || title.Length > 180)
                return BadRequestTask("Webinar title is required and must be 180 characters or fewer.");
            if (summary.Length > 3000 || speaker.Length > 250 || !IsValidOptionalUrl(registrationUrl))
                return BadRequestTask("One or more webinar fields are invalid.");

            if (!string.IsNullOrWhiteSpace(scheduledAt) &&
                !DateTimeOffset.TryParse(scheduledAt, out _))
                return BadRequestTask("Webinar date/time is invalid.");

            return CreateResourceAsync(companyId, "webinars", new Dictionary<string, object>
            {
                { "title", title },
                { "summary", summary },
                { "scheduledAt", scheduledAt },
                { "speaker", speaker },
                { "registrationUrl", registrationUrl },
                { "thumbnailUrl", string.Empty }
            });
        }

        [HttpPut("{companyId}/webinars/{resourceId}")]
        public Task<IActionResult> UpdateWebinar(string companyId, string resourceId, [FromBody] WebinarDto request)
        {
            var title = Clean(request.Title);
            var summary = Clean(request.Summary);
            var scheduledAt = Clean(request.ScheduledAt);
            var speaker = Clean(request.Speaker);
            var registrationUrl = Clean(request.RegistrationUrl);

            if (string.IsNullOrWhiteSpace(title) || title.Length > 180)
                return BadRequestTask("Webinar title is required and must be 180 characters or fewer.");
            if (summary.Length > 3000 || speaker.Length > 250 || !IsValidOptionalUrl(registrationUrl))
                return BadRequestTask("One or more webinar fields are invalid.");

            if (!string.IsNullOrWhiteSpace(scheduledAt) &&
                !DateTimeOffset.TryParse(scheduledAt, out _))
                return BadRequestTask("Webinar date/time is invalid.");

            return UpdateResourceAsync(companyId, "webinars", resourceId, new Dictionary<string, object>
            {
                { "title", title },
                { "summary", summary },
                { "scheduledAt", scheduledAt },
                { "speaker", speaker },
                { "registrationUrl", registrationUrl }
            });
        }

        [HttpDelete("{companyId}/webinars/{resourceId}")]
        public Task<IActionResult> DeleteWebinar(string companyId, string resourceId) =>
            DeleteResourceAsync(companyId, "webinars", resourceId);

        // =====================================================
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
            var startAt = Clean(request.StartAt);
            var endAt = Clean(request.EndAt);
            var location = Clean(request.Location);
            var eventUrl = Clean(request.EventUrl);

            if (string.IsNullOrWhiteSpace(title) || title.Length > 180)
                return BadRequestTask("Event title is required and must be 180 characters or fewer.");
            if (summary.Length > 3000 || location.Length > 250 || !IsValidOptionalUrl(eventUrl))
                return BadRequestTask("One or more event fields are invalid.");

            var dateError = ValidateDateRange(startAt, endAt, "event");
            if (dateError != null) return BadRequestTask(dateError);

            return CreateResourceAsync(companyId, "events", new Dictionary<string, object>
            {
                { "title", title },
                { "summary", summary },
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
            var startAt = Clean(request.StartAt);
            var endAt = Clean(request.EndAt);
            var location = Clean(request.Location);
            var eventUrl = Clean(request.EventUrl);

            if (string.IsNullOrWhiteSpace(title) || title.Length > 180)
                return BadRequestTask("Event title is required and must be 180 characters or fewer.");
            if (summary.Length > 3000 || location.Length > 250 || !IsValidOptionalUrl(eventUrl))
                return BadRequestTask("One or more event fields are invalid.");

            var dateError = ValidateDateRange(startAt, endAt, "event");
            if (dateError != null) return BadRequestTask(dateError);

            return UpdateResourceAsync(companyId, "events", resourceId, new Dictionary<string, object>
            {
                { "title", title },
                { "summary", summary },
                { "startAt", startAt },
                { "endAt", endAt },
                { "location", location },
                { "eventUrl", eventUrl }
            });
        }

        [HttpDelete("{companyId}/events/{resourceId}")]
        public Task<IActionResult> DeleteEvent(string companyId, string resourceId) =>
            DeleteResourceAsync(companyId, "events", resourceId);

        // =====================================================
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
                "thumbnailObjectPath"
            })
            {
                await _mediaStorage.DeleteIfExistsAsync(
                    GetString(resourceData, objectPathField)
                );
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
