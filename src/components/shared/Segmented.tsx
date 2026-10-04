"use client";

import { cx } from "@/lib/utils";
import styles from "./shared.module.css";

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; disabled?: boolean; title?: string }[];
  ariaLabel: string;
  /** red = primary view switch (Month/Week/Day) · blue = lighter filter switch (templates) */
  tone?: "red" | "blue";
}

export function Segmented<T extends string>({ value, onChange, options, ariaLabel, tone = "red" }: SegmentedProps<T>) {
  return (
    <div className={styles.segmented} role="tablist" aria-label={ariaLabel}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={o.disabled}
            title={o.title}
            className={cx(styles.segment, active && (tone === "red" ? styles.segmentRed : styles.segmentBlue))}
            onClick={() => !o.disabled && onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
