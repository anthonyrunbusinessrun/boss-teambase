import { getDb, logActivity, mutateDb } from "@/server/db";
import { fail, ok, readJson } from "@/server/http";
import { createTask, parseTaskFields, taskHref } from "@/server/actions";
import { publishTasks } from "@/server/actions-events";
import { isCompanyId } from "@/config/companies";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";

/**
 * GET — tasks. Optional filters: ?company=boss · ?sprint=<id> (or "none" for unscheduled) · ?ids=a,b,c (used to apply live updates).
 */
export const GET = authed(async (req: Request) => {
  const q = new URL(req.url).searchParams;
  const company = q.get("company");
  if (company && !isCompanyId(company)) return fail("Unknown company", 400);
  const ids = q.get("ids");
  const sprint = q.get("sprint");
  const wanted = ids ? new Set(ids.split(",").filter(Boolean).slice(0, 200)) : null;
  const tasks = (await getDb()).tasks.filter(
    (t) => (!wanted || wanted.has(t.id)) && (!company || t.companyId === company) && (!sprint || (sprint === "none" ? t.sprintId === null : t.sprintId === sprint)),
  );
  return ok(tasks);
});

/** POST — create a task. `sprintId` omitted → the company's active sprint; `null` → unscheduled. */
export const POST = authed(async (req: Request, _ctx, me) => {
  const body = await readJson(req);
  if (!body) return fail("Invalid request body");
  if (typeof body.title !== "string" || !body.title.trim()) return fail("Title is required");
  const task = await mutateDb((db) => {
    const parsed = parseTaskFields(db, body);
    if (!parsed.ok) return parsed;
    const created = createTask(db, parsed.fields, me.id, new Date().toISOString());
    if (created.ok) logActivity(db, me, { text: "created", object: created.task.title, objectHref: taskHref(db, created.task), objectTone: "link" });
    return created;
  });
  if (!task.ok) return fail(task.error, task.status);
  publishTasks(task.task.companyId, "created", [task.task.id], me);
  return ok(task.task, 201);
});
