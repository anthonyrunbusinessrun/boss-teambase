import { getDb, newId, resolveConversation } from "@/server/db";
import { fail, ok, readJson, str } from "@/server/http";
import type { Conversation } from "@/types/models";

export const dynamic = "force-dynamic";

/** POST { memberId } — finds or creates a direct message with a team member. */
export async function POST(req: Request) {
  const body = await readJson(req);
  const memberId = str(body?.memberId);
  const db = getDb();
  const member = db.members.find((m) => m.id === memberId);
  if (!member) return fail("Team member not found", 404);

  let convo = db.conversations.find((c) => c.type === "dm" && c.peer?.memberId === memberId);
  if (!convo) {
    const created: Conversation = {
      id: newId("dm"),
      type: "dm",
      name: member.name,
      description: "Direct message",
      topic: `Direct message with ${member.name}.`,
      favorite: false,
      unread: 0,
      memberIds: [],
      peer: { name: member.name, memberId, online: member.status === "active" },
    };
    db.conversations.push(created);
    convo = created;
  }
  return ok(resolveConversation(db, convo));
}
