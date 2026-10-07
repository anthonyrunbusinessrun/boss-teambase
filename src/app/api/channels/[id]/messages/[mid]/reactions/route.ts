import { mutateDb, resolveMessage } from "@/server/db";
import { fail, ok, readJson, str } from "@/server/http";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; mid: string }> };

/** POST { emoji } — toggles the current user's reaction. */
export const POST = authed<Ctx>(async (req: Request, { params }: Ctx) => {
  const { id, mid } = await params;
  const body = await readJson(req);
  const emoji = str(body?.emoji);
  if (!emoji) return fail("Emoji is required");
  return mutateDb((db) => {
    const msg = (db.messages[id] ?? []).find((m) => m.id === mid);
    if (!msg) return fail("Message not found", 404);
    const existing = msg.reactions.find((r) => r.emoji === emoji);
    if (!existing) msg.reactions.push({ emoji, count: 1, reacted: true });
    else if (existing.reacted) {
      existing.reacted = false;
      existing.count = Math.max(0, existing.count - 1);
      if (existing.count === 0) msg.reactions = msg.reactions.filter((r) => r !== existing);
    } else { existing.reacted = true; existing.count += 1; }
    return ok(resolveMessage(db, msg));
  });
});
