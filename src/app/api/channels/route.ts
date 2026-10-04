import { getDb, resolveConversation } from "@/server/db";
import { ok } from "@/server/http";
import type { ConversationList } from "@/types/models";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const conversations = db.conversations.map((c) => resolveConversation(db, c));
  const body: ConversationList = {
    conversations,
    unreadTotal: conversations.reduce((sum, c) => sum + c.unread, 0),
  };
  return ok(body);
}
