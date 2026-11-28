using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Routing;
using Xunit;

namespace AiProductivityCoach.Api.Tests
{
    /// <summary>
    /// A permission test for the whole API: every endpoint must need a login, except the ones on the list below.
    /// A new endpoint that forgets its [Authorize] fails this test; a new public endpoint has to be added to the
    /// list on purpose, which is the moment to think about abuse (rate limits, what it reveals, what it costs).
    /// </summary>
    public class EndpointAccessTests
    {
        private static readonly Assembly Api = typeof(AiProductivityCoach.Api.Controllers.AiBookingController).Assembly;

        public sealed record Endpoint(string Name, bool Anonymous, bool Protected);

        public static List<Endpoint> All()
        {
            var endpoints = new List<Endpoint>();

            foreach (var type in Api.GetTypes().Where(t => !t.IsAbstract && typeof(ControllerBase).IsAssignableFrom(t) && t.GetCustomAttribute<ApiControllerAttribute>() != null))
            {
                var classAuthorize = type.GetCustomAttributes<AuthorizeAttribute>(inherit: true).Any();
                var classAnonymous = type.GetCustomAttributes<AllowAnonymousAttribute>(inherit: true).Any();

                foreach (var method in type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
                             .Where(m => m.GetCustomAttributes<HttpMethodAttribute>().Any()))
                {
                    // ASP.NET Core: an anonymous marker on the class or the action wins over any [Authorize].
                    var anonymous = classAnonymous || method.GetCustomAttributes<AllowAnonymousAttribute>().Any();
                    var isProtected = !anonymous && (classAuthorize || method.GetCustomAttributes<AuthorizeAttribute>().Any());

                    endpoints.Add(new Endpoint($"{type.Name}.{method.Name}", anonymous, isProtected));
                }
            }

            return endpoints;
        }

        // Public on purpose. Each of these is either a sign-in step, a public page, or a form for visitors, and each
        // one that costs something or sends something is rate limited (see the controllers).
        private static readonly string[] KnownOpen =
        {
            // sign-in steps (the codes are limited per address and per email)
            "AuthController.SendOtp", "AuthController.VerifyOtp",
            "PublisherPasswordController.Forgot",
            "AiInviteController.Preview", "AiInviteController.AcceptNew",

            // public pages of the directory (read only, only approved content)
            "AdminController.GetUIText",
            "ProvidersController.GetProviders", "ProvidersController.GetProviderBySlug",
            "ProvidersController.GetApprovedPost", "ProvidersController.GetApprovedWhitepaper", "ProvidersController.GetApprovedWebinar",

            // forms for visitors (rate limited, nothing is granted by them)
            "CompanyClaimsController.Submit",
            "WhitepaperResponsesController.SubmitResponse", "WhitepaperResponsesController.Download",
            "WebinarResponsesController.SubmitResponse",

            // secret-link preview of a profile (the link itself is the secret; rate limited)
            "AiProfilePreviewController.Get",

            // older public feature that asks the AI for the "Mach mich produktiv" answer; NOT rate limited yet
            "ProductivityController.HandleProductivity"
        };

        // Controllers under api/ai that are meant for somebody other than the admin.
        private static readonly string[] NotAdminRoutes = { "api/ai/company", "api/ai/invitations", "api/ai/profile-preview" };

        [Fact]
        public void EveryAdminSideAiController_RequiresTheAdminPolicy_NotJustALogin()
        {
            var weak = new List<string>();

            foreach (var type in Api.GetTypes().Where(t => !t.IsAbstract && typeof(ControllerBase).IsAssignableFrom(t) && t.GetCustomAttribute<ApiControllerAttribute>() != null))
            {
                var route = type.GetCustomAttribute<RouteAttribute>()?.Template ?? string.Empty;
                if (!route.StartsWith("api/ai", StringComparison.Ordinal)) continue;
                if (NotAdminRoutes.Any(r => route.StartsWith(r, StringComparison.Ordinal))) continue;

                var admin = type.GetCustomAttributes<AuthorizeAttribute>(inherit: true).Any(a => a.Policy == "AdminOnly");
                if (!admin) weak.Add(type.Name);
            }

            Assert.Empty(weak);
        }

        [Fact]
        public void TheCompanySideAiController_RequiresThePublisherPolicy()
        {
            var type = typeof(AiProductivityCoach.Api.Controllers.AiCompanyController);

            Assert.Contains(type.GetCustomAttributes<AuthorizeAttribute>(inherit: true), a => a.Policy == "PublisherOnly");
        }

        [Fact]
        public void TheApiHasEndpoints() => Assert.True(All().Count > 150);

        [Fact]
        public void EveryEndpointNeedsALogin_ExceptTheKnownOpenOnes()
        {
            var open = All().Where(e => !e.Protected).Select(e => e.Name).OrderBy(n => n, StringComparer.Ordinal).ToList();

            // Compared as text so a failure lists every difference, not a shortened array.
            Assert.Equal(
                string.Join("\n", KnownOpen.OrderBy(n => n, StringComparer.Ordinal)),
                string.Join("\n", open));
        }
    }
}
