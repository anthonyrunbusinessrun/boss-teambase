"use client";

import { useRef, useState } from "react";
import { LogOut, Settings, UserRound } from "lucide-react";
import { Avatar } from "@/components/shared/Avatar";
import { useApp } from "@/providers/AppProvider";
import { useDismiss } from "@/hooks/useClickOutside";
import { authService } from "@/services";
import { cx } from "@/lib/utils";
import styles from "./Header.module.css";

/** Header user block (avatar + name + role). Opens a menu to the profile and settings. */
export function UserMenu() {
  const { me, email, openProfile, openSettings } = useApp();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));

  const signOut = async () => {
    setSigningOut(true);
    try {
      await authService.logout();
    } finally {
      // Deliberately a full page load (not a client-side transition): it drops the router cache and all
      // in-memory data of the signed-out user, so nothing from this session can be shown to the next one.
      window.location.assign(new URL("/signin?reason=signed-out", window.location.origin).toString());
    }
  };

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
            <div className={styles.menuHeadEmail}>{email}</div>
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
          <button type="button" role="menuitem" className={styles.menuItem} onClick={signOut} disabled={signingOut}>
            <LogOut size={16} /> {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
