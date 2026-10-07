import { getDb, makeInitials, mutateDb, newId } from "@/server/db";
import { fail, ok, readJson, str } from "@/server/http";
import type { TeamMember } from "@/types/models";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";

export const GET = authed(async () => {
  return ok((await getDb()).members);
});

export const POST = authed(async (req: Request) => {
  const body = await readJson(req);
  if (!body) return fail("Invalid request body");
  const name = str(body.name);
  const role = str(body.role);
  const department = str(body.department);
  if (!name) return fail("Name is required");
  if (!role) return fail("Role is required");
  if (!department) return fail("Department is required");

  return mutateDb((db) => {
    const managerId = typeof body.managerId === "string" && db.members.some((m) => m.id === body.managerId) ? body.managerId : null;
    const member: TeamMember = {
      id: newId("m"), name, role, department,
      initials: str(body.initials).toUpperCase().slice(0, 3) || makeInitials(name),
      status: body.status === "offline" ? "offline" : "active", availability: "free", managerId,
      skills: Array.isArray(body.skills) ? body.skills.map(str).filter(Boolean) : [],
    };
    db.members.push(member);
    return ok(member, 201);
  });
});
