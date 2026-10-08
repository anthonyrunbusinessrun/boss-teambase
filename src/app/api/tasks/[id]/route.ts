import { logActivity, mutateDb } from "@/server/db";
import { fail, ok, readJson } from "@/server/http";
import { STATUS_LABELS, parseTaskFields, taskHref, updateTask } from "@/server/actions";
import { publishTasks } from "@/server/actions-events";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const PATCH = authed<Ctx>(async (req: Request, { params }: Ctx, me) => {
  const { id } = await params;
  const body = await readJson(req);
  if (!body) return fail("Invalid request body");
  const result = await mutateDb((db) => {
    const task = db.tasks.find((t) => t.id === id);
    if (!task) return { ok: false, error: "Task not found", status: 404 } as const;
    const parsed = parseTaskFields(db, body);
    if (!parsed.ok) return parsed;
    const updated = updateTask(db, task, parsed.fields, me.id, new Date().toISOString());
    if (updated.ok && updated.task.status !== updated.before.status) {
      logActivity(db, me, { text: "moved", object: task.title, objectHref: taskHref(db, task), objectTone: "link", suffix: `to ${STATUS_LABELS[task.status]}` });
    }
    return updated;
  });
  if (!result.ok) return fail(result.error, result.status);
  // Everyone watching either company's board hears about it (a task can move from one company to another).
  publishTasks(result.task.companyId, "updated", [id], me);
  if (result.before.companyId !== result.task.companyId) publishTasks(result.before.companyId, "updated", [id], me);
  return ok(result.task);
});

export const DELETE = authed<Ctx>(async (_req: Request, { params }: Ctx, me) => {
  const { id } = await params;
  const removed = await mutateDb((db) => {
    const idx = db.tasks.findIndex((t) => t.id === id);
    if (idx < 0) return null;
    return db.tasks.splice(idx, 1)[0];
  });
  if (!removed) return fail("Task not found", 404);
  publishTasks(removed.companyId, "deleted", [id], me);
  return ok({ id });
});
