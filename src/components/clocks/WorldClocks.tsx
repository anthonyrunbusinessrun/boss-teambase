"use client";

import { SearchX } from "lucide-react";
import { Card } from "@/components/cards/Card";
import { usePageSearch } from "@/components/layout/AppShell";
import { Tag } from "@/components/shared/Tag";
import { EmptyState } from "@/components/shared/States";
import { Button } from "@/components/buttons/Button";
import { AnalogClock } from "./AnalogClock";
import { useApp } from "@/providers/AppProvider";
import { useNow } from "@/hooks/useNow";
import { formatClock, formatUtcOffset } from "@/lib/time";
import { ZONES, isWorkingHours, zoneAbbr } from "@/lib/zones";
import styles from "./WorldClocks.module.css";

export function WorldClocks() {
  const { primaryZone } = useApp();
  const { query, setQuery } = usePageSearch();
  const now = useNow();
  const q = query.trim().toLowerCase();

  const zones = ZONES.filter((z) => z.clock).filter((z) => {
    if (!q) return true;
    const abbr = zoneAbbr(z, now ?? new Date()).toLowerCase();
    return [z.city, z.country, abbr, z.tz].some((f) => f.toLowerCase().includes(q));
  });

  return (
    <div className={styles.page}>
      <Card variant="bento" as="section" className={styles.banner}>
        <h2 className={styles.bannerTitle}>Global Remote Alignment</h2>
        <p className={styles.bannerText}>
          Tracking overlapping hours across Teambase&apos;s core development clusters. Current baseline synced to {primaryZone.city} office hours.
        </p>
      </Card>

      {zones.length === 0 ? (
        <Card variant="neutral">
          <EmptyState
            icon={<SearchX size={22} />}
            title="No time zones match your search"
            description={`Nothing matches “${query.trim()}”. Try a city, country or abbreviation like CST.`}
            action={
              <Button variant="outline" onClick={() => setQuery("")}>
                Clear search
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className={styles.grid} aria-label="World clocks">
          {zones.map((z) => {
            const ref = now ?? new Date(0);
            const home = z.tz === primaryZone.tz && z.id === (ZONES.find((x) => x.clock && x.tz === primaryZone.tz)?.id ?? z.id);
            const working = now ? isWorkingHours(now, z.tz) : false;
            const state = home ? "home" : working ? "day" : "night";
            return (
              <li key={z.id}>
                <Card variant="bento" as="article" flush className={styles.clockCard}>
                  <div>
                    <h3 className={styles.city}>{z.city}</h3>
                    <p className={styles.country}>{z.country}</p>
                    <p className={styles.time} suppressHydrationWarning>
                      {now ? formatClock(now, z.tz) : "--:-- --"}
                    </p>
                    <div className={styles.meta}>
                      <Tag tone={working ? "zone-day" : "zone-night"}>{zoneAbbr(z, ref)}</Tag>
                      <span suppressHydrationWarning>{formatUtcOffset(ref, z.tz)}</span>
                    </div>
                    <p className="sr-only">{home ? "Home base" : working ? "In working hours" : "Outside working hours"}</p>
                  </div>
                  {now ? <span title={home ? "Home base" : working ? "In working hours" : "Outside working hours"}><AnalogClock now={now} tz={z.tz} state={state} /></span> : <span style={{ width: 64, height: 64 }} />}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
