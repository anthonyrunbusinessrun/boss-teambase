"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CalendarClock, CheckSquare, MessageSquare, ShieldAlert } from "lucide-react";
import { IconButton, Button } from "@/components/buttons/Button";
import { useApp } from "@/providers/AppProvider";
import { useDismiss } from "@/hooks/useClickOutside";
import { notificationService } from "@/services";
import { timeAgo } from "@/lib/time";
import { cx } from "@/lib/utils";
import type { AppNotification, NotificationType } from "@/types/models";
import styles from "./Header.module.css";

const ICONS: Record<NotificationType, typeof Bell> = {
  messages: MessageSquare,
  tasks: CheckSquare,
  meetings: CalendarClock,
  budget: ShieldAlert,
};

export function NotificationBell() {
  const router = useRouter();
  const { settings } = useApp();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useDismiss(rootRef, open, () => setOpen(false));

  const load = useCallback(() => {
    notificationService
      .list()
      .then(setItems)
      .catch(() => {
        /* keep the last known list; the bell is non-critical */
      });
  }, []);

  // Reload on open, when notification preferences change, and every 30s.
  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load, settings.notifications]);

  const unread = items.filter((n) => !n.read);

  const toggle = () => {
    if (!open) load();
    setOpen((o) => !o);
  };

  const openItem = async (n: AppNotification) => {
    setOpen(false);
    if (!n.read) {
      setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      notificationService.markRead([n.id]).catch(() => undefined);
    }
    router.push(n.href);
  };

  const markAll = () => {
    setItems((cur) => cur.map((x) => ({ ...x, read: true })));
    notificationService.markRead().catch(() => undefined);
  };

  return (
    <div className={styles.anchor} ref={rootRef}>
      <IconButton
        round
        label={unread.length ? `Notifications (${unread.length} unread)` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={toggle}
        className={styles.bell}
      >
        <Bell size={18} />
        {unread.length > 0 && <span className={styles.bellDot} aria-hidden="true" />}
      </IconButton>

      {open && (
        <div className={cx(styles.popover, styles.notifs)} role="dialog" aria-label="Notifications">
          <div className={styles.notifsHead}>
            <h2 className={styles.notifsTitle}>Notifications</h2>
            <Button variant="ghost" size="sm" onClick={markAll} disabled={unread.length === 0}>
              Mark all read
            </Button>
          </div>
          {items.length === 0 ? (
            <p className={styles.notifsEmpty}>You&apos;re all caught up.</p>
          ) : (
            <ul className={styles.notifsList}>
              {items.map((n) => {
                const Icon = ICONS[n.type];
                return (
                  <li key={n.id}>
                    <button type="button" className={cx(styles.notif, !n.read && styles.notifUnread)} onClick={() => openItem(n)}>
                      <span className={styles.notifIcon}>
                        <Icon size={15} />
                      </span>
                      <span className={styles.notifBody}>
                        <span className={styles.notifText}>{n.text}</span>
                        <span className={styles.notifTime} suppressHydrationWarning>
                          {timeAgo(n.at)}
                        </span>
                      </span>
                      {!n.read && <span className={styles.unreadDot} aria-label="Unread" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
