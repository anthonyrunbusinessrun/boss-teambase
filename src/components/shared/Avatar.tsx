import { cx } from "@/lib/utils";
import styles from "./shared.module.css";

interface AvatarProps {
  initials: string;
  /** px — 20 inline · 28 feed · 36 header/lists · 44–56 cards/org nodes */
  size?: number;
  className?: string;
}

/** Initials-only red avatar (design system §6.4). 3-letter codes scale down. */
export function Avatar({ initials, size = 36, className }: AvatarProps) {
  const ratio = initials.length >= 3 ? 0.3 : 0.37;
  return (
    <span
      className={cx(styles.avatar, className)}
      style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * ratio)) }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

export function PresenceDot({ online, label }: { online: boolean; label?: string }) {
  return (
    <span
      className={cx(styles.presence, online ? styles.online : styles.offline)}
      role="img"
      aria-label={label ?? (online ? "Online" : "Offline")}
    />
  );
}
