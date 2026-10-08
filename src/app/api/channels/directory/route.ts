import { getDb } from "@/server/db";
import { ok } from "@/server/http";
import { registeredIds } from "@/server/chat";
import { hub } from "@/server/realtime";
import type { ChannelMember } from "@/types/models";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";

/** Everyone you can start a private conversation with: other *registered* members, with live presence. */
export const GET = authed(async (_req, _ctx, me) => {
  await hub.ensureStarted();
  const db = await getDb();
  const registered = registeredIds(db);
  const people: ChannelMember[] = db.members
    .filter((m) => registered.has(m.id) && m.id !== me.id)
    .map((m) => ({ ...m, registered: true, online: hub.isOnline(m.id) }))
    .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  return ok(people);
});
