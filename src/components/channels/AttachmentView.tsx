"use client";

import { useEffect, useState } from "react";
import { Archive, Download, ExternalLink, File as FileIcon, FileSpreadsheet, FileText, Film, Music, Paperclip } from "lucide-react";
import { Button } from "@/components/buttons/Button";
import { Modal } from "@/components/modals/Modal";
import { attachmentService } from "@/services";
import { attachmentUrl, fileTypeLabel } from "@/lib/chat";
import { cx, formatBytes } from "@/lib/utils";
import type { Attachment } from "@/types/models";
import styles from "./Channels.module.css";

interface AttachmentListProps {
  attachments: Attachment[];
  /** Called when an image/video finishes loading, so the thread can stay scrolled to the bottom. */
  onMediaLoad?: () => void;
}

/** What a message's attachments look like: real previews for images, video, audio and text; a file card (with Download) for the rest. */
export function AttachmentList({ attachments, onMediaLoad }: AttachmentListProps) {
  return (
    <div className={styles.attachments}>
      {attachments.map((a, i) => (
        <AttachmentItem key={a.id ?? `${a.name}-${i}`} attachment={a} onMediaLoad={onMediaLoad} />
      ))}
    </div>
  );
}

function AttachmentItem({ attachment: a, onMediaLoad }: { attachment: Attachment; onMediaLoad?: () => void }) {
  // Sent before files were stored: only a name and size survive, so there is nothing to preview or download.
  if (!a.id) {
    return (
      <span className={styles.attachment} title="This file was attached before downloads were supported, so it can't be opened.">
        <Paperclip size={12} /> {a.name}
        {a.size > 0 && <span style={{ color: "var(--text-muted)" }}>{formatBytes(a.size)}</span>}
      </span>
    );
  }
  switch (a.kind) {
    case "image":
      return <ImageAttachment a={a} onLoad={onMediaLoad} />;
    case "video":
      return (
        <MediaCard a={a}>
          <video className={styles.video} src={attachmentUrl(a.id)} controls preload="metadata" onLoadedMetadata={onMediaLoad} aria-label={a.name} />
        </MediaCard>
      );
    case "audio":
      return (
        <MediaCard a={a}>
          <audio className={styles.audio} src={attachmentUrl(a.id)} controls preload="metadata" aria-label={a.name} />
        </MediaCard>
      );
    default:
      return <FileCard a={a} onLoad={onMediaLoad} />;
  }
}

/** A small caption under a preview: filename, size and the Download action. */
function Caption({ a }: { a: Attachment }) {
  return (
    <div className={styles.caption}>
      <span className={styles.captionText}>
        <span className={styles.fileName} title={a.name}>
          {a.name}
        </span>
        <span className={styles.fileMeta}>
          {fileTypeLabel(a)} · {formatBytes(a.size)}
        </span>
      </span>
      <a className={styles.iconLink} href={attachmentUrl(a.id!, true)} download={a.name} aria-label={`Download ${a.name}`} title="Download">
        <Download size={16} />
      </a>
    </div>
  );
}

function MediaCard({ a, children }: { a: Attachment; children: React.ReactNode }) {
  return (
    <div className={styles.mediaCard}>
      {children}
      <Caption a={a} />
    </div>
  );
}

function ImageAttachment({ a, onLoad }: { a: Attachment; onLoad?: () => void }) {
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);
  if (broken) return <FileCard a={a} />;
  return (
    <div className={styles.mediaCard}>
      <button type="button" className={styles.imageBtn} onClick={() => setOpen(true)} aria-label={`Preview ${a.name}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated, same-origin, user-uploaded: next/image can't optimise it */}
        <img className={styles.image} src={attachmentUrl(a.id!)} alt={a.name} loading="lazy" decoding="async" onLoad={onLoad} onError={() => setBroken(true)} />
      </button>
      <Caption a={a} />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={a.name}
        subtitle={`${fileTypeLabel(a)} · ${formatBytes(a.size)}`}
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            <a className={styles.downloadBtn} href={attachmentUrl(a.id!, true)} download={a.name}>
              <Download size={15} /> Download
            </a>
          </>
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.lightboxImage} src={attachmentUrl(a.id!)} alt={a.name} />
      </Modal>
    </div>
  );
}

const ICON_KIND: Record<string, "doc" | "sheet" | "archive" | "video" | "audio"> = {
  pdf: "doc", doc: "doc", docx: "doc", txt: "doc", md: "doc", rtf: "doc",
  xls: "sheet", xlsx: "sheet", csv: "sheet", ods: "sheet",
  zip: "archive", rar: "archive", "7z": "archive", gz: "archive", tar: "archive",
  mp4: "video", mov: "video", webm: "video", mp3: "audio", wav: "audio", m4a: "audio", ogg: "audio",
};

/** The icon for a file card, chosen from its extension (returns JSX, so no component is created during render). */
function FileTypeIcon({ a }: { a: Attachment }) {
  const ext = a.name.includes(".") ? a.name.split(".").pop()!.toLowerCase() : "";
  const kind = ICON_KIND[ext] ?? (a.kind === "pdf" || a.kind === "text" ? "doc" : undefined);
  switch (kind) {
    case "doc":
      return <FileText size={20} />;
    case "sheet":
      return <FileSpreadsheet size={20} />;
    case "archive":
      return <Archive size={20} />;
    case "video":
      return <Film size={20} />;
    case "audio":
      return <Music size={20} />;
    default:
      return <FileIcon size={20} />;
  }
}

/** A file we can't render in the chat itself: name, type, size, and the actions that make sense (Open for PDFs, Download always). */
function FileCard({ a, onLoad }: { a: Attachment; onLoad?: () => void }) {
  return (
    <div className={cx(styles.fileCard, a.kind === "pdf" && styles.fileCardPdf)}>
      <div className={styles.fileRow}>
        <span className={styles.fileIcon} aria-hidden="true">
          <FileTypeIcon a={a} />
        </span>
        <span className={styles.captionText}>
          <span className={styles.fileName} title={a.name}>
            {a.name}
          </span>
          <span className={styles.fileMeta}>
            {fileTypeLabel(a)} · {formatBytes(a.size)}
          </span>
        </span>
        <span className={styles.fileActions}>
          {a.kind === "pdf" && (
            <a className={styles.iconLink} href={attachmentUrl(a.id!)} target="_blank" rel="noopener noreferrer" aria-label={`Open ${a.name} in a new tab`} title="Open">
              <ExternalLink size={16} />
            </a>
          )}
          <a className={styles.iconLink} href={attachmentUrl(a.id!, true)} download={a.name} aria-label={`Download ${a.name}`} title="Download">
            <Download size={16} />
          </a>
        </span>
      </div>
      {a.kind === "text" && <TextSnippet id={a.id!} onLoad={onLoad} />}
    </div>
  );
}

/** The first lines of a text file, right in the chat. */
function TextSnippet({ id, onLoad }: { id: string; onLoad?: () => void }) {
  const [snippet, setSnippet] = useState<{ text: string; truncated: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    attachmentService
      .textPreview(id)
      .then((s) => {
        if (alive) {
          setSnippet(s);
          requestAnimationFrame(() => onLoad?.());
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per file
  }, [id]);
  if (!snippet) return null;
  return (
    <pre className={styles.snippet} aria-label="File preview">
      {snippet.text}
      {snippet.truncated && <span className={styles.snippetMore}>{"\n…"}</span>}
    </pre>
  );
}
