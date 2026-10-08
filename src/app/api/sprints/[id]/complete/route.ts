import { logActivity, mutateDb } from "@/server/db";
import { fail, ok, readJson } from "@/server/http";
import { completeSprint } from "@/server/actions";
import { publishSprint, publishTasks } from "@/server/actions-events";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/**
 * POST { moveTo } — complete the active sprint. Finished work stays in it as history.
 * Unfinished work moves to the planned sprint `moveTo`, or back to unscheduled when `moveTo` is null/omitted.
 */
export const POST = authed<Ctx>(async (req: Request, { params }: Ctx, me) => {
  const { id } = await params;
  const body = (await readJson(req)) ?? {};
  if (body.moveTo !== undefined && body.moveTo !== null && typeof body.moveTo !== "string") return fail("Invalid destination for unfinished work");
  const moveTo = typeof body.moveTo === "string" && body.moveTo ? body.moveTo : null;
  const result = await mutateDb((db) => {
    const done = completeSprint(db, id, moveTo, new Date().toISOString(), me.id);
    if (done.ok) logActivity(db, me, { text: "completed", object: done.sprint.name, objectHref: `/actions/${done.sprint.companyId}/sprints`, objectTone: "link" });
    return done;
  });
  if (!result.ok) return fail(result.error, result.status);
  publishTasks(result.sprint.companyId, "updated", result.movedIds, me);
  publishSprint(result.sprint.companyId, "completed", id, me);
  return ok({ sprint: result.sprint, movedTasks: result.movedIds.length });
});
