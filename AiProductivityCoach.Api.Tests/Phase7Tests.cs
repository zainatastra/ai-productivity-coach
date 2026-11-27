using AiProductivityCoach.Api.AiPublishing.Content;
using AiProductivityCoach.Api.AiPublishing.Review;
using Xunit;

namespace AiProductivityCoach.Api.Tests
{
    public class VersionApprovalTests
    {
        private static Dictionary<string, object> Piece(string status, long current, long? approved = null, string? requestState = null, long requestVersion = 0)
        {
            var data = new Dictionary<string, object> { ["status"] = status, ["currentVersion"] = current };
            if (approved != null) data["approvedVersion"] = approved.Value;

            if (requestState != null)
                data["approvalRequest"] = new Dictionary<string, object> { ["state"] = requestState, ["version"] = requestVersion };

            return data;
        }

        [Theory]
        [InlineData("approved", true)]
        [InlineData("published", true)]
        [InlineData("draft", false)]
        [InlineData("company_review", false)]
        [InlineData("archived", false)]
        public void OnlyApprovedAndPublishedPiecesAreLive(string status, bool live) =>
            Assert.Equal(live, VersionApproval.IsLive(status));

        [Fact]
        public void LegacyPieceWithoutApprovedVersion_HasItsCurrentTextLive()
        {
            var data = Piece("approved", 3);

            Assert.Equal(3, VersionApproval.ApprovedVersion(data));
            Assert.False(VersionApproval.HasPendingChanges(data));
        }

        [Fact]
        public void NewerVersionThanTheApprovedOne_IsPending()
        {
            var data = Piece("published", 4, approved: 2);

            Assert.Equal(2, VersionApproval.ApprovedVersion(data));
            Assert.True(VersionApproval.HasPendingChanges(data));
        }

        [Fact]
        public void ADraftNeverHasPendingChanges() =>
            Assert.False(VersionApproval.HasPendingChanges(Piece("draft", 5, approved: 1)));

        [Fact]
        public void RequestIsPossibleOnlyWithPendingChangesAndNoOpenRequest()
        {
            Assert.False(VersionApproval.CanRequest(Piece("approved", 2, approved: 2)));
            Assert.True(VersionApproval.CanRequest(Piece("approved", 3, approved: 2)));
            Assert.False(VersionApproval.CanRequest(Piece("approved", 3, approved: 2, "requested", 3)));
            Assert.True(VersionApproval.CanRequest(Piece("approved", 4, approved: 2, "changes_requested", 3)));
        }

        [Fact]
        public void AdminCanApproveAnyPendingChange_ButOnlyDeclineARequestedOne()
        {
            var untouched = Piece("approved", 3, approved: 2);
            var requested = Piece("approved", 3, approved: 2, "requested", 3);

            Assert.True(VersionApproval.CanDecide(untouched, "approve"));
            Assert.False(VersionApproval.CanDecide(untouched, "request_changes"));
            Assert.False(VersionApproval.CanDecide(untouched, "reject"));

            Assert.True(VersionApproval.CanDecide(requested, "approve"));
            Assert.True(VersionApproval.CanDecide(requested, "request_changes"));
            Assert.True(VersionApproval.CanDecide(requested, "reject"));
        }

        [Fact]
        public void NothingCanBeDecidedWithoutPendingChanges()
        {
            var data = Piece("approved", 2, approved: 2, "requested", 2);

            Assert.False(VersionApproval.CanDecide(data, "approve"));
        }

        [Theory]
        [InlineData("approve", true)]
        [InlineData("request_changes", true)]
        [InlineData("reject", true)]
        [InlineData("publish", false)]
        [InlineData("", false)]
        [InlineData(null, false)]
        public void OnlyKnownDecisionsAreValid(string? decision, bool valid) =>
            Assert.Equal(valid, VersionApproval.IsValidDecision(decision));

        [Fact]
        public void RequestedVersion_IsReadFromTheRequest()
        {
            Assert.Equal(5, VersionApproval.RequestedVersion(Piece("approved", 6, approved: 2, "requested", 5)));
            Assert.Equal(0, VersionApproval.RequestedVersion(Piece("approved", 6, approved: 2)));
        }

        [Fact]
        public void Overlay_ReplacesOnlyTheVersionedText()
        {
            var current = new Dictionary<string, object>
            {
                ["title"] = "New title", ["bodyHtml"] = "<p>new</p>", ["coverUrl"] = "cover.png", ["status"] = "published", ["currentVersion"] = 4
            };
            var live = new Dictionary<string, object> { ["title"] = "Live title", ["bodyHtml"] = "<p>live</p>", ["status"] = "draft" };

            var merged = VersionApproval.Overlay(current, live);

            Assert.Equal("Live title", merged["title"]);
            Assert.Equal("<p>live</p>", merged["bodyHtml"]);
            Assert.Equal("cover.png", merged["coverUrl"]);
            Assert.Equal("published", merged["status"]);
            Assert.Equal(4, merged["currentVersion"]);
        }

        [Fact]
        public void Overlay_KeepsCurrentTextWhereTheLiveVersionHasNone()
        {
            var current = new Dictionary<string, object> { ["title"] = "Title", ["subtitle"] = "Sub" };
            var live = new Dictionary<string, object> { ["title"] = "Live" };

            var merged = VersionApproval.Overlay(current, live);

            Assert.Equal("Live", merged["title"]);
            Assert.Equal("Sub", merged["subtitle"]);
        }

        [Fact]
        public void VersionedFields_CoverTheTextPlatformsPublish()
        {
            foreach (var field in new[] { "title", "subtitle", "excerpt", "bodyHtml" })
                Assert.Contains(field, ContentStore.VersionedFields);
        }
    }

    public class PlatformVersionTests
    {
        private static Dictionary<string, object> Piece(string status, long approved, params (string Platform, long Version)[] published)
        {
            var data = new Dictionary<string, object> { ["status"] = status, ["currentVersion"] = approved, ["approvedVersion"] = approved };

            if (published.Length > 0)
                data["publishedVersions"] = published.ToDictionary(p => p.Platform, p => (object)p.Version);

            return data;
        }

        [Fact]
        public void NeverPublished_IsVersionZero_AndOutOfDate()
        {
            var data = Piece("approved", 2);

            Assert.Equal(0, VersionApproval.PublishedVersion(data, "midrange"));
            Assert.True(VersionApproval.IsOutOfDate(data, "midrange"));
        }

        [Fact]
        public void PublishedVersion_IsTrackedPerPlatform()
        {
            var data = Piece("published", 3, ("midrange", 3), ("eyeric", 1));

            Assert.Equal(3, VersionApproval.PublishedVersion(data, "midrange"));
            Assert.Equal(1, VersionApproval.PublishedVersion(data, "eyeric"));
            Assert.False(VersionApproval.IsOutOfDate(data, "midrange"));
            Assert.True(VersionApproval.IsOutOfDate(data, "eyeric"));
        }

        [Fact]
        public void ADraftIsNeverOutOfDate() =>
            Assert.False(VersionApproval.IsOutOfDate(Piece("draft", 2), "midrange"));
    }
}
