/** Pure helpers for the messaging UI (no React), so the wording and formatting rules are easy to test. */
import { dateKey, formatKeyMonthDay, formatTimeShort, zonedParts } from "./time";
import type { Attachment, AttachmentKind, MessageStatus } from "@/types/models";

/* ------------------------------ typing ------------------------------ */

/** "Stad is typing…" · "Stad and Ray are typing…" · "Stad, Ray and 2 others are typing…" · "" when nobody is. */
export function typingLabel(names: string[]): string {
  const n = Array.from(new Set(names));
  if (n.length === 0) return "";
  if (n.length === 1) return `${n[0]} is typing…`;
  if (n.length === 2) return `${n[0]} and ${n[1]} are typing…`;
  const rest = n.length - 2;
  return `${n[0]}, ${n[1]} and ${rest} other${rest === 1 ? "" : "s"} are typing…`;
}

/* ------------------------------ timestamps ------------------------------ */

/** "8:47 PM" for today; "Oct 7, 8:47 PM" for another day this year; "Oct 7, 2025, 8:47 PM" for another year. */
export function formatStamp(iso: string, tz: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const time = formatTimeShort(d, tz);
  const day = dateKey(d, tz);
  if (day === dateKey(now, tz)) return time;
  const sameYear = zonedParts(d, tz).year === zonedParts(now, tz).year;
  return `${formatKeyMonthDay(day)}${sameYear ? "" : `, ${zonedParts(d, tz).year}`}, ${time}`;
}

/** "Wednesday, October 7, 2026 at 8:47:12 PM" — for tooltips and the message-info panel. */
export function formatFull(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, dateStyle: "full", timeStyle: "medium" }).format(new Date(iso)).replace(/\u202f/g, " ");
}

/* ------------------------------ message status ------------------------------ */

export interface StatusView {
  state: MessageStatus["state"];
  /** "Sent" · "Delivered" · "Seen" · "Seen by 2 of 3" · "Delivered to 2 of 3" · "Seen by everyone" */
  label: string;
  /** When that state was reached (the latest recipient so far). */
  at: string;
  /** Screen-reader / tooltip text with the full date and time. */
  full: string;
}

export function statusView(s: MessageStatus, tz: string): StatusView {
  const multi = s.total > 1;
  let label: string;
  let at: string;
  if (s.seenCount > 0 && s.seenAt) {
    label = !multi ? "Seen" : s.seenCount === s.total ? "Seen by everyone" : `Seen by ${s.seenCount} of ${s.total}`;
    at = s.seenAt;
  } else if (s.deliveredCount > 0 && s.deliveredAt) {
    label = !multi || s.deliveredCount === s.total ? "Delivered" : `Delivered to ${s.deliveredCount} of ${s.total}`;
    at = s.deliveredAt;
  } else {
    label = "Sent";
    at = s.sentAt;
  }
  return { state: s.state, label, at, full: `${label} ${formatFull(at, tz)}` };
}

/* ------------------------------ files ------------------------------ */

const TYPE_LABELS: Record<string, string> = {
  pdf: "PDF document", doc: "Word document", docx: "Word document", rtf: "Rich text document", odt: "Document",
  xls: "Excel spreadsheet", xlsx: "Excel spreadsheet", csv: "CSV file", ods: "Spreadsheet",
  ppt: "PowerPoint presentation", pptx: "PowerPoint presentation", key: "Keynote presentation",
  zip: "ZIP archive", rar: "RAR archive", "7z": "7-Zip archive", gz: "Compressed archive", tar: "Archive",
  txt: "Text file", md: "Markdown file", json: "JSON file", log: "Log file", xml: "XML file", yml: "YAML file", yaml: "YAML file",
  fig: "Figma file", psd: "Photoshop file", ai: "Illustrator file", sketch: "Sketch file", svg: "SVG image",
  mp3: "Audio", wav: "Audio", m4a: "Audio", ogg: "Audio", mp4: "Video", mov: "Video", webm: "Video",
  png: "Image", jpg: "Image", jpeg: "Image", gif: "Image", webp: "Image",
};

const MEDIA_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "mp4", "mov", "webm", "mp3", "wav", "m4a", "ogg", "pdf"]);

export function fileTypeLabel(a: Pick<Attachment, "name" | "kind">): string {
  const ext = a.name.includes(".") ? a.name.split(".").pop()!.toLowerCase() : "";
  // The server decides a file's kind from its bytes. If it says "file" but the name claims media, don't repeat the claim.
  if (a.kind === "file" && MEDIA_EXT.has(ext)) return `${ext.toUpperCase()} file`;
  if (TYPE_LABELS[ext]) return TYPE_LABELS[ext];
  if (a.kind === "image") return "Image";
  if (a.kind === "video") return "Video";
  if (a.kind === "audio") return "Audio";
  if (a.kind === "pdf") return "PDF document";
  if (a.kind === "text") return "Text file";
  return ext ? `${ext.toUpperCase()} file` : "File";
}

/** Whether the chat can show something richer than a file card. */
export const hasInlinePreview = (kind?: AttachmentKind): boolean => kind === "image" || kind === "video" || kind === "audio" || kind === "text";

export const attachmentUrl = (id: string, download = false): string => `/api/attachments/${id}${download ? "?download=1" : ""}`;

/* ------------------------------ clipboard ------------------------------ */

/** Copies text exactly as given (line breaks, indentation, bullets and all). Falls back for non-secure (plain http) pages. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  Object.assign(area.style, { position: "fixed", top: "0", left: "-9999px", whiteSpace: "pre" });
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand("copy");
  } finally {
    area.remove();
  }
}
