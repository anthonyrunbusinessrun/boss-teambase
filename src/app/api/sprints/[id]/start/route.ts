import { logActivity, mutateDb } from "@/server/db";
import { fail, ok, readJson } from "@/server/http";
import { parseSprintFields, startSprint } from "@/server/actions";
import { publishSprint } from "@/server/actions-events";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** POST { name?, goal?, startDate?, endDate? } — start a planned sprint (a company can have one active sprint at a time). */
export const POST = authed<Ctx>(async (req: Request, { params }: Ctx, me) => {
  const { id } = await params;
  const body = (await readJson(req)) ?? {};
  const result = await mutateDb((db) => {
    const parsed = parseSprintFields(body, db.sprints.find((s) => s.id === id));
    if (!parsed.ok) return parsed;
    const started = startSprint(db, id, parsed.fields, new Date().toISOString());
    if (started.ok) logActivity(db, me, { text: "started", object: started.sprint.name, objectHref: `/actions/${started.sprint.companyId}/board`, objectTone: "link" });
    return started;
  });
  if (!result.ok) return fail(result.error, result.status);
  publishSprint(result.sprint.companyId, "started", id, me);
  return ok(result.sprint);
});
