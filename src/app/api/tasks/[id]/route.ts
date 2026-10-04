import { getDb, logActivity } from "@/server/db";
import { fail, ok, readJson } from "@/server/http";
import { parseTaskFields } from "../validate";
import type { TaskStatus } from "@/types/models";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: "Backlog",
  todo: "To Do",
  "in-progress": "In Progress",
  review: "Review",
};

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const db = getDb();
  const task = db.tasks.find((t) => t.id === id);
  if (!task) return fail("Task not found", 404);
  const body = await readJson(req);
  if (!body) return fail("Invalid request body");
  const parsed = parseTaskFields(db, body);
  if ("error" in parsed) return fail(parsed.error);

  const prevStatus = task.status;
  Object.assign(task, parsed.fields);
  if (parsed.fields.status && parsed.fields.status !== prevStatus) {
    logActivity(db, {
      text: "moved",
      object: task.title,
      objectHref: `/actions?task=${task.id}`,
      objectTone: "link",
      suffix: `to ${STATUS_LABEL[task.status]}`,
    });
  }
  return ok(task);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const db = getDb();
  const idx = db.tasks.findIndex((t) => t.id === id);
  if (idx < 0) return fail("Task not found", 404);
  db.tasks.splice(idx, 1);
  return ok({ id });
}
