/**
 * Chat attachments.
 *
 * Bytes are stored in PostgreSQL (`teambase_attachments`) so uploads survive redeploys on hosts with ephemeral disks;
 * messages only keep a small reference (id, name, size, type). Without DATABASE_URL they live in memory.
 *
 * Safety: the type of a file is decided from its BYTES, never from its name or the browser's claimed Content-Type.
 * Only a short allow-list of types is ever served inline (and never HTML/SVG/script); everything else is forced to download.
 */
import { randomUUID } from "node:crypto";
import { getPool, hasDatabase } from "./db";
import type { Attachment, AttachmentKind, ID } from "@/types/models";

export { MAX_FILE_BYTES, MAX_FILES_PER_MESSAGE } from "@/lib/chat-limits";

export interface StoredFile {
  id: string;
  uploaderId: ID;
  name: string;
  mime: string;
  kind: AttachmentKind;
  size: number;
  conversationId: ID | null;
  messageId: ID | null;
  data: Buffer;
}
export type FileMeta = Omit<StoredFile, "data">;

/* ------------------------------ type detection ------------------------------ */

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.slice(from, to));

const TEXT_EXT = new Set(["txt", "md", "markdown", "csv", "tsv", "json", "log", "yml", "yaml", "ini", "toml", "env", "conf", "sql", "sh", "ts", "tsx", "js", "jsx", "mjs", "css", "py", "rb", "go", "rs", "java", "c", "h", "cpp", "cs", "php", "xml"]);

export const extensionOf = (name: string): string => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

function looksLikeText(bytes: Uint8Array): boolean {
  const sample = bytes.slice(0, 64 * 1024);
  if (sample.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample);
    return true;
  } catch {
    // A multi-byte character can be cut by the sample boundary; tolerate that for big files only.
    return bytes.length > sample.length && (() => { try { new TextDecoder("utf-8", { fatal: true }).decode(sample.slice(0, sample.length - 3)); return true; } catch { return false; } })();
  }
}

/** What a file really is, and whether a browser may render it inline. */
export function sniff(name: string, bytes: Uint8Array): { mime: string; kind: AttachmentKind; inline: boolean } {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", kind: "image", inline: true };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", kind: "image", inline: true };
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") return { mime: "image/gif", kind: "image", inline: true };
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return { mime: "image/webp", kind: "image", inline: true };
  if (ascii(bytes, 0, Math.min(bytes.length, 1024)).includes("%PDF-")) return { mime: "application/pdf", kind: "pdf", inline: true };
  if (ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12);
    if (brand === "M4A ") return { mime: "audio/mp4", kind: "audio", inline: true };
    return { mime: brand === "qt  " ? "video/quicktime" : "video/mp4", kind: "video", inline: true };
  }
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return { mime: "video/webm", kind: "video", inline: true };
  if (ascii(bytes, 0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return { mime: "audio/mpeg", kind: "audio", inline: true };
  if (ascii(bytes, 0, 4) === "OggS") return { mime: "audio/ogg", kind: "audio", inline: true };
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WAVE") return { mime: "audio/wav", kind: "audio", inline: true };
  if (TEXT_EXT.has(extensionOf(name)) && looksLikeText(bytes)) return { mime: "text/plain; charset=utf-8", kind: "text", inline: true };
  return { mime: "application/octet-stream", kind: "file", inline: false };
}

export const toAttachment = (f: FileMeta): Attachment => ({ id: f.id, name: f.name, size: f.size, mime: f.mime, kind: f.kind });

/* ------------------------------ storage ------------------------------ */

const g = globalThis as unknown as { __teambaseFiles?: Map<string, StoredFile & { createdAt: number }> };
const memory = () => (g.__teambaseFiles ??= new Map());

interface Row {
  id: string; uploader_id: string; name: string; mime: string; kind: AttachmentKind; size: number;
  conversation_id: string | null; message_id: string | null; data?: Buffer;
}
const META_COLS = "id, uploader_id, name, mime, kind, size, conversation_id, message_id";
const toMeta = (r: Row): FileMeta => ({
  id: r.id, uploaderId: r.uploader_id, name: r.name, mime: r.mime, kind: r.kind, size: r.size, conversationId: r.conversation_id, messageId: r.message_id,
});

/** Clean up uploads that were never sent (user picked a file, then abandoned the message). */
async function pruneOrphans() {
  if (hasDatabase()) {
    await getPool().query("DELETE FROM teambase_attachments WHERE message_id IS NULL AND created_at < NOW() - INTERVAL '2 hours'").catch(() => undefined);
  } else {
    for (const [id, f] of memory()) if (!f.messageId && Date.now() - f.createdAt > 2 * 3600_000) memory().delete(id);
  }
}

export async function pendingCount(uploaderId: ID): Promise<number> {
  if (!hasDatabase()) return [...memory().values()].filter((f) => f.uploaderId === uploaderId && !f.messageId).length;
  const r = await getPool().query("SELECT COUNT(*)::int AS n FROM teambase_attachments WHERE uploader_id = $1 AND message_id IS NULL", [uploaderId]);
  return r.rows[0].n;
}

export async function saveFile(uploaderId: ID, name: string, bytes: Buffer): Promise<{ file: FileMeta; attachment: Attachment }> {
  const clean = name.replace(/[\u0000-\u001f\u007f/\\]+/g, "_").trim().slice(0, 180) || "file";
  const { mime, kind } = sniff(clean, bytes);
  const id = `f_${randomUUID().replace(/-/g, "")}`;
  void pruneOrphans();
  if (hasDatabase()) {
    await getPool().query(
      "INSERT INTO teambase_attachments (id, uploader_id, name, mime, kind, size, data) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [id, uploaderId, clean, mime, kind, bytes.length, bytes],
    );
  } else {
    memory().set(id, { id, uploaderId, name: clean, mime, kind, size: bytes.length, conversationId: null, messageId: null, data: bytes, createdAt: Date.now() });
  }
  const file: FileMeta = { id, uploaderId, name: clean, mime, kind, size: bytes.length, conversationId: null, messageId: null };
  return { file, attachment: toAttachment(file) };
}

export async function getFile(id: string): Promise<StoredFile | null> {
  if (!hasDatabase()) return memory().get(id) ?? null;
  const r = await getPool().query<Row>(`SELECT ${META_COLS}, data FROM teambase_attachments WHERE id = $1`, [id]);
  return r.rows[0] ? { ...toMeta(r.rows[0]), data: r.rows[0].data as Buffer } : null;
}

export async function getFileMeta(id: string): Promise<FileMeta | null> {
  if (!hasDatabase()) {
    const f = memory().get(id);
    if (!f) return null;
    const { data: _data, createdAt: _createdAt, ...meta } = f;
    void _data; void _createdAt;
    return meta;
  }
  const r = await getPool().query<Row>(`SELECT ${META_COLS} FROM teambase_attachments WHERE id = $1`, [id]);
  return r.rows[0] ? toMeta(r.rows[0]) : null;
}

/**
 * Claim uploaded files for a message. Only the uploader's own, not-yet-sent files qualify — so nobody can attach (and thereby
 * expose) a file somebody else uploaded. Returns null if any id is invalid, so a message never references a file it can't serve.
 */
export async function attachToMessage(ids: string[], uploaderId: ID, conversationId: ID, messageId: ID): Promise<Attachment[] | null> {
  if (!ids.length) return [];
  if (!hasDatabase()) {
    const files = ids.map((id) => memory().get(id));
    if (files.some((f) => !f || f.uploaderId !== uploaderId || f.messageId)) return null;
    for (const f of files) Object.assign(f!, { conversationId, messageId });
    return files.map((f) => toAttachment(f!));
  }
  const r = await getPool().query<Row>(
    `UPDATE teambase_attachments SET conversation_id = $3, message_id = $4
       WHERE id = ANY($1) AND uploader_id = $2 AND message_id IS NULL RETURNING ${META_COLS}`,
    [ids, uploaderId, conversationId, messageId],
  );
  if (r.rowCount !== new Set(ids).size) {
    await detach(ids, messageId);
    return null;
  }
  const byId = new Map(r.rows.map((row) => [row.id, toAttachment(toMeta(row))]));
  return ids.map((id) => byId.get(id)!);
}

/** Undo `attachToMessage` (the message could not be saved). */
export async function detach(ids: string[], messageId: ID): Promise<void> {
  if (!hasDatabase()) {
    for (const id of ids) { const f = memory().get(id); if (f?.messageId === messageId) Object.assign(f, { conversationId: null, messageId: null }); }
    return;
  }
  await getPool().query("UPDATE teambase_attachments SET conversation_id = NULL, message_id = NULL WHERE id = ANY($1) AND message_id = $2", [ids, messageId]).catch(() => undefined);
}

/** Remove an unsent upload (the user removed the chip). */
export async function deletePending(id: string, uploaderId: ID): Promise<boolean> {
  if (!hasDatabase()) {
    const f = memory().get(id);
    if (f && f.uploaderId === uploaderId && !f.messageId) return memory().delete(id);
    return false;
  }
  const r = await getPool().query("DELETE FROM teambase_attachments WHERE id = $1 AND uploader_id = $2 AND message_id IS NULL", [id, uploaderId]);
  return (r.rowCount ?? 0) > 0;
}

export async function deleteForConversation(conversationId: ID): Promise<void> {
  if (!hasDatabase()) {
    for (const [id, f] of memory()) if (f.conversationId === conversationId) memory().delete(id);
    return;
  }
  await getPool().query("DELETE FROM teambase_attachments WHERE conversation_id = $1", [conversationId]).catch(() => undefined);
}
