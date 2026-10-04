import { Suspense } from "react";
import type { Metadata } from "next";
import { CalendarView } from "@/components/calendar/CalendarView";
import { LoadingState } from "@/components/shared/States";

export const metadata: Metadata = { title: "Calendar" };

export default function CalendarPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading calendar…" />}>
      <CalendarView />
    </Suspense>
  );
}
