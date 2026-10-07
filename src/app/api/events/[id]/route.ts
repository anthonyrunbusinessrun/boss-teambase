import { mutateDb } from "@/server/db";
import { fail, ok, readJson } from "@/server/http";
import { parseEventFields } from "../validate";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const PATCH = authed<Ctx>(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const body = await readJson(req);
  if (!body) return fail("Invalid request body");
  const parsed = parseEventFields(body, true);
  if ("error" in parsed) return fail(parsed.error);
  return mutateDb((db) => {
    const ev = db.events.find((e) => e.id === id);
    if (!ev) return fail("Event not found", 404);
    Object.assign(ev, parsed.fields);
    return ok(ev);
  });
});

export const DELETE = authed<Ctx>(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  return mutateDb((db) => {
    const idx = db.events.findIndex((e) => e.id === id);
    if (idx < 0) return fail("Event not found", 404);
    db.events.splice(idx, 1);
    return ok({ id });
  });
});
