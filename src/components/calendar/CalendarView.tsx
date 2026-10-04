"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { CalendarPlus, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { Avatar } from "@/components/shared/Avatar";
import { Segmented } from "@/components/shared/Segmented";
import { ErrorState, LoadingState } from "@/components/shared/States";
import { Tag } from "@/components/shared/Tag";
import { EventFormModal } from "./EventFormModal";
import { useApp } from "@/providers/AppProvider";
import { useToast } from "@/providers/ToastProvider";
import { useNow } from "@/hooks/useNow";
import { useResource } from "@/hooks/useResource";
import { errorMessage, eventService, memberService } from "@/services";
import { groupByDay, layoutDay, monthGrid, weekDays, type CalendarView as View } from "@/lib/calendar";
import {
  addDaysKey,
  addMonthsKey,
  dateKey,
  formatKeyLong,
  formatKeyMonthDay,
  formatKeyMonthYear,
  formatKeyRange,
  formatTimeShort,
  keyToUtc,
  zonedParts,
} from "@/lib/time";
import { cx } from "@/lib/utils";
import type { CalendarEvent, EventKind } from "@/types/models";
import styles from "./Calendar.module.css";

const HOUR_H = 48;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_CHIPS = 2;

type Draft = { kind: EventKind; date?: string; start?: string };

export function CalendarView() {
  const { primaryZone, me, members, refreshMembers } = useApp();
  const tz = primaryZone.tz;
  const toast = useToast();
  const now = useNow();
  const router = useRouter();
  const pathname = usePathname();
  const eventParam = useSearchParams().get("event");

  const events = useResource(eventService.list);
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [handledParam, setHandledParam] = useState<string | null>(null);

  const todayKey = now ? dateKey(now, tz) : null;
  const cursorKey = cursor ?? todayKey;
  const all = useMemo(() => events.data ?? [], [events.data]);
  const byDay = useMemo(() => groupByDay(all, tz), [all, tz]);

  // Deep link (?event=id): jump to the event's day and open it. Derived during render — no effect.
  if (eventParam && eventParam !== handledParam && events.data) {
    setHandledParam(eventParam);
    const target = events.data.find((e) => e.id === eventParam);
    if (target) {
      setCursor(dateKey(new Date(target.start), tz));
      setEditing(target);
    } else {
      toast.info("That event no longer exists");
    }
  }

  const closeEditor = () => {
    setEditing(null);
    if (eventParam) router.replace(pathname, { scroll: false });
    setHandledParam(null);
  };

  if (events.loading || !cursorKey || !todayKey) return <LoadingState label="Loading calendar…" />;
  if (events.error && !events.data) return <ErrorState message={events.error} onRetry={events.reload} />;

  const step = (dir: 1 | -1) => {
    setCursor(view === "month" ? addMonthsKey(cursorKey, dir) : addDaysKey(cursorKey, dir * (view === "week" ? 7 : 1)));
  };

  const title = view === "month" ? formatKeyMonthYear(cursorKey) : view === "week" ? weekRangeTitle(cursorKey) : formatKeyLong(cursorKey);
  const open = (e: CalendarEvent) => setEditing(e);
  const create = (kind: EventKind, date?: string, start?: string) => setDraft({ kind, date, start });
  const goDay = (key: string) => {
    setCursor(key);
    setView("day");
  };

  const upcoming = all.filter((e) => e.kind === "meeting" && now && new Date(e.start) > now).slice(0, 3);
  const people = members.filter((m) => m.status === "active").slice(0, 5);

  const toggleAvailability = async () => {
    const next = me.availability === "free" ? "in-meeting" : "free";
    try {
      await memberService.update(me.id, { availability: next });
      await refreshMembers();
      toast.success(`You're now ${next === "free" ? "Free" : "In Meeting"}`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <div className={styles.toolbar}>
          <div className={styles.toolLeft}>
            <Segmented<View>
              ariaLabel="Calendar view"
              value={view}
              onChange={setView}
              options={[
                { value: "month", label: "Month" },
                { value: "week", label: "Week" },
                { value: "day", label: "Day" },
              ]}
            />
            <Button variant="compact" onClick={() => setCursor(null)} disabled={cursorKey === todayKey}>
              Today
            </Button>
          </div>
          <div className={styles.nav}>
            <button type="button" className={styles.navBtn} onClick={() => step(-1)} aria-label={`Previous ${view}`}>
              <ChevronLeft size={18} />
            </button>
            <h2 className={styles.navTitle} aria-live="polite">
              {title}
            </h2>
            <button type="button" className={styles.navBtn} onClick={() => step(1)} aria-label={`Next ${view}`}>
              <ChevronRight size={18} />
            </button>
          </div>
          <div className={styles.toolRight}>
            <Button variant="outline" className={styles.schedule} icon={<Plus size={16} />} onClick={() => create("meeting", cursorKey)}>
              Schedule Meeting
            </Button>
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => create("event", cursorKey)}>
              Add Event
            </Button>
          </div>
        </div>

        {view === "month" ? (
          <MonthGrid cursorKey={cursorKey} todayKey={todayKey} byDay={byDay} tz={tz} onOpen={open} onDay={goDay} onAdd={(k) => create("event", k)} />
        ) : (
          <TimeGrid
            days={view === "week" ? weekDays(cursorKey) : [cursorKey]}
            todayKey={todayKey}
            byDay={byDay}
            tz={tz}
            now={now}
            onOpen={open}
            onSlot={(k, start) => create("event", k, start)}
            onDay={goDay}
            scrollKey={`${view}`}
          />
        )}
      </div>

      <aside className={styles.side} aria-label="Calendar sidebar">
        <Card variant="royal" as="section" aria-labelledby="upcoming-title">
          <h2 id="upcoming-title" className={styles.sideTitle}>
            Upcoming Meetings
          </h2>
          {upcoming.length === 0 ? (
            <div className={styles.sideEmpty}>
              No upcoming meetings.
              <br />
              <Button variant="outline" size="sm" icon={<CalendarPlus size={14} />} onClick={() => create("meeting", cursorKey)}>
                Schedule one
              </Button>
            </div>
          ) : (
            <div className={styles.meetings}>
              {upcoming.map((e) => (
                <button key={e.id} type="button" className={styles.meeting} onClick={() => open(e)}>
                  <div className={styles.meetingTitle}>{e.title}</div>
                  <div className={styles.meetingWhen}>{whenLabel(e, tz, todayKey)}</div>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card variant="royal" as="section" aria-labelledby="avail-title">
          <h2 id="avail-title" className={styles.sideTitle}>
            Team Availability
          </h2>
          <ul className={styles.people}>
            {people.map((m) => {
              const free = m.availability === "free";
              const tag = <Tag tone={free ? "free" : "in-meeting"}>{free ? "Free" : "In Meeting"}</Tag>;
              return (
                <li key={m.id} className={styles.person}>
                  <Avatar initials={m.initials} size={28} />
                  <span className={styles.personName}>{m.name}</span>
                  {m.id === me.id ? (
                    <button type="button" className={styles.statusBtn} onClick={toggleAvailability} title="Click to change your status" aria-label={`Your status: ${free ? "Free" : "In Meeting"}. Click to change.`}>
                      {tag}
                    </button>
                  ) : (
                    tag
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </aside>

      <EventFormModal
        open={!!draft}
        onClose={() => setDraft(null)}
        kind={draft?.kind}
        initial={draft ? { date: draft.date, start: draft.start, end: draft.start ? plusHour(draft.start) : undefined } : undefined}
        onSaved={() => void events.reload()}
      />
      <EventFormModal
        open={!!editing}
        event={editing ?? undefined}
        onClose={closeEditor}
        onSaved={() => void events.reload()}
        onDeleted={(id) => events.setData((cur) => cur?.filter((e) => e.id !== id))}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function MonthGrid({
  cursorKey,
  todayKey,
  byDay,
  tz,
  onOpen,
  onDay,
  onAdd,
}: {
  cursorKey: string;
  todayKey: string;
  byDay: Map<string, CalendarEvent[]>;
  tz: string;
  onOpen: (e: CalendarEvent) => void;
  onDay: (key: string) => void;
  onAdd: (key: string) => void;
}) {
  const weeks = monthGrid(cursorKey);
  return (
    <div className={styles.monthWrap} role="grid" aria-label={formatKeyMonthYear(cursorKey)}>
      <div className={styles.weekdays} role="row">
        {WEEKDAYS.map((d) => (
          <div key={d} className={styles.weekday} role="columnheader">
            {d}
          </div>
        ))}
      </div>
      <div className={styles.weeks}>
        {weeks.map((week) => (
          <div key={week[0]} className={styles.week} role="row">
            {week.map((key) => {
              const list = byDay.get(key) ?? [];
              const isToday = key === todayKey;
              const day = Number(key.slice(8));
              return (
                <div key={key} className={cx(styles.cell, isToday && styles.today)} role="gridcell" aria-label={formatKeyLong(key)}>
                  <button type="button" className={styles.dayNum} onClick={() => onDay(key)} aria-label={`Open ${formatKeyLong(key)}`}>
                    {day}
                  </button>
                  {isToday && <span className={styles.todayDot} aria-label="Today" role="img" />}
                  <button type="button" className={styles.addHint} onClick={() => onAdd(key)} aria-label={`Add event on ${formatKeyLong(key)}`}>
                    <Plus size={14} />
                  </button>
                  {list.slice(0, MAX_CHIPS).map((e) => (
                    <button key={e.id} type="button" className={cx(styles.chip, e.importance === "high" && styles.chipHigh)} onClick={() => onOpen(e)} title={`${e.title} · ${formatTimeShort(new Date(e.start), tz)}`}>
                      {e.title}
                    </button>
                  ))}
                  {list.length > MAX_CHIPS && (
                    <button type="button" className={styles.more} onClick={() => onDay(key)}>
                      +{list.length - MAX_CHIPS} more
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function TimeGrid({
  days,
  todayKey,
  byDay,
  tz,
  now,
  onOpen,
  onSlot,
  onDay,
  scrollKey,
}: {
  days: string[];
  todayKey: string;
  byDay: Map<string, CalendarEvent[]>;
  tz: string;
  now: Date | null;
  onOpen: (e: CalendarEvent) => void;
  onSlot: (key: string, start: string) => void;
  onDay: (key: string) => void;
  scrollKey: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Start the viewport at 7 AM whenever the view changes (DOM-only, no state).
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_H;
  }, [scrollKey]);

  const nowParts = now ? zonedParts(now, tz) : null;
  const nowMin = nowParts ? nowParts.hour * 60 + nowParts.minute : 0;

  return (
    <div className={styles.timeWrap} style={{ ["--days" as string]: days.length, ["--hour-h" as string]: `${HOUR_H}px` }}>
      <div className={styles.timeHead}>
        <div />
        {days.map((k) => {
          const dow = keyToUtc(k).getUTCDay();
          return (
            <div key={k} className={cx(styles.timeHeadCell, k === todayKey && styles.timeHeadToday)}>
              {WEEKDAYS[dow]}
              {days.length > 1 ? (
                <button type="button" onClick={() => onDay(k)} aria-label={`Open ${formatKeyLong(k)}`} style={{ all: "unset", cursor: "pointer" }}>
                  <strong>{Number(k.slice(8))}</strong>
                </button>
              ) : (
                <strong>{Number(k.slice(8))}</strong>
              )}
            </div>
          );
        })}
      </div>
      <div className={styles.timeScroll} ref={scrollRef}>
        <div className={styles.timeBody}>
          <div className={styles.hours} aria-hidden="true">
            {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
              <span key={h} className={styles.hourLabel} style={{ top: h * HOUR_H }}>
                {h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h - 12} PM`}
              </span>
            ))}
          </div>
          {days.map((k) => {
            const placed = layoutDay(byDay.get(k) ?? [], tz, 24);
            return (
              <div
                key={k}
                className={cx(styles.dayCol, k === todayKey && styles.dayColToday)}
                onClick={(ev) => {
                  const rect = ev.currentTarget.getBoundingClientRect();
                  const hour = Math.min(23, Math.max(0, Math.floor((ev.clientY - rect.top) / HOUR_H)));
                  onSlot(k, `${String(hour).padStart(2, "0")}:00`);
                }}
              >
                {placed.map((p) => (
                  <button
                    key={p.event.id}
                    type="button"
                    className={cx(styles.slot, p.event.importance === "high" && styles.slotHigh)}
                    style={{
                      top: (p.top / 60) * HOUR_H + 1,
                      height: (p.height / 60) * HOUR_H - 2,
                      left: `calc(${(p.lane / p.lanes) * 100}% + 2px)`,
                      width: `calc(${100 / p.lanes}% - 4px)`,
                    }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onOpen(p.event);
                    }}
                  >
                    <span className={styles.slotTitle}>{p.event.title}</span>
                    <span className={styles.slotTime}>
                      {formatTimeShort(new Date(p.event.start), tz)} – {formatTimeShort(new Date(p.event.end), tz)}
                    </span>
                  </button>
                ))}
                {k === todayKey && nowParts && <span className={styles.nowLine} style={{ top: (nowMin / 60) * HOUR_H }} aria-hidden="true" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function weekRangeTitle(cursorKey: string) {
  const days = weekDays(cursorKey);
  return formatKeyRange(days[0], days[6]);
}

/** "Tomorrow, 2:00 PM - 3:00 PM" · "Aug 15, 10:00 AM - 11:30 AM" */
function whenLabel(e: CalendarEvent, tz: string, todayKey: string) {
  const start = new Date(e.start);
  const k = dateKey(start, tz);
  const day = k === todayKey ? "Today" : k === addDaysKey(todayKey, 1) ? "Tomorrow" : formatKeyMonthDay(k);
  return `${day}, ${formatTimeShort(start, tz)} - ${formatTimeShort(new Date(e.end), tz)}`;
}

function plusHour(hhmm: string) {
  const h = Math.min(23, Number(hhmm.slice(0, 2)) + 1);
  return `${String(h).padStart(2, "0")}:${hhmm.slice(3)}`;
}
