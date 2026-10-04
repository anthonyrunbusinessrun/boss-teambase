import { Suspense } from "react";
import type { Metadata } from "next";
import { ChannelsView } from "@/components/channels/ChannelsView";
import { LoadingState } from "@/components/shared/States";

export const metadata: Metadata = { title: "Channels" };

export default function ChannelsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading channels…" />}>
      <ChannelsView />
    </Suspense>
  );
}
