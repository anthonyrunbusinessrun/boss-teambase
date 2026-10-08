import { fail, ok } from "@/server/http";
import { accessibleAudience } from "@/server/chat-events";
import { deletePending, getFile, getFileMeta } from "@/server/files";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

const rfc5987 = (s: string) => encodeURIComponent(s).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
const asciiName = (s: string) => s.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");

/** Parse a single "bytes=a-b" range. Returns null when absent, "invalid" when unsatisfiable. */
function parseRange(header: string | null, size: number): { start: number; end: number } | null | "invalid" {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return "invalid";
  let start: number;
  let end: number;
  if (m[1] === "") {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  return start > end || start >= size ? "invalid" : { start, end };
}

/**
 * GET — the file itself, for people who can see the conversation it was sent in.
 *   (default)       images, PDFs, audio, video and text open inline so the chat can preview them; anything else downloads.
 *   ?download=1     always saves to disk under the original filename.
 *   ?preview=text   JSON with the first lines of a text file, for the in-chat snippet.
 */
export const GET = authed<Ctx>(async (req: Request, { params }: Ctx, me) => {
  const { id } = await params;
  const meta = await getFileMeta(id);
  const allowed = meta && (meta.messageId && meta.conversationId ? !!(await accessibleAudience(meta.conversationId, me.id)) : meta.uploaderId === me.id);
  if (!meta || !allowed) return fail("File not found", 404);
  const file = await getFile(id);
  if (!file) return fail("File not found", 404);

  const url = new URL(req.url);
  if (url.searchParams.get("preview") === "text") {
    if (file.kind !== "text") return fail("No text preview for this file.", 415);
    const text = file.data.subarray(0, 6_000).toString("utf8").replace(/\uFFFD$/, "");
    const lines = text.split("\n");
    return ok({ text: lines.slice(0, 40).join("\n"), truncated: file.size > 6_000 || lines.length > 40 });
  }

  const download = url.searchParams.get("download") === "1" || file.kind === "file";
  const headers: Record<string, string> = {
    "Content-Type": file.mime,
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${asciiName(file.name)}"; filename*=UTF-8''${rfc5987(file.name)}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
    // Nothing a user uploads may ever run script in our origin. (PDFs are skipped: Chrome's PDF viewer breaks under CSP sandbox.)
    ...(file.kind === "pdf" ? {} : { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" }),
  };

  const range = parseRange(req.headers.get("range"), file.size);
  if (range === "invalid") return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${file.size}` } });
  if (range) {
    const slice = file.data.subarray(range.start, range.end + 1);
    return new Response(new Uint8Array(slice), {
      status: 206,
      headers: { ...headers, "Content-Length": String(slice.length), "Content-Range": `bytes ${range.start}-${range.end}/${file.size}` },
    });
  }
  return new Response(new Uint8Array(file.data), { headers: { ...headers, "Content-Length": String(file.size) } });
});

/** DELETE — remove a file you uploaded but haven't sent yet (you removed it from the composer). */
export const DELETE = authed<Ctx>(async (_req: Request, { params }: Ctx, me) => {
  const { id } = await params;
  return (await deletePending(id, me.id)) ? ok({ id }) : fail("File not found", 404);
});
