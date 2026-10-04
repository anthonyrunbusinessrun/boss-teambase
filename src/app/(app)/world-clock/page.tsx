import type { Metadata } from "next";
import { WorldClocks } from "@/components/clocks/WorldClocks";

export const metadata: Metadata = { title: "World Clocks" };

export default function WorldClockPage() {
  return <WorldClocks />;
}
