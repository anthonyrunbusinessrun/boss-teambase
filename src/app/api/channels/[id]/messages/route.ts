import { mutateDb, newId, resolveMessage } from "@/server/db";
import { fail, ok, readJson, str } from "@/server/http";
import type { Attachment, ChatMessage } from "@/types/models";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const POST = authed<Ctx>(async (req: Request, { params }: Ctx, me) => {
  const { id } = await params;
  const body = await readJson(req);
  if (!body) return fail("Invalid request body");

  const text = str(body.body);
  const attachments: Attachment[] = Array.isArray(body.attachments)
    ? body.attachments
        .filter((a): a is Attachment => !!a && typeof a.name === "string")
        .map((a) => ({ name: String(a.name).slice(0, 120), size: Number(a.size) || 0 }))
    : [];
  if (!text && attachments.length === 0) return fail("Write a message before sending");
  if (text.length > 4000) return fail("Messages can be up to 4,000 characters");

  return mutateDb((db) => {
    const c = db.conversations.find((x) => x.id === id);
    if (!c) return fail("Conversation not found", 404);
    const msg: ChatMessage = {
      id: newId("msg"), conversationId: id, authorMemberId: me.id, authorName: me.name,
      authorInitials: me.initials, body: text, createdAt: new Date().toISOString(), reactions: [], attachments,
    };
    (db.messages[id] ??= []).push(msg);
    c.typingUser = undefined;
    return ok(resolveMessage(db, msg), 201);
  });
});
