import { Suspense } from "react";
import type { Metadata } from "next";
import { SprintsView } from "@/components/actions/SprintsView";
import { LoadingState } from "@/components/shared/States";

export const metadata: Metadata = { title: "Actions · Sprints" };

export default function SprintsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading sprints…" />}>
      <SprintsView />
    </Suspense>
  );
}
