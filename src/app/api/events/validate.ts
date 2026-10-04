import { str } from "@/server/http";
import type { CalendarEvent } from "@/types/models";

export function parseEventFields(body: Record<string, unknown>, partial: boolean): { fields: Partial<CalendarEvent> } | { error: string } {
  const f: Partial<CalendarEvent> = {};
  if (!partial || "title" in body) {
    if (!str(body.title)) return { error: "Title is required" };
    f.title = str(body.title);
  }
  if (body.kind === "event" || body.kind === "meeting") f.kind = body.kind;
  if (body.importance === "standard" || body.importance === "high") f.importance = body.importance;
  if ("location" in body) f.location = str(body.location) || undefined;
  if (!partial || "start" in body || "end" in body) {
    const s = new Date(str(body.start));
    const e = new Date(str(body.end));
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return { error: "Start and end must be valid times" };
    if (e <= s) return { error: "End time must be after the start time" };
    f.start = s.toISOString();
    f.end = e.toISOString();
  }
  return { fields: f };
}
