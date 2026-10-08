"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { cx } from "@/lib/utils";
import styles from "./Channels.module.css";

/**
 * The text of a message, exactly as written (the CSS keeps line breaks, blank lines, indentation, bullets and numbering).
 * A long message is shown as a preview with a fade and a "Show more" button; nothing is ever cut off for good, and the
 * button only appears when there actually is more to show.
 */
export function MessageBody({ text, forceExpanded }: { text: string; forceExpanded?: boolean }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const open = expanded || !!forceExpanded;

  // Re-measure when the text or the available width changes (ResizeObserver also reports the first measurement).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const observer = new ResizeObserver(() => setOverflowing(el.scrollHeight > el.clientHeight + 2));
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, open]);

  return (
    <div className={styles.bodyWrap}>
      <div id={id} ref={ref} data-testid="message-body" className={cx(styles.body, !open && styles.bodyClamped, !open && overflowing && styles.bodyFade)}>
        {text}
      </div>
      {!forceExpanded && (overflowing || expanded) && (
        <button type="button" className={styles.showMore} aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
