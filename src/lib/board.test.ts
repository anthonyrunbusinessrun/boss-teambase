/* Run with: npx tsx src/lib/board.test.ts */
import assert from "node:assert/strict";
import { countByStatus, daysLeft, daysLeftText, describeRemoteChange, mergeTasks, percentDone, sprintRange, withStatus } from "./board";
import type { Task } from "../types/models";

const t = (id: string, o: Partial<Task> = {}): Task => ({ id, key: id.toUpperCase(), title: id, description: "", companyId: "boss", sprintId: "s1", status: "todo", priority: "medium", dueDate: "2026-10-10", progress: 0, assigneeId: null, rev: 1, updatedAt: "x", ...o });

/* ---- a live update only replaces the local copy if it is as new or newer ---- */
{
  const local = [t("a", { rev: 3, status: "review" }), t("b")];
  assert.equal(mergeTasks(local, [t("a", { rev: 2, status: "todo" })]).find((x) => x.id === "a")!.status, "review", "a late, older update must never undo a newer change");
  assert.equal(mergeTasks(local, [t("a", { rev: 4, status: "done" })]).find((x) => x.id === "a")!.status, "done");
  assert.equal(mergeTasks(local, [t("a", { rev: 3, status: "review", title: "same rev" })]).find((x) => x.id === "a")!.title, "same rev", "the server's copy replaces our optimistic one");
  assert.deepEqual(mergeTasks(local, [t("c")]).map((x) => x.id), ["a", "b", "c"], "new tasks are appended");
  assert.equal(mergeTasks(local, []).length, 2);
  assert.notEqual(mergeTasks(local, []), local, "never mutates its input");
}

/* ---- the optimistic move mirrors the server's rules ---- */
assert.deepEqual([withStatus(t("a", { progress: 40 }), "done").progress, withStatus(t("a", { status: "done", progress: 100 }), "review").progress], [100, 90]);
assert.equal(withStatus(t("a", { status: "done", progress: 70 }), "todo").progress, 70);
{ const x = t("a"); assert.equal(withStatus(x, "todo"), x, "no change → same object"); }

/* ---- announcing someone else's change ---- */
const d = describeRemoteChange;
assert.equal(d({ by: "Bob", change: "created", next: t("a", { key: "BOSS-49" }) }), "Bob added BOSS-49");
assert.equal(d({ by: "Bob", change: "deleted", prev: t("a", { key: "BOSS-49" }) }), "Bob removed BOSS-49");
assert.equal(d({ by: "Bob", change: "deleted" }), "Bob removed a task");
assert.equal(d({ by: "Bob", change: "updated", prev: t("a", { key: "TB-1", status: "todo" }), next: t("a", { key: "TB-1", status: "review" }) }), "Bob moved TB-1 to Review");
assert.equal(d({ by: "Bob", change: "updated", prev: t("a", { key: "TB-1" }), next: t("a", { key: "TB-1", status: "in-progress" }) }), "Bob moved TB-1 to In Progress");
assert.equal(d({ by: "Bob", change: "updated", prev: t("a", { key: "TB-1", sprintId: "s1" }), next: t("a", { key: "TB-1", sprintId: null }), sprintName: null }), "Bob moved TB-1 to Unscheduled");
assert.equal(d({ by: "Bob", change: "updated", prev: t("a", { key: "TB-1", sprintId: "s1" }), next: t("a", { key: "TB-1", sprintId: "s2" }), sprintName: "Sprint 3" }), "Bob moved TB-1 to Sprint 3");
assert.equal(d({ by: "Bob", change: "updated", prev: t("a", { key: "TB-1" }), next: t("a", { key: "TB-1", title: "new" }) }), "Bob updated TB-1");
assert.equal(d({ by: "Bob", change: "updated", prev: t("a", { key: "TB-1" }) }), "Bob removed TB-1", "left this board (moved to another company)");

/* ---- sprint dates ---- */
assert.equal(daysLeft({ endDate: "2026-10-19" }, "2026-10-08"), 11);
assert.equal(daysLeft({ endDate: "2026-10-08" }, "2026-10-08"), 0);
assert.equal(daysLeft({ endDate: "2026-10-06" }, "2026-10-08"), -2);
assert.equal(daysLeft({ endDate: "2027-01-02" }, "2026-12-30"), 3, "across a year boundary");
assert.deepEqual([daysLeftText({ endDate: "2026-10-19" }, "2026-10-08"), daysLeftText({ endDate: "2026-10-09" }, "2026-10-08"), daysLeftText({ endDate: "2026-10-08" }, "2026-10-08"), daysLeftText({ endDate: "2026-10-07" }, "2026-10-08"), daysLeftText({ endDate: "2026-10-05" }, "2026-10-08")],
  ["11 days left", "1 day left", "Ends today", "1 day overdue", "3 days overdue"]);
assert.equal(sprintRange({ startDate: "2026-10-05", endDate: "2026-10-19" }), "Oct 5 – Oct 19");

/* ---- counts ---- */
const c = countByStatus([t("a"), t("b", { status: "done" }), t("c", { status: "done" }), t("d", { status: "review" })]);
assert.deepEqual(c, { todo: 1, "in-progress": 0, review: 1, done: 2, total: 4 }); assert.equal(percentDone(c), 50); assert.equal(percentDone(countByStatus([])), 0);
console.log("board helpers: all assertions passed");
