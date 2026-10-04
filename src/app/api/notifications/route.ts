import { getDb } from "@/server/db";
import { ok, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

/** Notifications respect the user's notification preferences. */
export async function GET() {
  const db = getDb();
  const prefs = db.settings.notifications;
  return ok(db.notifications.filter((n) => prefs[n.type]).sort((a, b) => b.at.localeCompare(a.at)));
}

/** POST { ids?: string[] } — marks those (or all, when omitted) as read. */
export async function POST(req: Request) {
  const body = await readJson(req);
  const db = getDb();
  const ids = Array.isArray(body?.ids) ? (body.ids as string[]) : null;
  for (const n of db.notifications) if (!ids || ids.includes(n.id)) n.read = true;
  return ok({ ok: true });
}
