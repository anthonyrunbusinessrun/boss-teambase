import { mutateDb } from "@/server/db";
import { fail, ok, readJson, str } from "@/server/http";
import { canAccess, presentMessage, toggleReaction } from "@/server/chat";
import { publishMessage } from "@/server/chat-events";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; mid: string }> };

/** POST { emoji } — toggles *your* reaction. Everyone sees the updated count live. */
export const POST = authed<Ctx>(async (req: Request, { params }: Ctx, me) => {
  const { id, mid } = await params;
  const body = await readJson(req);
  const emoji = str(body?.emoji).slice(0, 16);
  if (!emoji) return fail("Emoji is required");
  const result = await mutateDb((db) => {
    const c = db.conversations.find((x) => x.id === id);
    const msg = c && canAccess(c, me.id) ? (db.messages[id] ?? []).find((m) => m.id === mid) : undefined;
    if (!c || !msg) return null;
    msg.reactions = toggleReaction(msg.reactions, emoji, me.id);
    return { c, message: presentMessage(db, msg, me.id) };
  });
  if (!result) return fail("Message not found", 404);
  publishMessage(result.c, "updated", [mid]);
  return ok(result.message);
});
