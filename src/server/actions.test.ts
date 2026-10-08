/* Run with: npx tsx src/server/actions.test.ts */
import assert from "node:assert/strict";
import { activeSprintOf, completeSprint, createSprint, createTask, deleteSprint, isDateKey, migrateLegacyBoard, normalizeActions, parseSprintFields, parseTaskFields, placementError, startSprint, summarize, taskHref, updateTask } from "./actions";
import type { Db } from "./db";
import type { Sprint, Task } from "../types/models";

const NOW = "2026-10-08T10:00:00.000Z", TODAY = "2026-10-08";
const member = (id: string) => ({ id, name: id, role: "r", department: "d", initials: "XX", status: "active" as const, availability: "free" as const, managerId: null, skills: [] });
const sprint = (id: string, companyId: Sprint["companyId"], number: number, status: Sprint["status"]): Sprint => ({ id, companyId, number, name: `Sprint ${number}`, goal: "", status, startDate: "2026-10-01", endDate: "2026-10-15" });
const task = (id: string, o: Partial<Task> = {}): Task => ({ id, key: id.toUpperCase(), title: id, description: "", companyId: "boss", sprintId: null, status: "todo", priority: "medium", dueDate: TODAY, progress: 0, assigneeId: null, rev: 1, updatedAt: NOW, ...o });
const db = (): Db => ({
  members: [member("a"), member("b")], accounts: [], tasks: [], sprints: [], events: [], conversations: [], messages: {}, templates: [], drafts: [], activity: [], notifications: [],
  settings: {} as Db["settings"], system: {} as Db["system"], nextTicket: 50,
});
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => { assert.equal(r.ok, true, JSON.stringify(r)); return r as Extract<T, { ok: true }>; };
const bad = (r: { ok: boolean; error?: string }, match: RegExp) => { assert.equal(r.ok, false); assert.match(r.error ?? "", match); };

/* ---- dates ---- */
assert.ok(isDateKey("2026-02-28") && !isDateKey("2026-02-31") && !isDateKey("2026-2-3") && !isDateKey("") && !isDateKey(undefined) && !isDateKey("2026-13-01"));

/* ---- read-time normalisation: Backlog is gone ---- */
{
  const d = db();
  d.tasks = [task("t1", { status: "backlog" as never }), task("t2", { status: "weird" as never }), { ...task("t3"), companyId: undefined as never, sprintId: undefined as never, rev: undefined as never, updatedAt: undefined as never }];
  normalizeActions(d);
  assert.deepEqual(d.tasks.map((t) => t.status), ["todo", "todo", "todo"], "backlog (and anything unknown) becomes To Do");
  assert.deepEqual([d.tasks[2].companyId, d.tasks[2].sprintId, d.tasks[2].rev], ["boss", null, 1]);
  const snapshot = JSON.stringify(d); normalizeActions(d); assert.equal(JSON.stringify(d), snapshot, "idempotent (and never reads the clock)");
}

/* ---- one-time upgrade of a pre-sprint board ---- */
{
  const d = db();
  d.tasks = [task("t1", { status: "backlog" as never, sprintId: undefined as never }), task("t2", { sprintId: undefined as never, status: "review" }), task("t3", { sprintId: null })];
  assert.equal(migrateLegacyBoard(d, NOW), true);
  const s = d.sprints[0];
  assert.deepEqual([s.id, s.companyId, s.name, s.status, s.startDate, s.endDate], ["sp_legacy_boss", "boss", "Sprint 1", "active", TODAY, "2026-10-22"]);
  assert.deepEqual(d.tasks.map((t) => [t.sprintId, t.status]), [[s.id, "todo"], [s.id, "review"], [null, "todo"]], "old work lands on the board; explicit 'unscheduled' stays unscheduled");
  assert.equal(migrateLegacyBoard(d, "later"), false, "runs once");
  const empty = db(); assert.equal(migrateLegacyBoard(empty, NOW), false); assert.equal(empty.sprints.length, 0, "no tasks → no sprint invented");
}

/* ---- placement ---- */
{
  const d = db(); d.sprints = [sprint("b-act", "boss", 2, "active"), sprint("b-old", "boss", 1, "completed"), sprint("r-act", "rli", 1, "active")];
  assert.equal(placementError(d, "boss", null), null);
  assert.equal(placementError(d, "boss", "b-act"), null);
  assert.match(placementError(d, "boss", "r-act")!, /different company/);
  assert.match(placementError(d, "boss", "b-old")!, /completed/);
  assert.equal(placementError(d, "boss", "b-old", "b-old"), null, "staying in a completed sprint is fine");
  assert.match(placementError(d, "boss", "nope")!, /no longer exists/);
}

/* ---- task field validation ---- */
{
  const d = db(); d.sprints = [sprint("s", "boss", 1, "active")];
  bad(parseTaskFields(d, { status: "backlog" }), /To Do, In Progress, Review or Done/);
  bad(parseTaskFields(d, { status: "doing" }), /Status/); bad(parseTaskFields(d, { companyId: "acme" }), /BOSS, RLI or LL/); bad(parseTaskFields(d, { title: "  " }), /Title/);
  bad(parseTaskFields(d, { dueDate: "2026-02-31" }), /date/); bad(parseTaskFields(d, { assigneeId: "ghost" }), /Assignee/); bad(parseTaskFields(d, { sprintId: 5 }), /sprint/i);
  for (const status of ["todo", "in-progress", "review", "done"]) ok(parseTaskFields(d, { status }));
  assert.equal(ok(parseTaskFields(d, { sprintId: "" })).fields.sprintId, null, "empty string = unscheduled");
  assert.equal(ok(parseTaskFields(d, { progress: 250 })).fields.progress, 100);
}

/* ---- creating tasks ---- */
{
  const d = db(); d.sprints = [sprint("b1", "boss", 1, "active"), sprint("b0", "boss", 0, "completed"), sprint("r1", "rli", 1, "active")];
  let t = ok(createTask(d, { title: "x" }, "a", NOW)).task;
  assert.deepEqual([t.companyId, t.sprintId, t.status, t.key, t.rev], ["boss", "b1", "todo", "BOSS-50", 1], "default: the company's active sprint, so it shows on the board");
  t = ok(createTask(d, { title: "y", companyId: "rli" }, "a", NOW)).task; assert.deepEqual([t.sprintId, t.key], ["r1", "RLI-51"], "ticket numbers are unique across companies");
  assert.equal(ok(createTask(d, { title: "z", sprintId: null }, "a", NOW)).task.sprintId, null, "null = unscheduled");
  assert.equal(ok(createTask(d, { title: "no active", companyId: "ll" }, "a", NOW)).task.sprintId, null, "no active sprint → unscheduled");
  assert.equal(ok(createTask(d, { title: "d", status: "done" }, "a", NOW)).task.progress, 100);
  bad(createTask(d, { title: "q", companyId: "boss", sprintId: "r1" }, "a", NOW), /different company/); bad(createTask(d, { title: "q", sprintId: "b0" }, "a", NOW), /completed/);
}

/* ---- updating tasks ---- */
{
  const d = db(); d.sprints = [sprint("b1", "boss", 1, "active"), sprint("b2", "boss", 2, "planned"), sprint("b0", "boss", 0, "completed"), sprint("r1", "rli", 1, "active")];
  const t = task("t1", { sprintId: "b1", progress: 40 }); d.tasks = [t];
  const u = ok(updateTask(d, t, { status: "done" }, "a", NOW)); assert.deepEqual([t.status, t.progress, t.rev, t.updatedBy], ["done", 100, 2, "a"]); assert.equal(u.before.status, "todo");
  ok(updateTask(d, t, { status: "review" }, "a", NOW)); assert.equal(t.progress, 90, "leaving Done never leaves a 100% task in an open column");
  ok(updateTask(d, t, { status: "done", progress: 70 }, "a", NOW)); assert.equal(t.progress, 70, "an explicit progress is respected");
  ok(updateTask(d, t, { sprintId: "b2" }, "a", NOW)); assert.equal(t.sprintId, "b2");
  ok(updateTask(d, t, { sprintId: null }, "a", NOW)); assert.equal(t.sprintId, null);
  bad(updateTask(d, t, { sprintId: "b0" }, "a", NOW), /completed/); bad(updateTask(d, t, { sprintId: "r1" }, "a", NOW), /different company/);
  const rev = t.rev; bad(updateTask(d, t, { sprintId: "b0" }, "a", NOW), /./); assert.equal(t.rev, rev, "a rejected change changes nothing");
  // moving to another company: new key, sprint cleared (the old sprint isn't theirs any more)
  ok(updateTask(d, t, { sprintId: "b1" }, "a", NOW)); const oldKey = t.key; ok(updateTask(d, t, { companyId: "rli" }, "a", NOW));
  assert.deepEqual([t.companyId, t.sprintId, t.key === oldKey], ["rli", null, false]); assert.match(t.key, /^RLI-\d+$/);
  ok(updateTask(d, t, { companyId: "boss", sprintId: "b1" }, "a", NOW)); assert.equal(t.sprintId, "b1", "company + sprint can change together");
  const stuck = task("t2", { sprintId: "b0", status: "done" }); d.tasks.push(stuck); ok(updateTask(d, stuck, { title: "renamed" }, "a", NOW)); assert.equal(stuck.sprintId, "b0", "editing a task in a completed sprint is fine");
}

/* ---- sprint validation + creation ---- */
{
  bad(parseSprintFields({ name: " " }), /name/); bad(parseSprintFields({ name: "x".repeat(61) }), /60/); bad(parseSprintFields({ goal: "g".repeat(301) }), /300/);
  bad(parseSprintFields({ startDate: "nope" }), /start/); bad(parseSprintFields({ endDate: "2026-02-30" }), /end/);
  bad(parseSprintFields({ startDate: "2026-10-10", endDate: "2026-10-09" }), /before it starts/);
  bad(parseSprintFields({ endDate: "2026-10-01" }, { startDate: "2026-10-05", endDate: "2026-10-19" }), /before it starts/);
  ok(parseSprintFields({ startDate: "2026-10-10", endDate: "2026-10-10" }));
  const d = db();
  const a = createSprint(d, "boss", {}, TODAY); assert.deepEqual([a.number, a.name, a.status, a.startDate, a.endDate], [1, "Sprint 1", "planned", TODAY, "2026-10-22"]);
  assert.equal(createSprint(d, "boss", { name: "Hardening", goal: "Ship it" }, TODAY).number, 2); assert.equal(createSprint(d, "rli", {}, TODAY).number, 1, "numbering is per company");
}

/* ---- the sprint lifecycle ---- */
{
  const d = db(); const s1 = createSprint(d, "boss", {}, TODAY), s2 = createSprint(d, "boss", {}, TODAY), r1 = createSprint(d, "rli", {}, TODAY);
  bad(startSprint(d, "nope", {}, NOW), /not found/); 
  ok(startSprint(d, s1.id, { name: "Launch", goal: "Go live", endDate: "2026-10-30" }, NOW)); assert.deepEqual([s1.status, s1.name, s1.goal, s1.endDate, s1.startedAt], ["active", "Launch", "Go live", "2026-10-30", NOW]);
  bad(startSprint(d, s2.id, {}, NOW), /Launch is still active/); assert.equal(startSprint(d, s2.id, {}, NOW).ok ? 1 : (startSprint(d, s2.id, {}, NOW) as { status: number }).status, 409);
  ok(startSprint(d, r1.id, {}, NOW)); assert.equal(activeSprintOf(d, "rli")?.id, r1.id, "another company can run its own sprint at the same time");
  bad(startSprint(d, s1.id, {}, NOW), /already started/); bad(startSprint(d, s2.id, { startDate: "2026-11-02", endDate: "2026-11-01" }, NOW), /./);

  d.tasks = [task("a", { sprintId: s1.id, status: "done" }), task("b", { sprintId: s1.id, status: "review" }), task("c", { sprintId: s1.id, status: "todo" }), task("x", { sprintId: s2.id })];
  bad(completeSprint(d, s2.id, null, NOW, "a"), /Only the active sprint/); bad(completeSprint(d, s1.id, r1.id, NOW, "a"), /planned sprint of the same company/); bad(completeSprint(d, s1.id, s1.id, NOW, "a"), /planned/);
  assert.equal(d.tasks.find((t) => t.id === "b")!.sprintId, s1.id, "a refused completion changes nothing");
  const done = ok(completeSprint(d, s1.id, s2.id, NOW, "a"));
  assert.deepEqual(done.movedIds.sort(), ["b", "c"]); assert.deepEqual(d.tasks.map((t) => [t.id, t.sprintId]), [["a", s1.id], ["b", s2.id], ["c", s2.id], ["x", s2.id]], "finished stays as history, unfinished moves on");
  assert.deepEqual([s1.status, s1.completedAt, s1.summary], ["completed", NOW, { total: 3, done: 1, moved: 2 }]); assert.equal(d.tasks.find((t) => t.id === "b")!.rev, 2);
  bad(completeSprint(d, s1.id, null, NOW, "a"), /Only the active/);
  ok(startSprint(d, s2.id, {}, NOW)); const back = ok(completeSprint(d, s2.id, null, NOW, "a")); assert.equal(back.movedIds.length, 3); assert.ok(d.tasks.filter((t) => t.id !== "a").every((t) => t.sprintId === null), "no target → unscheduled");
}

/* ---- deleting a sprint ---- */
{
  const d = db(); const p = createSprint(d, "boss", {}, TODAY), act = createSprint(d, "boss", {}, TODAY), old = createSprint(d, "boss", {}, TODAY);
  ok(startSprint(d, act.id, {}, NOW)); old.status = "completed"; d.tasks = [task("a", { sprintId: p.id })];
  bad(deleteSprint(d, act.id, NOW, "a"), /Complete the active sprint/); bad(deleteSprint(d, old.id, NOW, "a"), /record/); bad(deleteSprint(d, "nope", NOW, "a"), /not found/);
  const r = ok(deleteSprint(d, p.id, NOW, "a")); assert.deepEqual([r.movedIds, d.tasks[0].sprintId, d.sprints.some((s) => s.id === p.id)], [["a"], null, false], "its work goes back to unscheduled");
}

/* ---- overview + links ---- */
{
  const d = db(); const s = createSprint(d, "boss", { name: "Now" }, TODAY); ok(startSprint(d, s.id, {}, NOW)); createSprint(d, "boss", {}, TODAY);
  d.tasks = [task("a", { sprintId: s.id }), task("b", { sprintId: s.id, status: "done" }), task("c", { sprintId: null }), task("d", { companyId: "ll" })];
  const sum = Object.fromEntries(summarize(d).map((x) => [x.id, x]));
  assert.deepEqual([sum.boss.activeSprint?.name, sum.boss.open, sum.boss.done, sum.boss.unscheduled, sum.boss.sprintCount], ["Now", 1, 1, 1, 2]);
  assert.deepEqual([sum.rli.activeSprint, sum.rli.sprintCount, sum.ll.unscheduled], [null, 0, 1]);
  assert.equal(taskHref(d, d.tasks[0]), "/actions/boss/board?task=a", "in the active sprint → on the board");
  assert.equal(taskHref(d, d.tasks[2]), "/actions/boss/sprints?task=c", "otherwise → the sprints screen");
}
console.log("actions rules: all assertions passed");
