import { Suspense } from "react";
import type { Metadata } from "next";
import { BoardView } from "@/components/actions/BoardView";
import { LoadingState } from "@/components/shared/States";

export const metadata: Metadata = { title: "Actions · Board" };

export default function BoardPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading board…" />}>
      <BoardView />
    </Suspense>
  );
}
