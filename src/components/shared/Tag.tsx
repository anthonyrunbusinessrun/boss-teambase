import { cx } from "@/lib/utils";
import styles from "./shared.module.css";

export type TagTone =
  | "high"
  | "medium"
  | "low"
  | "active"
  | "offline"
  | "standard"
  | "custom"
  | "free"
  | "in-meeting"
  | "zone-day"
  | "zone-night";

/** Small label pill. Always carries text so meaning never relies on color alone. */
export function Tag({ tone, children, className }: { tone: TagTone; children: React.ReactNode; className?: string }) {
  return <span className={cx(styles.tag, styles[`tag_${tone}`], className)}>{children}</span>;
}
