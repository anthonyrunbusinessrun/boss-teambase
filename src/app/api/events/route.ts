import { getDb, logActivity, newId } from "@/server/db";
import { fail, ok, readJson } from "@/server/http";
import { parseEventFields } from "./validate";
import type { CalendarEvent } from "@/types/models";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";

export const GET = authed(async () => {
  return ok([...getDb().events].sort((a, b) => a.start.localeCompare(b.start)));
});

export const POST = authed(async (req: Request, _ctx, me) => {
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
  logActivity(db, me, {
    text: event.kind === "meeting" ? "scheduled a new meeting:" : "added an event:",
    object: event.title,
    objectHref: `/calendar?event=${event.id}`,
    objectTone: "strong",
  });
  return ok(event, 201);
});
