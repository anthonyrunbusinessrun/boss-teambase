import { mutateDb } from "@/server/db";
import { fail, ok, readJson } from "@/server/http";
import { deleteSprint, parseSprintFields } from "@/server/actions";
import { publishSprint, publishTasks } from "@/server/actions-events";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** PATCH { name?, goal?, startDate?, endDate? } — edit a planned or active sprint. (Completed sprints are a record.) */
export const PATCH = authed<Ctx>(async (req: Request, { params }: Ctx, me) => {
  const { id } = await params;
  const body = await readJson(req);
  if (!body) return fail("Invalid request body");
  const result = await mutateDb((db) => {
    const sprint = db.sprints.find((s) => s.id === id);
    if (!sprint) return { ok: false, error: "Sprint not found", status: 404 } as const;
    if (sprint.status === "completed") return { ok: false, error: "Completed sprints are kept as a record and can't be edited.", status: 409 } as const;
    const parsed = parseSprintFields(body, sprint);
    if (!parsed.ok) return parsed;
    Object.assign(sprint, parsed.fields);
    return { ok: true, sprint } as const;
  });
  if (!result.ok) return fail(result.error, result.status);
  publishSprint(result.sprint.companyId, "updated", id, me);
  return ok(result.sprint);
});

/** DELETE — remove a planned sprint. Its work returns to unscheduled. */
export const DELETE = authed<Ctx>(async (_req: Request, { params }: Ctx, me) => {
  const { id } = await params;
  const result = await mutateDb((db) => deleteSprint(db, id, new Date().toISOString(), me.id));
  if (!result.ok) return fail(result.error, result.status);
  publishTasks(result.sprint.companyId, "updated", result.movedIds, me);
  publishSprint(result.sprint.companyId, "deleted", id, me);
  return ok({ id, movedTasks: result.movedIds.length });
});
