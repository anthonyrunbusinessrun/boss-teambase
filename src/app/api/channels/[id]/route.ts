import { getDb, mutateDb } from "@/server/db";
import { fail, ok, readJson, str } from "@/server/http";
import { canAccess, markSeen, panelMembers, presentConversation, presentMessage } from "@/server/chat";
import { publishConversation, publishStatus } from "@/server/chat-events";
import { deleteForConversation } from "@/server/files";
import { hub } from "@/server/realtime";
import type { ConversationDetail } from "@/types/models";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** One conversation: its messages (with delivery status on your own), and its registered members with live presence. */
export const GET = authed<Ctx>(async (_req: Request, { params }: Ctx, me) => {
  const { id } = await params;
  await hub.ensureStarted();
  const db = await getDb();
  const c = db.conversations.find((x) => x.id === id);
  // Someone else's DM looks exactly like one that doesn't exist.
  if (!c || !canAccess(c, me.id)) return fail("Conversation not found", 404);
  const detail: ConversationDetail = {
    conversation: presentConversation(db, c, me.id, hub.isOnline),
    messages: (db.messages[id] ?? []).map((m) => presentMessage(db, m, me.id)),
    members: panelMembers(db, c, hub.isOnline, me.id),
  };
  return ok(detail);
});

/** PATCH { favorite?, read?, name?, description?, topic? } */
export const PATCH = authed<Ctx>(async (req: Request, { params }: Ctx, me) => {
  const { id } = await params;
  const body = await readJson(req);
  if (!body) return fail("Invalid request body");
  const result = await mutateDb((db) => {
    const c = db.conversations.find((x) => x.id === id);
    if (!c || !canAccess(c, me.id)) return { ok: false, error: "Conversation not found", status: 404 } as const;
    if ("name" in body) {
      if (c.type !== "channel") return { ok: false, error: "Direct messages can't be renamed.", status: 400 } as const;
      const name = str(body.name).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
      if (!name) return { ok: false, error: "Enter a channel name.", status: 400 } as const;
      if (db.conversations.some((candidate) => candidate.id !== id && candidate.type === "channel" && candidate.name === name)) return { ok: false, error: "That channel already exists.", status: 409 } as const;
      c.name = name;
    }
    if (typeof body.description === "string") c.description = str(body.description).slice(0, 160);
    if (typeof body.topic === "string") c.topic = str(body.topic).slice(0, 500);
    if (typeof body.favorite === "boolean") c.favorite = body.favorite;
    let seen = null;
    if (body.read === true) {
      seen = markSeen(db, id, me.id, new Date().toISOString());
      for (const n of db.notifications) if (n.href.includes(`c=${id}`)) n.read = true;
    }
    return { ok: true, c, seen, presented: presentConversation(db, c, me.id, hub.isOnline) } as const;
  });
  if (!result.ok) return fail(result.error, result.status);
  if (result.seen) publishStatus(result.seen, me.id);
  if (typeof body.favorite !== "boolean" && body.read !== true) publishConversation(result.c, "updated");
  return ok(result.presented);
});

export const DELETE = authed<Ctx>(async (_req: Request, { params }: Ctx, me) => {
  const { id } = await params;
  const removed = await mutateDb((db) => {
    const index = db.conversations.findIndex((conversation) => conversation.id === id);
    if (index < 0 || !canAccess(db.conversations[index], me.id)) return null;
    const [c] = db.conversations.splice(index, 1);
    delete db.messages[id];
    db.notifications = db.notifications.filter((notification) => !notification.href.includes(`c=${id}`));
    return c;
  });
  if (!removed) return fail("Conversation not found", 404);
  await deleteForConversation(id);
  publishConversation(removed, "deleted");
  hub.forgetAudience(id);
  return ok({ id });
});

