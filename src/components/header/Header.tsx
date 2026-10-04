"use client";

import { GlobalSearch } from "./GlobalSearch";
import { NotificationBell } from "./NotificationBell";
import { TimeDisplay } from "./TimeDisplay";
import { UserMenu } from "./UserMenu";
import styles from "./Header.module.css";

interface HeaderProps {
  title: string;
  searchPlaceholder: string;
  primaryClockLabel?: string;
  localSearch?: { value: string; onChange: (value: string) => void };
}

/** 64px header: page title · search · dual clocks · bell · user. */
export function Header({ title, searchPlaceholder, primaryClockLabel, localSearch }: HeaderProps) {
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>{title}</h1>
      <GlobalSearch placeholder={searchPlaceholder} local={localSearch} />
      <div className={styles.cluster}>
        <TimeDisplay primaryLabel={primaryClockLabel} />
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}
