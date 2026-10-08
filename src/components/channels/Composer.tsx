"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertCircle, File as FileIcon, Loader2, Paperclip, Send, Smile, X } from "lucide-react";
import { useDismiss } from "@/hooks/useClickOutside";
import { useToast } from "@/providers/ToastProvider";
import { attachmentService, errorMessage } from "@/services";
import { MAX_BODY, MAX_FILES_PER_MESSAGE, MAX_FILE_BYTES } from "@/lib/chat-limits";
import { cx, formatBytes } from "@/lib/utils";
import type { Attachment } from "@/types/models";
import styles from "./Channels.module.css";

const EMOJI_CHOICES = ["😀", "😂", "😊", "😍", "🤔", "😅", "👍", "👏", "🙏", "🚀", "🎉", "✅", "🔥", "💡", "👀", "❤️", "💯", "🙌"];

/** Unsent text per conversation, so switching channels (or a re-render) never costs you a long message. */
const drafts = new Map<string, string>();

interface PendingFile {
  key: string;
  name: string;
  size: number;
  status: "uploading" | "done" | "error";
  progress: number;
  attachment?: Attachment;
  /** Local object URL, for an instant thumbnail while (and after) the image uploads. */
  preview?: string;
  error?: string;
  abort?: () => void;
}

interface ComposerProps {
  conversationId: string;
  placeholder: string;
  onSend: (body: string, attachments: Attachment[]) => Promise<void>;
  /** Called with true while the person is typing and false when they stop. */
  onTyping: (typing: boolean) => void;
}

export function Composer({ conversationId, placeholder, onSend, onTyping }: ComposerProps) {
  const toast = useToast();
  const [text, setText] = useState(() => drafts.get(conversationId) ?? "");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [emoji, setEmoji] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const filesRef = useRef(files);
  const textRef = useRef(text);
  useEffect(() => {
    filesRef.current = files;
    textRef.current = text;
  });
  useDismiss(wrap, emoji, () => setEmoji(false));

  /* ----- typing: tell the others while composing, stop when idle / sent / left ----- */
  const typingRef = useRef(onTyping);
  useEffect(() => {
    typingRef.current = onTyping;
  });
  const lastSent = useRef(0);
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stopTyping = useCallback(() => {
    clearTimeout(idle.current);
    if (lastSent.current) {
      lastSent.current = 0;
      typingRef.current(false);
    }
  }, []);
  const noteTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastSent.current > 2500) {
      lastSent.current = now;
      typingRef.current(true); // refreshed every few seconds: the server expires it if we ever stop
    }
    clearTimeout(idle.current);
    idle.current = setTimeout(stopTyping, 4000);
  }, [stopTyping]);

  const change = (value: string) => {
    setText(value);
    if (value) drafts.set(conversationId, value);
    else drafts.delete(conversationId);
    if (value.trim()) noteTyping();
    else stopTyping();
  };

  // Grow with the text (up to a limit, then scroll), so multi-line messages are visible as you write them.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  // Leaving the conversation: stop typing, cancel unfinished uploads, discard unsent uploads.
  useEffect(
    () => () => {
      stopTyping();
      for (const f of filesRef.current) {
        if (f.preview) URL.revokeObjectURL(f.preview);
        if (f.status === "uploading") f.abort?.();
        else if (f.attachment?.id) void attachmentService.remove(f.attachment.id).catch(() => undefined);
      }
    },
    [stopTyping],
  );

  /* ----- attachments ----- */
  const addFiles = (incoming: File[]) => {
    const room = MAX_FILES_PER_MESSAGE - filesRef.current.length;
    if (room <= 0) return toast.error(`You can attach up to ${MAX_FILES_PER_MESSAGE} files to one message.`);
    if (incoming.length > room) toast.error(`Only ${room} more file${room === 1 ? "" : "s"} can be attached — the rest were skipped.`);
    for (const file of incoming.slice(0, room)) {
      if (file.size === 0) {
        toast.error(`“${file.name}” is empty.`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`“${file.name}” is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
        continue;
      }
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
      const handle = attachmentService.upload(file, (p) => setFiles((cur) => cur.map((f) => (f.key === key ? { ...f, progress: p } : f))));
      setFiles((cur) => [...cur, { key, name: file.name, size: file.size, status: "uploading", progress: 0, preview, abort: handle.abort }]);
      handle.promise
        .then((attachment) => setFiles((cur) => cur.map((f) => (f.key === key ? { ...f, status: "done", progress: 1, attachment } : f))))
        .catch((err) => setFiles((cur) => cur.map((f) => (f.key === key ? { ...f, status: "error", error: errorMessage(err) } : f))));
    }
  };

  const removeFile = (f: PendingFile) => {
    if (f.status === "uploading") f.abort?.();
    else if (f.attachment?.id) void attachmentService.remove(f.attachment.id).catch(() => undefined);
    if (f.preview) URL.revokeObjectURL(f.preview);
    setFiles((cur) => cur.filter((x) => x.key !== f.key));
  };

  const onPaste = (e: React.ClipboardEvent) => {
    // A screenshot on the clipboard becomes an attachment. Anything with text is left alone so pasted text keeps its formatting.
    const pasted = Array.from(e.clipboardData.files);
    if (pasted.length && !e.clipboardData.getData("text/plain")) {
      e.preventDefault();
      addFiles(pasted);
    }
  };

  /* ----- sending ----- */
  const ready = files.filter((f) => f.status === "done" && f.attachment);
  const uploading = files.some((f) => f.status === "uploading");
  const over = text.length - MAX_BODY;
  const canSend = (text.trim().length > 0 || ready.length > 0) && !uploading && over <= 0;

  const submit = () => {
    if (!canSend) return;
    const body = text;
    const sent = ready;
    stopTyping();
    // Clear straight away so you can keep typing the next message while this one is on its way (and a second Enter can't double-send).
    setText("");
    drafts.delete(conversationId);
    setFiles([]);
    onSend(
      body,
      sent.map((f) => f.attachment!),
    )
      .then(() => {
        for (const f of sent) if (f.preview) URL.revokeObjectURL(f.preview);
      })
      .catch((err) => {
        toast.error(errorMessage(err));
        // Nothing is lost: put the message and its files back (unless you've already started something new).
        if (!textRef.current) {
          setText(body);
          if (body) drafts.set(conversationId, body);
        }
        setFiles((cur) => (cur.length ? cur : sent));
      });
    area.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter inserts a line break. (Never while an IME is composing a character.)
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const insertAtCursor = (s: string) => {
    const el = area.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? start;
    change(text.slice(0, start) + s + text.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + s.length, start + s.length);
    });
  };

  return (
    <div
      className={cx(styles.composerWrap, dragging && styles.composerDrop)}
      ref={wrap}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        addFiles(Array.from(e.dataTransfer.files));
      }}
    >
      {files.length > 0 && (
        <ul className={styles.pending} aria-label="Attachments to send">
          {files.map((f) => (
            <li key={f.key} className={cx(styles.pendingChip, f.status === "error" && styles.pendingError)}>
              {f.preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                <img className={styles.pendingThumb} src={f.preview} alt="" />
              ) : (
                <span className={styles.pendingIcon} aria-hidden="true">
                  {f.status === "error" ? <AlertCircle size={16} /> : <FileIcon size={16} />}
                </span>
              )}
              <span className={styles.pendingText}>
                <span className={styles.pendingName} title={f.name}>
                  {f.name}
                </span>
                <span className={styles.pendingMeta}>
                  {f.status === "uploading" ? (
                    <>
                      <Loader2 size={11} className={styles.spin} aria-hidden="true" /> Uploading {Math.round(f.progress * 100)}%
                    </>
                  ) : f.status === "error" ? (
                    f.error
                  ) : (
                    formatBytes(f.size)
                  )}
                </span>
                {f.status === "uploading" && (
                  <span className={styles.pendingBar} role="progressbar" aria-label={`Uploading ${f.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(f.progress * 100)}>
                    <span style={{ width: `${f.progress * 100}%` }} />
                  </span>
                )}
              </span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => removeFile(f)}>
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {emoji && (
        <div className={styles.emojiPanel} role="menu" aria-label="Insert emoji">
          {EMOJI_CHOICES.map((e) => (
            <button
              key={e}
              type="button"
              role="menuitem"
              className={styles.pick}
              onClick={() => {
                setEmoji(false);
                insertAtCursor(e);
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}

      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          ref={picker}
          type="file"
          hidden
          multiple
          aria-label="Attach files"
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <button type="button" className={styles.composerBtn} aria-label="Attach file" onClick={() => picker.current?.click()}>
          <Paperclip size={18} />
        </button>
        <textarea
          ref={area}
          className={styles.composerInput}
          rows={1}
          value={text}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-describedby="composer-hint"
          spellCheck
          onChange={(e) => change(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            stopTyping();
          }}
        />
        <button type="button" className={styles.composerBtn} aria-label="Insert emoji" aria-expanded={emoji} onClick={() => setEmoji((v) => !v)}>
          <Smile size={18} />
        </button>
        <button type="submit" className={cx(styles.composerBtn, styles.send)} aria-label="Send message" disabled={!canSend}>
          <Send size={18} />
        </button>
      </form>

      <p id="composer-hint" className={cx(styles.composerHint, over > 0 && styles.composerOver)} role={over > 0 ? "alert" : undefined}>
        {over > 0
          ? `This message is ${over.toLocaleString("en-US")} character${over === 1 ? "" : "s"} over the ${MAX_BODY.toLocaleString("en-US")} limit — shorten it or split it into two.`
          : text.length > MAX_BODY * 0.8
            ? `${text.length.toLocaleString("en-US")} / ${MAX_BODY.toLocaleString("en-US")} characters`
            : focused || text
              ? "Enter to send · Shift+Enter for a new line"
              : ""}
      </p>
    </div>
  );
}
