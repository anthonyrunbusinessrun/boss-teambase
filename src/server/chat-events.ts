/** Publishing helpers + the cached "who may hear about this conversation" check, shared by the chat routes. */
import { getDb } from "./db";
import { audienceOf, canAccess, inAudience, type Audience, type StatusChange } from "./chat";
import { hub } from "./realtime";
import type { Conversation, ID } from "@/types/models";

export function publishMessage(c: Conversation, change: "created" | "updated" | "status", messageIds: ID[]) {
  hub.emit({ type: "message", conversationId: c.id, change, messageIds }, audienceOf(c));
}

export function publishConversation(c: Conversation, change: "created" | "updated" | "deleted") {
  hub.emit({ type: "conversation", conversationId: c.id, change }, audienceOf(c));
}

/** Tell the authors their messages' status changed, and the reader's other tabs that their unread count changed. */
export function publishStatus(change: StatusChange, readerId: ID) {
  if (change.authorIds.length) hub.emit({ type: "message", conversationId: change.conversationId, change: "status", messageIds: change.messageIds.slice(0, 200) }, change.authorIds);
  hub.emit({ type: "conversation", conversationId: change.conversationId, change: "read" }, [readerId]);
}

/** The audience if `memberId` may access the conversation, else null. Cached briefly so high-frequency calls (typing, image loads) skip the database. */
export async function accessibleAudience(conversationId: ID, memberId: ID): Promise<Audience | null> {
  let aud = hub.cachedAudience(conversationId);
  if (!aud) {
    const c = (await getDb()).conversations.find((x) => x.id === conversationId);
    if (!c) return null;
    aud = audienceOf(c);
    if (c.type === "dm" && !canAccess(c, memberId) && aud !== "all") return null;
    hub.cacheAudience(conversationId, aud);
  }
  return inAudience(aud, memberId) ? aud : null;
}
