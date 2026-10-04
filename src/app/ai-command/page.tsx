import type { Metadata } from "next";
import { Bot } from "lucide-react";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const metadata: Metadata = { title: "AI Command" };

/** Screen 06 — no finalized design yet. Route kept so navigation is ready. */
export default function AiCommandPage() {
  return <ComingSoon screen="Screen 6" title="AI Command" icon={<Bot size={26} />} />;
}
