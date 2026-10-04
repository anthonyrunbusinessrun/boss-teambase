import { addDaysKey, dateKey, keyToUtc, startOfWeekKey, zonedParts } from "./time";
import type { CalendarEvent } from "@/types/models";

export type CalendarView = "month" | "week" | "day";

/** Weeks (arrays of 7 yyyy-mm-dd keys) covering the month of `cursorKey`, Sunday-first. */
export function monthGrid(cursorKey: string): string[][] {
  const first = `${cursorKey.slice(0, 8)}01`;
  const d = keyToUtc(first);
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  const lastKey = addDaysKey(first, daysInMonth - 1);
  const weeks: string[][] = [];
  let day = startOfWeekKey(first);
  while (day <= lastKey) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDaysKey(day, i)));
    day = addDaysKey(day, 7);
  }
  return weeks;
}

export function weekDays(cursorKey: string): string[] {
  const start = startOfWeekKey(cursorKey);
  return Array.from({ length: 7 }, (_, i) => addDaysKey(start, i));
}

/** Group events by the day they start on, in `tz`. Each day is sorted by start time. */
export function groupByDay(events: CalendarEvent[], tz: string): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const k = dateKey(new Date(e.start), tz);
    (map.get(k) ?? map.set(k, []).get(k)!).push(e);
  }
  for (const list of map.values()) list.sort((a, b) => a.start.localeCompare(b.start));
  return map;
}

export interface PlacedEvent {
  event: CalendarEvent;
  /** minutes from midnight (in tz) */
  top: number;
  height: number;
  lane: number;
  lanes: number;
}

/**
 * Lay a day's events out on a 24h grid. Overlapping events are split into side-by-side lanes.
 * Events are clamped to the day they start on.
 */
export function layoutDay(events: CalendarEvent[], tz: string, minHeight = 30): PlacedEvent[] {
  const items = events
    .map((event) => {
      const s = zonedParts(new Date(event.start), tz);
      const start = s.hour * 60 + s.minute;
      const dur = Math.max(15, Math.round((new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000));
      const end = Math.min(24 * 60, start + dur);
      return { event, start, end };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const placed: PlacedEvent[] = [];
  let cluster: typeof items = [];
  let clusterEnd = -1;

  const flush = () => {
    if (!cluster.length) return;
    const laneEnds: number[] = [];
    const assigned = cluster.map((it) => {
      let lane = laneEnds.findIndex((end) => end <= it.start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = it.end;
      return { it, lane };
    });
    for (const { it, lane } of assigned) {
      placed.push({ event: it.event, top: it.start, height: Math.max(minHeight, it.end - it.start), lane, lanes: laneEnds.length });
    }
    cluster = [];
  };

  for (const it of items) {
    if (cluster.length && it.start >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(cluster.length === 1 ? 0 : clusterEnd, it.end);
  }
  flush();
  return placed;
}
