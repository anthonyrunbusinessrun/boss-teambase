import { Suspense } from "react";
import type { Metadata } from "next";
import { TeamDirectory } from "@/components/team/TeamDirectory";
import { LoadingState } from "@/components/shared/States";

export const metadata: Metadata = { title: "Team Directory" };

export default function TeamPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading team…" />}>
      <TeamDirectory />
    </Suspense>
  );
}
