import { cx } from "@/lib/utils";
import styles from "./shared.module.css";

interface ProgressBarProps {
  value: number;
  tone?: "blue" | "red";
  label: string;
  className?: string;
}

export function ProgressBar({ value, tone = "blue", label, className }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div
      className={cx(styles.progress, className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div className={cx(styles.progressFill, tone === "red" && styles.progressRed)} style={{ width: `${pct}%` }} />
    </div>
  );
}
