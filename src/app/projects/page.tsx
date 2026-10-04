import type { Metadata } from "next";
import { Folder } from "lucide-react";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const metadata: Metadata = { title: "Projects" };

/** Screen 05 — no finalized design yet. Route kept so navigation is ready. */
export default function ProjectsPage() {
  return <ComingSoon screen="Screen 5" title="Projects" icon={<Folder size={26} />} />;
}
