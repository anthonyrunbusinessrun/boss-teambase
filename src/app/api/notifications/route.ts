import { getDb, mutateDb } from "@/server/db";
import { ok, readJson } from "@/server/http";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";

/** Notifications respect the user's notification preferences. */
export const GET = authed(async () => {
  const db = await getDb();
  const prefs = db.settings.notifications;
  return ok(db.notifications.filter((n) => prefs[n.type]).sort((a, b) => b.at.localeCompare(a.at)));
});

/** POST { ids?: string[] } — marks those (or all, when omitted) as read. */
export const POST = authed(async (req: Request) => {
  const body = await readJson(req);
  const ids = Array.isArray(body?.ids) ? (body.ids as string[]) : null;
  return mutateDb((db) => {
    for (const n of db.notifications) if (!ids || ids.includes(n.id)) n.read = true;
    return ok({ ok: true });
  });
});
