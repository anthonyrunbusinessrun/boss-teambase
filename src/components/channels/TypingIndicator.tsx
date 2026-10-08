import { typingLabel } from "@/lib/chat";
import styles from "./Channels.module.css";

/**
 * "Stad is typing…". The slot always exists (fixed height), so the thread never jumps when it appears,
 * and it's a polite live region so screen readers hear it without being interrupted.
 */
export function TypingIndicator({ names }: { names: string[] }) {
  const text = typingLabel(names);
  return (
    <div className={styles.typingSlot} aria-live="polite" aria-atomic="true">
      {text && (
        <p className={styles.typing}>
          <span className={styles.dots} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          {text}
        </p>
      )}
    </div>
  );
}
