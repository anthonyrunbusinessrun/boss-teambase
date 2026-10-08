import { mutateDb, newId } from "@/server/db";
import { fail, ok, readJson, str } from "@/server/http";
import { presentConversation, registeredIds } from "@/server/chat";
import { publishConversation } from "@/server/chat-events";
import { hub } from "@/server/realtime";
import type { Conversation } from "@/types/models";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";

/**
 * POST { memberId } — finds or creates the private 1-on-1 conversation between you and another *registered* member.
 * There is exactly one per pair: it's the same conversation whichever of you opens it, and nobody else can see it.
 */
export const POST = authed(async (req: Request, _ctx, me) => {
  const body = await readJson(req);
  const memberId = str(body?.memberId);
  if (memberId === me.id) return fail("You can't start a conversation with yourself.");
  await hub.ensureStarted();
  const result = await mutateDb((db) => {
    const target = db.members.find((m) => m.id === memberId);
    if (!target) return { ok: false, error: "Team member not found", status: 404 } as const;
    if (!registeredIds(db).has(memberId)) return { error: `${target.name} hasn't registered a Teambase account yet, so you can't message them.`, status: 400 } as const;
    let c = db.conversations.find((x) => x.type === "dm" && x.participantIds?.length === 2 && x.participantIds.includes(me.id) && x.participantIds.includes(memberId));
    const created = !c;
    if (!c) {
      c = {
        id: newId("dm"), type: "dm", name: target.name, description: "Direct message", topic: `Direct message with ${target.name}.`,
        favorite: false, unread: 0, memberIds: [], participantIds: [me.id, memberId], peer: { name: target.name, memberId },
      } satisfies Conversation;
      db.conversations.push(c);
      db.messages[c.id] = [];
    }
    return { ok: true, c, created, presented: presentConversation(db, c, me.id, hub.isOnline) } as const;
  });
  if (!result.ok) return fail(result.error, result.status);
  if (result.created) publishConversation(result.c, "created");
  return ok(result.presented, result.created ? 201 : 200);
});
