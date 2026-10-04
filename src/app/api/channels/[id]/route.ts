import { getDb, resolveConversation, resolveMessage } from "@/server/db";
import { fail, ok, readJson } from "@/server/http";
import type { ConversationDetail } from "@/types/models";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const GET = authed<Ctx>(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const db = getDb();
  const c = db.conversations.find((x) => x.id === id);
  if (!c) return fail("Conversation not found", 404);
  const detail: ConversationDetail = {
    conversation: resolveConversation(db, c),
    messages: (db.messages[id] ?? []).map((m) => resolveMessage(db, m)),
    members: db.members.filter((m) => c.memberIds.includes(m.id)),
  };
  return ok(detail);
});

/** PATCH { favorite?: boolean, read?: true } */
export const PATCH = authed<Ctx>(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const db = getDb();
  const c = db.conversations.find((x) => x.id === id);
  if (!c) return fail("Conversation not found", 404);
  const body = await readJson(req);
  if (!body) return fail("Invalid request body");
  if (typeof body.favorite === "boolean") c.favorite = body.favorite;
  if (body.read === true) {
    c.unread = 0;
    // Reading a conversation also clears its notification.
    for (const n of db.notifications) if (n.href.includes(`c=${id}`)) n.read = true;
  }
  return ok(resolveConversation(db, c));
});
