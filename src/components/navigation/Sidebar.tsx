"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, navForPath } from "@/config/navigation";
import { useApp } from "@/providers/AppProvider";
import { useResource } from "@/hooks/useResource";
import { systemService } from "@/services";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { cx } from "@/lib/utils";
import styles from "./Sidebar.module.css";

export function Sidebar() {
  const pathname = usePathname();
  const current = navForPath(pathname);
  const { unread } = useApp();

  return (
    <aside className={styles.sidebar}>
      <Link href="/" className={styles.brand} aria-label="Teambase home">
        <Image src="/brand/teambase-wordmark.png" alt="teambase" width={166} height={18} priority unoptimized />
        <span className={styles.brandMark} aria-hidden="true">
          t<i>.</i>
        </span>
      </Link>

      <nav aria-label="Primary" className={styles.nav}>
        {NAV_ITEMS.map((item) => {
          const active = item.href === current.href;
          const badge = item.showBadge && unread > 0 ? unread : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cx(styles.item, active && styles.active)}
              aria-current={active ? "page" : undefined}
              title={item.label}
            >
              {/* Decorative: the label already names the link, so screen readers skip the emoji. */}
              <span className={styles.emoji} aria-hidden="true">
                {item.emoji}
              </span>
              <span className={styles.label}>{item.label}</span>
              {badge > 0 && (
                <span className={styles.badge} aria-label={`${badge} unread`}>
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <SidebarMeter kind={current.meter} />
    </aside>
  );
}

function SidebarMeter({ kind }: { kind: "api" | "latency" }) {
  const { data } = useResource(systemService.meters);
  if (!data) return <div className={styles.meter} aria-hidden="true" style={{ minHeight: 52 }} />;

  if (kind === "latency") {
    return (
      <div className={styles.meter}>
        <div className={styles.meterRow}>
          <span className={styles.meterLabel}>Service Latency</span>
          <span className={styles.meterValue}>{data.latency.label}</span>
        </div>
        <ProgressBar className={styles.meterBar} value={data.latency.percent} label="Service latency" />
      </div>
    );
  }

  const pct = data.apiVolume.percent;
  const hot = pct >= 80; // blue → red when nearing the limit
  return (
    <div className={styles.meter}>
      <div className={styles.meterRow}>
        <span className={styles.meterLabel}>API Volume</span>
        <span className={cx(styles.meterValue, hot && styles.meterRed)}>{pct}% Capacity</span>
      </div>
      <ProgressBar className={styles.meterBar} value={pct} tone={hot ? "red" : "blue"} label="API volume" />
    </div>
  );
}
