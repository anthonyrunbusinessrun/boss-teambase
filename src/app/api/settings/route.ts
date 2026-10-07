import { getDb, mutateDb } from "@/server/db";
import { fail, ok, readJson } from "@/server/http";
import { ZONES } from "@/lib/zones";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";

export const GET = authed(async () => {
  return ok((await getDb()).settings);
});

export const PATCH = authed(async (req: Request) => {
  const body = await readJson(req);
  if (!body) return fail("Invalid request body");
  return mutateDb((db) => {
    const s = db.settings;
    if (typeof body.reduceMotion === "boolean") s.reduceMotion = body.reduceMotion;
    if (body.notifications && typeof body.notifications === "object") {
      const n = body.notifications as Record<string, unknown>;
      for (const key of ["messages", "tasks", "meetings", "budget"] as const) {
        if (typeof n[key] === "boolean") s.notifications[key] = n[key] as boolean;
      }
    }
    for (const key of ["primaryZoneId", "secondaryZoneId"] as const) {
      if (key in body) {
        if (!ZONES.some((z) => z.id === body[key])) return fail("Unknown time zone");
        s[key] = body[key] as string;
      }
    }
    return ok(s);
  });
});
