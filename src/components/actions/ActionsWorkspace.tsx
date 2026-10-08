"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { FolderClosed, FolderOpen, KanbanSquare, ListTodo, Radio, WifiOff } from "lucide-react";
import { COMPANIES, getCompany, type CompanyDef } from "@/config/companies";
import { useRealtime } from "@/providers/RealtimeProvider";
import { ErrorState, LoadingState } from "@/components/shared/States";
import { daysLeftText } from "@/lib/board";
import { dateKey } from "@/lib/time";
import { useApp } from "@/providers/AppProvider";
import { cx } from "@/lib/utils";
import type { CompanyId, CompanySummary } from "@/types/models";
import { ActionsProvider, useActions } from "./ActionsData";
import styles from "./Actions.module.css";

type View = "board" | "sprints";

/**
 * The Actions area. Three company folders sit across the top; each owns its own Board and its own Sprints.
 * Everything below (Board or Sprints) shows the selected company only, and updates live.
 */
export function ActionsWorkspace({ company, children }: { company: CompanyId; children: React.ReactNode }) {
  // Remember the last company you worked in, so "Actions" in the sidebar takes you back to it.
  useEffect(() => {
    document.cookie = `tb_company=${company}; path=/; max-age=31536000; samesite=lax`;
  }, [company]);

  return (
    <ActionsProvider key={company} company={company}>
      <Shell company={company}>{children}</Shell>
    </ActionsProvider>
  );
}

function Shell({ company, children }: { company: CompanyId; children: React.ReactNode }) {
  const { loading, error, tasks, announcement, reload } = useActions();
  const pathname = usePathname();
  const view: View = pathname.endsWith("/sprints") ? "sprints" : "board";

  return (
    <div className={styles.workspace}>
      <CompanyFolders selected={company} view={view} />

      <div className={styles.viewBar}>
        <nav aria-label={`${getCompany(company).code} views`} className={styles.viewTabs}>
          <Link href={`/actions/${company}/board`} aria-current={view === "board" ? "page" : undefined} className={cx(styles.viewTab, view === "board" && styles.viewTabOn)}>
            <KanbanSquare size={16} aria-hidden="true" /> Board
          </Link>
          <Link href={`/actions/${company}/sprints`} aria-current={view === "sprints" ? "page" : undefined} className={cx(styles.viewTab, view === "sprints" && styles.viewTabOn)}>
            <ListTodo size={16} aria-hidden="true" /> Sprints
          </Link>
        </nav>
        <div className={styles.announce} aria-live="polite" aria-atomic="true">
          {announcement && (
            <span key={announcement.id} className={styles.announceText} data-testid="announcement">
              {announcement.text}
            </span>
          )}
        </div>
        <LiveBadge />
      </div>

      {loading && tasks.length === 0 ? <LoadingState label="Loading board…" /> : error && tasks.length === 0 ? <ErrorState message={error} onRetry={reload} /> : children}
    </div>
  );
}

/** "Live" while the connection is up. Changes by other people appear on their own — no refreshing. */
function LiveBadge() {
  const rt = useRealtime();
  if (!rt.ready) return null;
  return rt.connected ? (
    <span className={cx(styles.live, styles.liveOn)} title="Changes from other people appear here automatically" data-testid="live-badge">
      <Radio size={13} aria-hidden="true" /> Live
    </span>
  ) : (
    <span className={cx(styles.live, styles.liveOff)} role="status" data-testid="live-badge">
      <WifiOff size={13} aria-hidden="true" /> Reconnecting…
    </span>
  );
}

function CompanyFolders({ selected, view }: { selected: CompanyId; view: View }) {
  const { summaries } = useActions();
  const byId = new Map(summaries.map((s) => [s.id, s]));
  return (
    <nav aria-label="Companies" className={styles.folders}>
      <ul>
        {COMPANIES.map((c) => (
          <li key={c.id}>
            <FolderCard company={c} summary={byId.get(c.id)} active={c.id === selected} view={view} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function FolderCard({ company, summary, active, view }: { company: CompanyDef; summary?: CompanySummary; active: boolean; view: View }) {
  const { primaryZone } = useApp();
  const Icon = active ? FolderOpen : FolderClosed;
  const sprint = summary?.activeSprint;
  return (
    <Link
      href={`/actions/${company.id}/${view}`}
      aria-current={active ? "page" : undefined}
      aria-label={`${company.code} — ${company.name}`}
      className={cx(styles.folder, styles[`folder_${company.tone}`], active && styles.folderOn)}
    >
      <span className={styles.folderIcon} aria-hidden="true">
        <Icon size={22} />
      </span>
      <span className={styles.folderText}>
        <span className={styles.folderCode}>{company.code}</span>
        <span className={styles.folderName}>{company.name}</span>
        <span className={styles.folderMeta}>
          {!summary ? (
            "\u00a0"
          ) : sprint ? (
            <>
              <strong>{sprint.name}</strong> · {summary.open} open · {summary.done} done · {daysLeftText(sprint, dateKey(new Date(), primaryZone.tz))}
            </>
          ) : (
            <>No active sprint{summary.unscheduled ? ` · ${summary.unscheduled} unscheduled` : ""}</>
          )}
        </span>
      </span>
    </Link>
  );
}
