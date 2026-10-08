"use client";

import { useRef, useState } from "react";
import { Copy, SmilePlus } from "lucide-react";
import { Avatar } from "@/components/shared/Avatar";
import { useDismiss } from "@/hooks/useClickOutside";
import { useToast } from "@/providers/ToastProvider";
import { copyText } from "@/lib/chat";
import { formatTimeShort } from "@/lib/time";
import { cx } from "@/lib/utils";
import type { ChatMessage } from "@/types/models";
import { AttachmentList } from "./AttachmentView";
import { MessageBody } from "./MessageBody";
import { MessageStatusLine } from "./MessageStatusLine";
import styles from "./Channels.module.css";

const REACTION_CHOICES = ["👍", "🚀", "✅", "👀", "❤️", "🎉"];

interface MessageItemProps {
  message: ChatMessage;
  self: boolean;
  tz: string;
  /** Show the whole text (e.g. while searching, so a match is never hidden behind "Show more"). */
  forceExpanded?: boolean;
  onReact: (emoji: string) => void;
  onMediaLoad?: () => void;
}

export function MessageItem({ message: m, self, tz, forceExpanded, onReact, onMediaLoad }: MessageItemProps) {
  const toast = useToast();
  const [picker, setPicker] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, picker, () => setPicker(false));

  const copy = async () => {
    // Copies the message's original text, exactly — line breaks, indentation, bullets and numbering included.
    if (await copyText(m.body)) toast.success("Message copied");
    else toast.error("Couldn't copy. Select the text and press Ctrl/⌘+C instead.");
  };

  return (
    <article className={cx(styles.message, self && styles.messageSelf)} aria-label={`${m.authorName} at ${formatTimeShort(new Date(m.createdAt), tz)}`}>
      {!self && <Avatar initials={m.authorInitials} size={36} />}
      <div className={styles.bubbleWrap}>
        <div className={styles.byline}>
          <span className={styles.author}>{m.authorName}</span>
          <span className={styles.time} suppressHydrationWarning>
            {formatTimeShort(new Date(m.createdAt), tz)}
          </span>
        </div>
        <div className={cx(styles.bubble, self && styles.bubbleSelf, !m.body && styles.bubbleMedia)}>
          {m.body && <MessageBody text={m.body} forceExpanded={forceExpanded} />}
          {m.attachments.length > 0 && (
            <div style={{ marginTop: m.body ? 8 : 0 }}>
              <AttachmentList attachments={m.attachments} onMediaLoad={onMediaLoad} />
            </div>
          )}
        </div>
        {self && m.status && <MessageStatusLine status={m.status} tz={tz} />}
        <div className={styles.reactions} ref={ref}>
          {m.reactions.map((r) => (
            <button key={r.emoji} type="button" className={cx(styles.reaction, r.reacted && styles.reactionOn)} aria-pressed={r.reacted} aria-label={`${r.emoji} ${r.count}${r.reacted ? ", you reacted" : ""}`} onClick={() => onReact(r.emoji)}>
              <span aria-hidden="true">{r.emoji}</span> {r.count}
            </button>
          ))}
          <button type="button" className={styles.addReaction} aria-label="Add reaction" aria-expanded={picker} onClick={() => setPicker((p) => !p)}>
            <SmilePlus size={15} />
          </button>
          {m.body && (
            <button type="button" className={styles.addReaction} aria-label="Copy message" title="Copy message" onClick={copy}>
              <Copy size={14} />
            </button>
          )}
          {picker && (
            <div className={styles.picker} role="menu" aria-label="Choose a reaction">
              {REACTION_CHOICES.map((e) => (
                <button
                  key={e}
                  type="button"
                  role="menuitem"
                  className={styles.pick}
                  onClick={() => {
                    setPicker(false);
                    onReact(e);
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
