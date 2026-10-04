"use client";

import { useRef, useState } from "react";
import { Settings, UserRound } from "lucide-react";
import { Avatar } from "@/components/shared/Avatar";
import { useApp } from "@/providers/AppProvider";
import { useDismiss } from "@/hooks/useClickOutside";
import { cx } from "@/lib/utils";
import styles from "./Header.module.css";

/** Header user block (avatar + name + role). Opens a menu to the profile and settings. */
export function UserMenu() {
  const { me, openProfile, openSettings } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));

  return (
    <div className={styles.anchor} ref={ref}>
      <button type="button" className={styles.user} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Avatar initials={me.initials} size={40} />
        <span className={styles.userText}>
          <span className={styles.userName}>{me.name}</span>
          <span className={styles.userRole}>{me.role}</span>
        </span>
      </button>
      {open && (
        <div className={cx(styles.popover, styles.menu)} role="menu">
          <div className={styles.menuHead}>
            <div className={styles.menuHeadName}>{me.name}</div>
            <div className={styles.menuHeadRole}>
              {me.role} · {me.department}
            </div>
          </div>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => {
              setOpen(false);
              openProfile();
            }}
          >
            <UserRound size={16} /> My profile
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => {
              setOpen(false);
              openSettings();
            }}
          >
            <Settings size={16} /> Settings
          </button>
        </div>
      )}
    </div>
  );
}
