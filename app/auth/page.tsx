import { PageSkeleton } from "@/components/loading/Skeleton";
import { Suspense } from "react";
import AuthContent from "./AuthContent";

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton kind="auth" />}>
      <AuthContent />
    </Suspense>
  );
}