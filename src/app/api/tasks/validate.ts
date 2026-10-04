import type { Db } from "@/server/db";
import { str } from "@/server/http";
import type { Priority, Task, TaskStatus } from "@/types/models";

const STATUSES: TaskStatus[] = ["backlog", "todo", "in-progress", "review"];
const PRIORITIES: Priority[] = ["high", "medium", "low"];

/** Validate/normalize the task fields present in `body`. Only provided fields are returned. */
export function parseTaskFields(db: Db, body: Record<string, unknown>): { fields: Partial<Task> } | { error: string } {
  const f: Partial<Task> = {};
  if ("title" in body) {
    if (!str(body.title)) return { error: "Title is required" };
    f.title = str(body.title);
  }
  if ("description" in body) f.description = str(body.description);
  if ("status" in body) {
    if (!STATUSES.includes(body.status as TaskStatus)) return { error: "Invalid status" };
    f.status = body.status as TaskStatus;
  }
  if ("priority" in body) {
    if (!PRIORITIES.includes(body.priority as Priority)) return { error: "Invalid priority" };
    f.priority = body.priority as Priority;
  }
  if ("dueDate" in body) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str(body.dueDate))) return { error: "Due date must be a valid date" };
    f.dueDate = str(body.dueDate);
  }
  if ("progress" in body) {
    const n = Number(body.progress);
    if (!Number.isFinite(n)) return { error: "Progress must be a number" };
    f.progress = Math.min(100, Math.max(0, Math.round(n)));
  }
  if ("assigneeId" in body) {
    const id = typeof body.assigneeId === "string" && body.assigneeId ? body.assigneeId : null;
    if (id && !db.members.some((m) => m.id === id)) return { error: "Assignee not found" };
    f.assigneeId = id;
  }
  return { fields: f };
}
