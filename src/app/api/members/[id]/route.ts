import { getDb, makeInitials, wouldCreateCycle } from "@/server/db";
import { fail, ok, readJson, str } from "@/server/http";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const GET = authed<Ctx>(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const m = getDb().members.find((x) => x.id === id);
  return m ? ok(m) : fail("Member not found", 404);
});

export const PATCH = authed<Ctx>(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const db = getDb();
  const m = db.members.find((x) => x.id === id);
  if (!m) return fail("Member not found", 404);
  const body = await readJson(req);
  if (!body) return fail("Invalid request body");

  if ("name" in body) {
    if (!str(body.name)) return fail("Name is required");
    m.name = str(body.name);
  }
  if ("role" in body) {
    if (!str(body.role)) return fail("Role is required");
    m.role = str(body.role);
  }
  if ("department" in body) {
    if (!str(body.department)) return fail("Department is required");
    m.department = str(body.department);
  }
  if ("initials" in body) m.initials = str(body.initials).toUpperCase().slice(0, 3) || makeInitials(m.name);
  if (body.status === "active" || body.status === "offline") m.status = body.status;
  if (body.availability === "free" || body.availability === "in-meeting") m.availability = body.availability;
  if (Array.isArray(body.skills)) m.skills = body.skills.map(str).filter(Boolean);
  if ("managerId" in body) {
    const next = typeof body.managerId === "string" && body.managerId ? body.managerId : null;
    if (next && !db.members.some((x) => x.id === next)) return fail("Manager not found");
    if (next && wouldCreateCycle(db, id, next)) return fail("That reporting line would create a loop");
    m.managerId = next;
  }
  return ok(m);
});

export const DELETE = authed<Ctx>(async (_req: Request, { params }: Ctx, me) => {
  const { id } = await params;
  const db = getDb();
  const idx = db.members.findIndex((x) => x.id === id);
  if (idx < 0) return fail("Member not found", 404);
  if (id === me.id) return fail("You can't remove your own profile");
  const [removed] = db.members.splice(idx, 1);
  db.accounts = db.accounts.filter((a) => a.memberId !== id);
  // Keep the org chart connected: direct reports move up to the removed member's manager.
  for (const m of db.members) if (m.managerId === id) m.managerId = removed.managerId;
  for (const t of db.tasks) if (t.assigneeId === id) t.assigneeId = null;
  for (const c of db.conversations) c.memberIds = c.memberIds.filter((x) => x !== id);
  return ok({ id });
});
