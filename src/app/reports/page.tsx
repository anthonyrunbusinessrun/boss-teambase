import { Suspense } from "react";
import type { Metadata } from "next";
import { DocumentCenter } from "@/components/reports/DocumentCenter";
import { LoadingState } from "@/components/shared/States";

export const metadata: Metadata = { title: "Document Center" };

export default function ReportsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading templates…" />}>
      <DocumentCenter />
    </Suspense>
  );
}
