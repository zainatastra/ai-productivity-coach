import ProfilePreviewPage from "@/components/ai-publishing/ProfilePreviewPage";

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ProfilePreviewPage token={token} />;
}
