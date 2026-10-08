import { fail, ok, readJson } from "@/server/http";
import { accessibleAudience } from "@/server/chat-events";
import { hub } from "@/server/realtime";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/**
 * POST { typing: boolean } — "I'm writing a message here" / "I stopped".
 * Nothing is written to the database: it goes straight to the other participants, and expires on its own after a few seconds
 * if the browser stops sending it (closed tab, lost connection).
 */
export const POST = authed<Ctx>(async (req: Request, { params }: Ctx, me) => {
  const { id } = await params;
  const body = await readJson(req);
  const aud = await accessibleAudience(id, me.id);
  if (!aud) return fail("Conversation not found", 404);
  hub.setTyping({ conversationId: id, memberId: me.id, name: me.name.trim().split(/\s+/)[0] || me.name, typing: body?.typing !== false }, aud);
  return ok({ ok: true });
});
