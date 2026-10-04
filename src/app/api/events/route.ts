import { getDb, logActivity, newId } from "@/server/db";
import { fail, ok, readJson } from "@/server/http";
import { parseEventFields } from "./validate";
import type { CalendarEvent } from "@/types/models";

export const dynamic = "force-dynamic";

export async function GET() {
  return ok([...getDb().events].sort((a, b) => a.start.localeCompare(b.start)));
}

export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body) return fail("Invalid request body");
  const parsed = parseEventFields(body, false);
  if ("error" in parsed) return fail(parsed.error);
  const db = getDb();
  const f = parsed.fields;
  const event: CalendarEvent = {
    id: newId("e"),
    title: f.title as string,
    kind: f.kind ?? "event",
    importance: f.importance ?? "standard",
    start: f.start as string,
    end: f.end as string,
    location: f.location,
  };
  db.events.push(event);
  logActivity(db, {
    text: event.kind === "meeting" ? "scheduled a new meeting:" : "added an event:",
    object: event.title,
    objectHref: `/calendar?event=${event.id}`,
    objectTone: "strong",
  });
  return ok(event, 201);
}
