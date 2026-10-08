import { getDb, mutateDb, newId } from "@/server/db";
import { fail, ok, readJson, str } from "@/server/http";
import { canAccess, presentConversation } from "@/server/chat";
import { publishConversation } from "@/server/chat-events";
import { hub } from "@/server/realtime";
import type { Conversation, ConversationList } from "@/types/models";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";

/** The conversations *you* can see: every channel, plus only the DMs you take part in. Unread is counted for you alone. */
export const GET = authed(async (_req, _ctx, me) => {
  await hub.ensureStarted();
  const db = await getDb();
  const conversations = db.conversations.filter((c) => canAccess(c, me.id)).map((c) => presentConversation(db, c, me.id, hub.isOnline));
  const body: ConversationList = { conversations, unreadTotal: conversations.reduce((sum, c) => sum + c.unread, 0) };
  return ok(body);
});

/** POST { name, description?, topic? } */
export const POST = authed(async (req: Request, _ctx, me) => {
  const body = await readJson(req);
  const name = str(body?.name).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
  if (!name) return fail("Enter a channel name.");
  const result = await mutateDb((db) => {
    if (db.conversations.some((conversation) => conversation.type === "channel" && conversation.name === name)) return null;
    const description = str(body?.description).slice(0, 160) || "Team conversation";
    const conversation: Conversation = {
      id: newId("c"), type: "channel", name, description,
      topic: str(body?.topic).slice(0, 500) || description, favorite: false, unread: 0,
      memberIds: Array.from(new Set([me.id, ...db.members.map((member) => member.id)])),
    };
    db.conversations.push(conversation);
    db.messages[conversation.id] = [];
    return { conversation, presented: presentConversation(db, conversation, me.id, hub.isOnline) };
  });
  if (!result) return fail("That channel already exists.", 409);
  publishConversation(result.conversation, "created");
  return ok(result.presented, 201);
});
