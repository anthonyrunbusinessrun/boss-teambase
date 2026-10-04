import { Suspense } from "react";
import type { Metadata } from "next";
import { ActionsBoard } from "@/components/actions/ActionsBoard";
import { LoadingState } from "@/components/shared/States";

export const metadata: Metadata = { title: "Actions" };

export default function ActionsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading tasks…" />}>
      <ActionsBoard />
    </Suspense>
  );
}
