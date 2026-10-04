/* Run with: npx tsx src/lib/calendar.test.ts */
import assert from "node:assert/strict";
import { monthGrid, weekDays, layoutDay, groupByDay } from "./calendar";
import { addDaysKey, addMonthsKey, dateKey, isoWeek, startOfWeekKey, zonedTimeToUtc, formatUtcOffset } from "./time";
import type { CalendarEvent } from "@/types/models";

// October 2026 starts on a Thursday and has 31 days → 5 weeks, Sun-first
const oct = monthGrid("2026-10-15");
assert.equal(oct.length, 5);
assert.equal(oct[0][0], "2026-09-27");
assert.equal(oct[0][4], "2026-10-01");
assert.equal(oct[4][6], "2026-10-31");
// a month that needs 6 weeks: May 2026 (starts Fri, 31 days)
assert.equal(monthGrid("2026-05-10").length, 6);
// February 2026: starts on Sunday, 28 days → exactly 4 weeks
assert.equal(monthGrid("2026-02-01").length, 4);
assert.deepEqual(weekDays("2026-10-04")[0], "2026-10-04"); // Sunday
assert.equal(weekDays("2026-10-07")[0], "2026-10-04");

// month arithmetic clamps to the 1st (no 31st overflow)
assert.equal(addMonthsKey("2026-01-31", 1), "2026-02-01");
assert.equal(addMonthsKey("2026-12-15", 1), "2027-01-01");
assert.equal(addDaysKey("2026-02-28", 1), "2026-03-01");
assert.equal(startOfWeekKey("2026-10-04"), "2026-10-04");
assert.equal(isoWeek("2026-08-10"), 33);

// timezone conversion round-trips, incl. across a DST change (US 2026-11-01)
const tz = "America/Chicago";
const d = zonedTimeToUtc(tz, 2026, 10, 31, 23, 30);
assert.equal(dateKey(d, tz), "2026-10-31");
const after = zonedTimeToUtc(tz, 2026, 11, 2, 9, 0);
assert.equal(formatUtcOffset(after, tz), "UTC -6");
assert.equal(formatUtcOffset(d, tz), "UTC -5");
assert.equal(formatUtcOffset(new Date(), "Asia/Kolkata"), "UTC +5:30");
// events stay on the right local day even when UTC date differs
const lateManila = zonedTimeToUtc("Asia/Manila", 2026, 10, 4, 1, 0); // 01:00 Manila = prev day UTC
assert.equal(dateKey(lateManila, "Asia/Manila"), "2026-10-04");
assert.equal(lateManila.toISOString().slice(0, 10), "2026-10-03");

// layout: overlapping events get separate lanes, non-overlapping reuse lane 0
const mk = (id: string, s: string, e: string): CalendarEvent => ({ id, title: id, kind: "event", importance: "standard", start: s, end: e });
const z = "Asia/Manila";
const at = (h: number, m = 0) => zonedTimeToUtc(z, 2026, 10, 4, h, m).toISOString();
const placed = layoutDay([mk("a", at(10), at(11)), mk("b", at(10, 30), at(11, 30)), mk("c", at(13), at(14))], z);
const by = Object.fromEntries(placed.map((p) => [p.event.id, p]));
assert.equal(by.a.lanes, 2);
assert.equal(by.b.lanes, 2);
assert.notEqual(by.a.lane, by.b.lane);
assert.equal(by.c.lanes, 1);
assert.equal(by.c.lane, 0);
assert.equal(by.a.top, 600);
assert.equal(by.a.height, 60);

// groupByDay sorts by start time
const g = groupByDay([mk("late", at(15), at(16)), mk("early", at(9), at(10))], z);
assert.deepEqual(g.get("2026-10-04")!.map((e) => e.id), ["early", "late"]);

console.log("calendar helpers: all assertions passed");
