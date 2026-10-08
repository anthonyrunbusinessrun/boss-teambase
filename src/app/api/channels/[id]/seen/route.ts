import { getDb, mutateDb } from "@/server/db";
import { fail, ok } from "@/server/http";
import { canAccess, hasUnseen, markSeen } from "@/server/chat";
import { publishStatus } from "@/server/chat-events";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/**
 * POST — "I'm looking at this conversation": everything addressed to me in it becomes Seen (and Delivered), their authors are
 * told live, and my unread count drops. A no-op (no database write) when there is nothing new.
 */
export const POST = authed<Ctx>(async (_req: Request, { params }: Ctx, me) => {
  const { id } = await params;
  const db = await getDb();
  const c = db.conversations.find((x) => x.id === id);
  if (!c || !canAccess(c, me.id)) return fail("Conversation not found", 404);
  if (!hasUnseen(db, id, me.id)) return ok({ changed: 0 });
  const change = await mutateDb((state) => {
    for (const n of state.notifications) if (n.href.includes(`c=${id}`)) n.read = true;
    return markSeen(state, id, me.id, new Date().toISOString());
  });
  if (change) publishStatus(change, me.id);
  return ok({ changed: change?.messageIds.length ?? 0 });
});
