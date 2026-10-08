import { getDb, mutateDb, newId } from "@/server/db";
import { fail, ok, readJson } from "@/server/http";
import { MAX_BODY, audienceOf, canAccess, normalizeBody, presentMessage, recipientsOf } from "@/server/chat";
import { publishMessage } from "@/server/chat-events";
import { MAX_FILES_PER_MESSAGE, attachToMessage, detach } from "@/server/files";
import { hub } from "@/server/realtime";
import type { Attachment, ChatMessage } from "@/types/models";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** GET ?ids=a,b,c — specific messages, as *you* see them (used to apply live updates without re-downloading the thread). */
export const GET = authed<Ctx>(async (req: Request, { params }: Ctx, me) => {
  const { id } = await params;
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 200);
  const db = await getDb();
  const c = db.conversations.find((x) => x.id === id);
  if (!c || !canAccess(c, me.id)) return fail("Conversation not found", 404);
  const wanted = new Set(ids);
  return ok({ messages: (db.messages[id] ?? []).filter((m) => wanted.has(m.id)).map((m) => presentMessage(db, m, me.id)) });
});

/**
 * POST { body, attachments? } — send a message.
 *  - The text is stored exactly as written: line breaks, blank lines, indentation, bullets and numbering all survive.
 *  - `attachments` may reference files uploaded earlier through /api/attachments (by `id`).
 *  - Every registered recipient gets a delivery/read receipt; people who are online right now are marked delivered immediately.
 */
export const POST = authed<Ctx>(async (req: Request, { params }: Ctx, me) => {
  const { id } = await params;
  const body = await readJson(req);
  if (!body) return fail("Invalid request body");

  const text = normalizeBody(body.body);
  if (text.length > MAX_BODY) return fail(`Messages can be up to ${MAX_BODY.toLocaleString("en-US")} characters.`, 413);

  const raw: unknown[] = Array.isArray(body.attachments) ? body.attachments : [];
  if (raw.length > MAX_FILES_PER_MESSAGE) return fail(`You can attach up to ${MAX_FILES_PER_MESSAGE} files to one message.`);
  const fileIds = raw.flatMap((a) => (a && typeof (a as Attachment).id === "string" ? [(a as Attachment).id as string] : []));
  // Attachments from before files were stored only carried a name + size; accept that shape for compatibility.
  const legacy: Attachment[] = raw.flatMap((a) => {
    const x = a as Attachment;
    return x && typeof x.id !== "string" && typeof x.name === "string" ? [{ name: x.name.slice(0, 120), size: Number(x.size) || 0 }] : [];
  });
  if (!text && fileIds.length === 0 && legacy.length === 0) return fail("Write a message before sending");

  const first = (await getDb()).conversations.find((x) => x.id === id);
  if (!first || !canAccess(first, me.id)) return fail("Conversation not found", 404);
  await hub.ensureStarted();

  const messageId = newId("msg");
  const stored = await attachToMessage(fileIds, me.id, id, messageId);
  if (!stored) return fail("One of the attachments is no longer available. Remove it and attach it again.");

  try {
    const result = await mutateDb((db) => {
      const c = db.conversations.find((x) => x.id === id);
      if (!c || !canAccess(c, me.id)) return null;
      const now = new Date().toISOString();
      const receipts = Object.fromEntries(recipientsOf(db, c, me.id).map((rid) => [rid, hub.isReachable(rid) ? { deliveredAt: now } : {}]));
      const msg: ChatMessage = {
        id: messageId, conversationId: id, authorMemberId: me.id, authorName: me.name, authorInitials: me.initials,
        body: text, createdAt: now, reactions: [], attachments: [...stored, ...legacy], receipts,
      };
      (db.messages[id] ??= []).push(msg);
      return { message: presentMessage(db, msg, me.id), conversation: c, aud: audienceOf(c) };
    });
    if (!result) {
      await detach(fileIds, messageId);
      return fail("Conversation not found", 404);
    }
    hub.clearTyping(id, me.id);
    publishMessage(result.conversation, "created", [messageId]);
    return ok(result.message, 201);
  } catch (error) {
    await detach(fileIds, messageId);
    throw error;
  }
});
