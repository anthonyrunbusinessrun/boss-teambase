import { getDb, logActivity, mutateDb } from "@/server/db";
import { fail, ok, readJson, str } from "@/server/http";
import { parseTaskFields } from "./validate";
import type { Task } from "@/types/models";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";

export const GET = authed(async () => {
  return ok((await getDb()).tasks);
});

export const POST = authed(async (req: Request, _ctx, me) => {
  const body = await readJson(req);
  if (!body) return fail("Invalid request body");
  if (!str(body.title)) return fail("Title is required");
  return mutateDb((db) => {
    const parsed = parseTaskFields(db, body);
    if ("error" in parsed) return fail(parsed.error);
    const n = db.nextTicket++;
    const task: Task = {
      id: `t-${n}`, key: `TB-${n}`, title: str(body.title), description: "", status: "todo", priority: "medium",
      dueDate: new Date().toISOString().slice(0, 10), progress: 0, assigneeId: null, ...parsed.fields,
    };
    db.tasks.push(task);
    logActivity(db, me, { text: "created", object: task.title, objectHref: `/actions?task=${task.id}`, objectTone: "link" });
    return ok(task, 201);
  });
});
