/* Timezone + date helpers built on Intl (no dependencies). */

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      weekday: "short",
    });
    dtfCache.set(tz, f);
  }
  return f;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface ZonedParts {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
}

export function zonedParts(date: Date, tz: string): ZonedParts {
  const o: Record<string, string> = {};
  for (const p of partsFormatter(tz).formatToParts(date)) o[p.type] = p.value;
  return {
    year: +o.year,
    month: +o.month,
    day: +o.day,
    hour: +o.hour % 24,
    minute: +o.minute,
    second: +o.second,
    weekday: WEEKDAYS.indexOf(o.weekday),
  };
}

/** UTC offset (minutes) of `tz` at `date`. */
export function tzOffsetMinutes(date: Date, tz: string): number {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const truncated = Math.floor(date.getTime() / 1000) * 1000;
  return Math.round((asUtc - truncated) / 60000);
}

/** Convert a wall-clock time in `tz` to a UTC Date. */
export function zonedTimeToUtc(tz: string, y: number, m: number, d: number, h = 0, mi = 0): Date {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const off1 = tzOffsetMinutes(new Date(guess), tz);
  let t = guess - off1 * 60000;
  const off2 = tzOffsetMinutes(new Date(t), tz);
  if (off2 !== off1) t = guess - off2 * 60000;
  return new Date(t);
}

/* ------------------------------ formatting ------------------------------ */

const fix = (s: string) => s.replace(/\u202f/g, " ");

/** "10:41 PM" (leading zero, matches the design). */
export function formatClock(date: Date, tz: string): string {
  return fix(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: true }).format(date),
  );
}

/** "10:00 AM" without a leading zero — for agenda / event copy. */
export function formatTimeShort(date: Date, tz: string): string {
  return fix(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(date),
  );
}

/** "UTC +8", "UTC -6", "UTC +5:30" */
export function formatUtcOffset(date: Date, tz: string): string {
  const off = tzOffsetMinutes(date, tz);
  const sign = off < 0 ? "-" : "+";
  const abs = Math.abs(off);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC ${sign}${h}${m ? ":" + String(m).padStart(2, "0") : ""}`;
}

/** yyyy-mm-dd of `date` as seen in `tz`. */
export function dateKey(date: Date, tz: string): string {
  const p = zonedParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function keyToUtc(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

export function addDaysKey(key: string, n: number): string {
  const d = keyToUtc(key);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function addMonthsKey(key: string, n: number): string {
  const d = keyToUtc(key);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

export function startOfWeekKey(key: string): string {
  return addDaysKey(key, -keyToUtc(key).getUTCDay());
}

const utcFmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts });

/** "Aug 14" from a yyyy-mm-dd key. */
export function formatKeyShort(key: string): string {
  return utcFmt({ month: "short", day: "2-digit" }).format(keyToUtc(key));
}
/** "Aug 5" from a yyyy-mm-dd key. */
export function formatKeyMonthDay(key: string): string {
  return utcFmt({ month: "short", day: "numeric" }).format(keyToUtc(key));
}
export function formatKeyMonthYear(key: string): string {
  return utcFmt({ month: "long", year: "numeric" }).format(keyToUtc(key));
}
export function formatKeyLong(key: string): string {
  return utcFmt({ weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(keyToUtc(key));
}
export function formatKeyRange(startKey: string, endKey: string): string {
  const s = keyToUtc(startKey);
  const e = keyToUtc(endKey);
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear();
  const a = utcFmt({ month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }).format(s);
  const b = utcFmt({ month: "short", day: "numeric", year: "numeric" }).format(e);
  return `${a} – ${b}`;
}

/** ISO 8601 week number for a yyyy-mm-dd key. */
export function isoWeek(key: string): number {
  const d = keyToUtc(key);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
}

export function timeAgo(iso: string, nowMs: number = Date.now()): string {
  const s = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export function greetingFor(hour: number): string {
  if (hour < 12) return "Good Morning";
  if (hour < 18) return "Good Afternoon";
  return "Good Evening";
}

/** "30 mins" / "1 hour" / "1 hr 30 mins" */
export function formatDuration(startIso: string, endIso: string): string {
  const mins = Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000));
  if (mins < 60) return `${mins} mins`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return `${h} hour${h === 1 ? "" : "s"}`;
  return `${h} hr ${m} mins`;
}
