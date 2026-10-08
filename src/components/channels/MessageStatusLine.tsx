"use client";

import { useRef, useState } from "react";
import { Check, CheckCheck } from "lucide-react";
import { useDismiss } from "@/hooks/useClickOutside";
import { formatFull, formatStamp, statusView } from "@/lib/chat";
import { cx } from "@/lib/utils";
import type { MessageStatus } from "@/types/models";
import styles from "./Channels.module.css";

/**
 * Sent · Delivered · Seen — with the date and time it happened. Click for the per-person breakdown
 * (when each recipient received it and when they saw it).
 */
export function MessageStatusLine({ status, tz }: { status: MessageStatus; tz: string }) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));

  const v = statusView(status, tz);
  const Icon = v.state === "sent" ? Check : CheckCheck;

  return (
    <div className={styles.statusWrap} ref={ref}>
      <button
        type="button"
        className={cx(styles.status, styles[`status_${v.state}`])}
        aria-expanded={open}
        aria-label={`Message status: ${v.full}. Show details`}
        title={v.full}
        onClick={() => {
          if (!open) {
            // Open towards whichever side has room inside the scrolling thread (the popover would be clipped otherwise).
            const log = ref.current?.closest('[role="log"]')?.getBoundingClientRect();
            const me = ref.current?.getBoundingClientRect();
            if (log && me) setUp(log.bottom - me.bottom < 250 && me.top - log.top > log.bottom - me.bottom);
          }
          setOpen((o) => !o);
        }}
      >
        <Icon size={13} aria-hidden="true" />
        <span>{v.label}</span>
        <time dateTime={v.at} suppressHydrationWarning>
          {formatStamp(v.at, tz)}
        </time>
      </button>

      {open && (
        <div className={cx(styles.statusPop, up && styles.statusPopUp)} role="dialog" aria-label="Message info">
          <p className={styles.statusPopTitle}>Message info</p>
          <dl className={styles.statusRows}>
            <div>
              <dt>Sent</dt>
              <dd suppressHydrationWarning>{formatFull(status.sentAt, tz)}</dd>
            </div>
          </dl>
          {status.recipients.length > 0 ? (
            <ul className={styles.statusPeople}>
              {status.recipients.map((r) => (
                <li key={r.memberId}>
                  <span className={styles.statusPerson}>{r.name}</span>
                  <span suppressHydrationWarning>
                    {r.seenAt ? (
                      <>
                        <em>Seen</em> {formatStamp(r.seenAt, tz)}
                      </>
                    ) : r.deliveredAt ? (
                      <>
                        <em>Delivered</em> {formatStamp(r.deliveredAt, tz)}
                      </>
                    ) : (
                      <span className={styles.statusPending}>Not delivered yet</span>
                    )}
                  </span>
                  {r.seenAt && r.deliveredAt && r.deliveredAt !== r.seenAt && (
                    <span className={styles.statusSub} suppressHydrationWarning>
                      Delivered {formatStamp(r.deliveredAt, tz)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.statusEmpty}>No registered recipients yet — nobody to deliver this to.</p>
          )}
        </div>
      )}
    </div>
  );
}
