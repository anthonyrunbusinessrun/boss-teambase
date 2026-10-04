"use client";

import { useApp } from "@/providers/AppProvider";
import { useNow } from "@/hooks/useNow";
import { formatClock } from "@/lib/time";
import { zoneHeaderLabel } from "@/lib/zones";
import styles from "./Header.module.css";

/** Dual time zones pinned in the header (design: PH TIME / CST TIME). Updates every second. */
export function TimeDisplay({ primaryLabel }: { primaryLabel?: string }) {
  const { primaryZone, secondaryZone } = useApp();
  const now = useNow();

  const block = (label: string, tz: string) => (
    <div className={styles.clock}>
      <span className="micro-label">{label}</span>
      <span className={styles.clockTime} suppressHydrationWarning>
        {now ? formatClock(now, tz) : "--:-- --"}
      </span>
    </div>
  );

  const ref = now ?? new Date(0);
  return (
    <div className={styles.clocks} role="group" aria-label="Team time zones">
      {block(primaryLabel ?? zoneHeaderLabel(primaryZone, ref), primaryZone.tz)}
      {block(zoneHeaderLabel(secondaryZone, ref), secondaryZone.tz)}
    </div>
  );
}
