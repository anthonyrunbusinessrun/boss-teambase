import { getDb, mutateDb, resolveConversation, resolveMessage } from "@/server/db";
import { fail, ok, readJson, str } from "@/server/http";
import type { ConversationDetail } from "@/types/models";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const GET = authed<Ctx>(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const db = await getDb();
  const c = db.conversations.find((x) => x.id === id);
  if (!c) return fail("Conversation not found", 404);
  const detail: ConversationDetail = {
    conversation: resolveConversation(db, c),
    messages: (db.messages[id] ?? []).map((m) => resolveMessage(db, m)),
    members: db.members.filter((m) => c.memberIds.includes(m.id)),
  };
  return ok(detail);
});

/** PATCH { favorite?, read?, name?, description?, topic? } */
export const PATCH = authed<Ctx>(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const body = await readJson(req);
  if (!body) return fail("Invalid request body");
  return mutateDb((db) => {
    const c = db.conversations.find((x) => x.id === id);
    if (!c) return fail("Conversation not found", 404);
    if ("name" in body) {
      if (c.type !== "channel") return fail("Direct messages can't be renamed.");
      const name = str(body.name).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
      if (!name) return fail("Enter a channel name.");
      if (db.conversations.some((candidate) => candidate.id !== id && candidate.type === "channel" && candidate.name === name)) return fail("That channel already exists.", 409);
      c.name = name;
    }
    if (typeof body.description === "string") c.description = str(body.description).slice(0, 160);
    if (typeof body.topic === "string") c.topic = str(body.topic).slice(0, 500);
    if (typeof body.favorite === "boolean") c.favorite = body.favorite;
    if (body.read === true) {
      c.unread = 0;
      for (const n of db.notifications) if (n.href.includes(`c=${id}`)) n.read = true;
    }
    return ok(resolveConversation(db, c));
  });
});

export const DELETE = authed<Ctx>(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  return mutateDb((db) => {
    const index = db.conversations.findIndex((conversation) => conversation.id === id);
    if (index < 0) return fail("Conversation not found", 404);
    db.conversations.splice(index, 1);
    delete db.messages[id];
    db.notifications = db.notifications.filter((notification) => !notification.href.includes(`c=${id}`));
    return ok({ id });
  });
});
