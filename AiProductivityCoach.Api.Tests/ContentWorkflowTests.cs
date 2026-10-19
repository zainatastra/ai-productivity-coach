using AiProductivityCoach.Api.AiPublishing.Domain;
using Xunit;

namespace AiProductivityCoach.Api.Tests
{
    public class ContentWorkflowTests
    {
        [Theory]
        [InlineData(ContentStatus.Draft, ContentStatus.CompanyReview)]
        [InlineData(ContentStatus.Draft, ContentStatus.Approved)]
        [InlineData(ContentStatus.PendingAdminReview, ContentStatus.Approved)]
        [InlineData(ContentStatus.PendingAdminReview, ContentStatus.ChangesRequested)]
        [InlineData(ContentStatus.PendingAdminReview, ContentStatus.Rejected)]
        [InlineData(ContentStatus.ChangesRequested, ContentStatus.CompanyReview)]
        [InlineData(ContentStatus.Approved, ContentStatus.Published)]
        [InlineData(ContentStatus.Published, ContentStatus.Unpublished)]
        [InlineData(ContentStatus.Published, ContentStatus.Archived)]
        public void Admin_can_perform_allowed_transitions(string from, string to)
        {
            Assert.True(ContentWorkflow.CanTransition(from, to, AiRoles.Admin));
        }

        [Fact]
        public void Company_can_submit_for_admin_review()
        {
            Assert.True(ContentWorkflow.CanTransition(
                ContentStatus.CompanyReview, ContentStatus.PendingAdminReview, AiRoles.CompanyPublisher));
        }

        [Theory]
        [InlineData(ContentStatus.Approved, ContentStatus.Published)]
        [InlineData(ContentStatus.PendingAdminReview, ContentStatus.Approved)]
        [InlineData(ContentStatus.Draft, ContentStatus.Approved)]
        [InlineData(ContentStatus.Published, ContentStatus.Unpublished)]
        [InlineData(ContentStatus.Draft, ContentStatus.Published)]
        public void Company_can_never_approve_or_publish(string from, string to)
        {
            Assert.False(ContentWorkflow.CanTransition(from, to, AiRoles.CompanyPublisher));
        }

        [Theory]
        [InlineData(ContentStatus.Draft, ContentStatus.Published)]
        [InlineData(ContentStatus.CompanyReview, ContentStatus.Published)]
        [InlineData(ContentStatus.PendingAdminReview, ContentStatus.Published)]
        [InlineData(ContentStatus.ChangesRequested, ContentStatus.Published)]
        [InlineData(ContentStatus.Rejected, ContentStatus.Published)]
        public void Nothing_reaches_published_except_through_approved(string from, string to)
        {
            Assert.False(ContentWorkflow.CanTransition(from, to, AiRoles.Admin));
        }

        [Fact]
        public void Ai_and_system_roles_cannot_change_status()
        {
            foreach (var role in new[] { AiRoles.System, "ai", "user", "", null })
            {
                foreach (var from in ContentStatus.All)
                    foreach (var to in ContentStatus.All)
                        Assert.False(ContentWorkflow.CanTransition(from, to, role));
            }
        }

        [Fact]
        public void Only_approved_transitions_into_published_from_non_lifecycle_states()
        {
            var sources = ContentStatus.All
                .Where(s => ContentWorkflow.CanTransition(s, ContentStatus.Published, AiRoles.Admin))
                .ToHashSet();

            Assert.Equal(new[] { ContentStatus.Approved, ContentStatus.Unpublished }.ToHashSet(), sources);
        }

        [Fact]
        public void Unknown_states_are_rejected()
        {
            Assert.False(ContentWorkflow.CanTransition("nonsense", ContentStatus.Draft, AiRoles.Admin));
            Assert.False(ContentWorkflow.CanTransition(ContentStatus.Draft, "nonsense", AiRoles.Admin));
        }
    }
}
