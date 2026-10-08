"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Award, CalendarDays, CheckCircle2, Loader, ListChecks, PlusCircle, ShieldAlert, UploadCloud, Video } from "lucide-react";
import { Button, ButtonLink } from "@/components/buttons/Button";
import { Card, CardTitle } from "@/components/cards/Card";
import { TaskFormModal } from "@/components/actions/TaskFormModal";
import { EventFormModal } from "@/components/calendar/EventFormModal";
import { UploadReportModal } from "@/components/reports/UploadReportModal";
import { Avatar } from "@/components/shared/Avatar";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/States";
import { useApp } from "@/providers/AppProvider";
import { useNow } from "@/hooks/useNow";
import { useResource } from "@/hooks/useResource";
import { dashboardService, eventService, taskService } from "@/services";
import { addDaysKey, dateKey, formatClock, formatDuration, formatKeyShort, formatTimeShort, formatUtcOffset, greetingFor, isoWeek, timeAgo, zonedParts } from "@/lib/time";
import { zoneAbbr } from "@/lib/zones";
import type { ActivityItem, CalendarEvent, WeeklyMetric } from "@/types/models";
import styles from "./Dashboard.module.css";

const METRIC_ICONS = { todo: ListChecks, "in-progress": Loader, done: CheckCircle2, completed: Award } as const;

export function Dashboard() {
  const { me, primaryZone, secondaryZone } = useApp();
  const now = useNow();
  const tasks = useResource(taskService.list);
  const events = useResource(eventService.list);
  const metrics = useResource(dashboardService.metrics);
  const activity = useResource(dashboardService.activity);

  const [taskOpen, setTaskOpen] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const tz = primaryZone.tz;
  const todayKey = now ? dateKey(now, tz) : null;
  const week = todayKey ? isoWeek(todayKey) : null;

  const refreshAfterTask = useCallback(() => {
    void tasks.reload();
    void metrics.reload();
    void activity.reload();
  }, [tasks, metrics, activity]);

  const critical = (tasks.data ?? []).filter((t) => t.priority === "high" && t.status !== "done").length;
  const upcoming = (events.data ?? []).filter((e) => e.kind === "meeting" && now && new Date(e.start) > now);
  const nextMeeting = upcoming[0];

  const agenda = todayKey ? (events.data ?? []).filter((e) => dateKey(new Date(e.start), tz) === todayKey) : [];

  return (
    <div className={styles.page}>
      {/* Welcome banner */}
      <Card variant="bento" as="section" className={styles.welcome} aria-label="Welcome">
        <div>
          <h2 className={styles.greeting} suppressHydrationWarning>
            {now ? greetingFor(zonedParts(now, tz).hour) : "Welcome"}, {me.name}
          </h2>
          <p className={styles.subtitle}>{summaryLine({ critical, week, nextMeeting, now, tz, loaded: !!tasks.data && !!events.data })}</p>
        </div>
        <div className={styles.zones}>
          {[primaryZone, secondaryZone].map((z) => (
            <div className={styles.zone} key={z.id}>
              <div className={styles.zoneCity}>
                {z.city}, {z.id === "manila" ? "PH" : zoneAbbr(z, now ?? new Date())}
              </div>
              <div className={styles.zoneTime} suppressHydrationWarning>
                {now ? formatClock(now, z.tz) : "--:-- --"}
              </div>
              <div className={styles.zoneOffset} suppressHydrationWarning>
                {now ? formatUtcOffset(now, z.tz) : "UTC"}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* KPIs */}
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} suppressHydrationWarning>
          {week ? `Week ${week} Performance` : "Weekly Performance"}
        </h2>
        <Link href="/actions" className={styles.viewAll}>
          View All Metrics <ArrowRight size={14} />
        </Link>
      </div>
      {metrics.error && !metrics.data ? (
        <ErrorState message={metrics.error} onRetry={metrics.reload} />
      ) : (
        <div className={styles.metrics}>
          {(metrics.data ?? PLACEHOLDER_METRICS).map((m) => (
            <MetricCard key={m.key} metric={m} loading={!metrics.data} />
          ))}
        </div>
      )}

      <div className={styles.lower}>
        {/* Activity feed */}
        <Card variant="bento" as="section" flush className={styles.feedCard} aria-labelledby="feed-title">
          <CardTitle id="feed-title" className={styles.cardTitle}>
            Recent Activity Feed
          </CardTitle>
          {activity.loading ? (
            <LoadingState label="Loading activity…" />
          ) : activity.error ? (
            <ErrorState message={activity.error} onRetry={activity.reload} />
          ) : activity.data && activity.data.length > 0 ? (
            <ul className={styles.feed}>
              {activity.data.map((a) => (
                <FeedRow key={a.id} item={a} />
              ))}
            </ul>
          ) : (
            <EmptyState title="No activity yet" description="Create a task, schedule a meeting or draft a report and it will show up here." />
          )}
        </Card>

        <div className={styles.stack}>
          <Card variant="bento" as="section" flush className={styles.sideCard} aria-labelledby="qa-title">
            <CardTitle id="qa-title" className={styles.cardTitle}>
              Quick Actions
            </CardTitle>
            <div className={styles.quick}>
              <Button variant="blue" icon={<PlusCircle size={16} />} onClick={() => setTaskOpen(true)}>
                Create Task
              </Button>
              <ButtonLink href="/calendar" variant="outline" icon={<CalendarDays size={16} />}>
                Open Calendar
              </ButtonLink>
              <Button variant="outline" icon={<Video size={16} />} onClick={() => setMeetingOpen(true)}>
                Start Meeting
              </Button>
              <Button variant="outline" icon={<UploadCloud size={16} />} onClick={() => setUploadOpen(true)}>
                Upload Report
              </Button>
            </div>
          </Card>

          <Card variant="bento" as="section" flush className={styles.sideCard} aria-labelledby="agenda-title">
            <CardTitle id="agenda-title" className={styles.cardTitle}>
              Today&apos;s Agenda
            </CardTitle>
            {events.loading ? (
              <LoadingState label="Loading agenda…" />
            ) : events.error ? (
              <ErrorState message={events.error} onRetry={events.reload} />
            ) : agenda.length === 0 ? (
              <EmptyState
                title="Nothing on your agenda today"
                description="Meetings and events scheduled for today will appear here."
                action={
                  <ButtonLink href="/calendar" variant="outline">
                    Open Calendar
                  </ButtonLink>
                }
              />
            ) : (
              <div className={styles.agenda}>
                {agenda.map((e) => (
                  <AgendaRow key={e.id} event={e} tz={tz} />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <TaskFormModal open={taskOpen} onClose={() => setTaskOpen(false)} onSaved={refreshAfterTask} />
      <EventFormModal
        open={meetingOpen}
        onClose={() => setMeetingOpen(false)}
        kind="meeting"
        heading="Start a meeting"
        submitLabel="Start meeting"
        initial={instantMeetingDefaults(tz)}
        onSaved={() => {
          void events.reload();
          void activity.reload();
        }}
      />
      <UploadReportModal open={uploadOpen} onClose={() => setUploadOpen(false)} onSaved={() => void activity.reload()} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

const PLACEHOLDER_METRICS: WeeklyMetric[] = [
  { key: "todo", label: "Todo Tasks", value: 0, delta: 0 },
  { key: "in-progress", label: "In Progress", value: 0, delta: 0 },
  { key: "done", label: "Done", value: 0, delta: 0 },
  { key: "completed", label: "Completed this Week", value: 0, delta: 0, percent: true },
];

function MetricCard({ metric, loading }: { metric: WeeklyMetric; loading: boolean }) {
  const Icon = METRIC_ICONS[metric.key];
  const up = metric.delta >= 0;
  return (
    <Card variant="bento" as="article" flush className={styles.metric} aria-busy={loading || undefined}>
      <div className={styles.metricTop}>
        <span className={styles.metricLabel}>{metric.label}</span>
        <span className={styles.iconTile}>
          <Icon size={16} aria-hidden="true" />
        </span>
      </div>
      <div className={styles.metricValue}>{loading ? "–" : `${metric.value}${metric.percent ? "%" : ""}`}</div>
      <div className={styles.delta}>
        {!loading && (
          <>
            <span className={up ? styles.up : styles.down}>
              {up ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />}
            </span>
            <span className={up ? styles.up : styles.down}>{Math.abs(metric.delta)}%</span>
            <span className={styles.deltaText}>
              <span className="sr-only">{up ? "increase" : "decrease"} </span>vs last week
            </span>
          </>
        )}
      </div>
    </Card>
  );
}

function FeedRow({ item }: { item: ActivityItem }) {
  const obj = item.object ? (
    item.objectHref ? (
      <Link href={item.objectHref} className={item.objectTone === "strong" ? styles.objStrong : styles.objLink}>
        {item.object}
      </Link>
    ) : (
      <span className={item.objectTone === "strong" ? styles.objStrong : styles.objLink}>{item.object}</span>
    )
  ) : null;

  return (
    <li>
      {item.system ? (
        <span className={styles.systemIcon}>
          <ShieldAlert size={15} aria-hidden="true" />
        </span>
      ) : (
        <Avatar initials={item.actor?.initials ?? "?"} size={28} />
      )}
      <div>
        <p className={styles.feedText}>
          {item.actor && <span className={styles.actor}>{item.actor.name} </span>}
          {item.text} {obj} {item.suffix}
        </p>
        <p className={styles.feedTime} suppressHydrationWarning>
          {timeAgo(item.at)}
        </p>
      </div>
    </li>
  );
}

function AgendaRow({ event, tz }: { event: CalendarEvent; tz: string }) {
  return (
    <Link href={`/calendar?event=${event.id}`} className={styles.agendaItem}>
      <span className={styles.agendaTime}>
        <span className={styles.agendaClock} style={{ display: "block" }}>
          {formatClockTwoDigit(new Date(event.start), tz)}
        </span>
        <span className={styles.agendaDuration}>{formatDuration(event.start, event.end)}</span>
      </span>
      <span>
        <span className={styles.agendaTitle} style={{ display: "block" }}>
          {event.title}
        </span>
        {event.location && <span className={styles.agendaPlace}>{event.location}</span>}
      </span>
    </Link>
  );
}

const formatClockTwoDigit = (d: Date, tz: string) => formatClock(d, tz);

function summaryLine({
  critical,
  week,
  nextMeeting,
  now,
  tz,
  loaded,
}: {
  critical: number;
  week: number | null;
  nextMeeting?: CalendarEvent;
  now: Date | null;
  tz: string;
  loaded: boolean;
}) {
  if (!loaded || !now || !week) return "Loading your week…";
  const actions = `You have ${critical} critical action${critical === 1 ? "" : "s"} pending for Week ${week}.`;
  if (!nextMeeting) return `${actions} You have no upcoming meetings.`;
  const start = new Date(nextMeeting.start);
  const mins = Math.max(1, Math.round((start.getTime() - now.getTime()) / 60000));
  if (mins < 60) return `${actions} Your next meeting starts in ${mins} minute${mins === 1 ? "" : "s"}.`;
  const todayKey = dateKey(now, tz);
  const startKey = dateKey(start, tz);
  if (startKey === todayKey) {
    const h = Math.round(mins / 60);
    return `${actions} Your next meeting starts in ${h} hour${h === 1 ? "" : "s"}.`;
  }
  const when = startKey === addDaysKey(todayKey, 1) ? "tomorrow" : `on ${formatKeyShort(startKey)}`;
  return `${actions} Your next meeting is ${nextMeeting.title} ${when} at ${formatTimeShort(start, tz)}.`;
}

/** "Start Meeting": a meeting beginning at the next 5-minute mark and lasting 30 minutes. */
function instantMeetingDefaults(tz: string) {
  const now = new Date();
  const start = new Date(Math.ceil(now.getTime() / 300000) * 300000);
  const end = new Date(start.getTime() + 30 * 60000);
  const p = (d: Date) => {
    const z = zonedParts(d, tz);
    return `${String(z.hour).padStart(2, "0")}:${String(z.minute).padStart(2, "0")}`;
  };
  return { date: dateKey(start, tz), start: p(start), end: p(end) };
}
