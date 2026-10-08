/**
 * Actions backend tests — companies, 4-status boards, sprints, live board events — real HTTP + real PostgreSQL.
 *   DATABASE_URL=… node qa/support/seed-accounts.mjs && BASE=http://localhost:3201 node qa/api/actions.test.mjs
 */
import { api, assert, eq, login, openStream, post, section, summary, test } from "../support/client.mjs";
import pg from "pg";

const BASE = process.env.BASE || "http://localhost:3201";
const sql = new pg.Client({ connectionString: process.env.DATABASE_URL }); await sql.connect();
const [alice, bob] = await Promise.all(["alice", "bob"].map((n) => login(BASE, `${n}@test.local`)));
const patch = (u, p, b) => api(u, p, { method: "PATCH", body: JSON.stringify(b) });
const del = (u, p) => api(u, p, { method: "DELETE" });
const tasks = async (co) => (await api(alice, `/tasks?company=${co}`)).json;
const sprints = async (co) => (await api(alice, `/sprints?company=${co}`)).json;
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

// ───────────────────────────────────────────────────────────────────────────────────────────────
section("1. Three companies, each with its own board and sprints");
await test("the companies overview lists BOSS, RLI and LL with their own active sprint", async () => {
  const c = (await api(alice, "/companies")).json;
  eq(c.map((x) => x.id), ["boss", "rli", "ll"]);
  assert(c.every((x) => x.activeSprint && x.sprintCount >= 1), "each company has its own sprint");
  assert(new Set(c.map((x) => x.activeSprint.id)).size === 3, "three different active sprints");
});
await test("every task belongs to one company, and each company's board only holds its own work", async () => {
  for (const co of ["boss", "rli", "ll"]) {
    const t = await tasks(co); assert(t.length > 0, co + " has work"); assert(t.every((x) => x.companyId === co), co + " leaked another company's task");
    const ids = new Set((await sprints(co)).map((s) => s.id)); assert(t.every((x) => x.sprintId === null || ids.has(x.sprintId)), co + " task in another company's sprint");
  }
});
await test("an unknown company is refused", async () => {
  eq((await api(alice, "/tasks?company=acme")).status, 400); eq((await api(alice, "/sprints?company=acme")).status, 400);
  eq((await post(alice, "/tasks", { title: "x", companyId: "acme" })).status, 400);
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
section("2. Exactly four statuses — no Backlog");
await test("the four statuses are accepted", async () => {
  const t = (await post(alice, "/tasks", { title: "status walk", companyId: "ll" })).json;
  for (const status of ["in-progress", "review", "done", "todo"]) eq((await patch(alice, `/tasks/${t.id}`, { status })).json.status, status);
  await del(alice, `/tasks/${t.id}`);
});
await test("'backlog' (and any other status) is rejected, on create and on update", async () => {
  const bad = await post(alice, "/tasks", { title: "x", status: "backlog" }); eq(bad.status, 400); assert(/To Do, In Progress, Review or Done/.test(bad.json.error), bad.json.error);
  const t = (await post(alice, "/tasks", { title: "x" })).json;
  eq((await patch(alice, `/tasks/${t.id}`, { status: "backlog" })).status, 400); eq((await patch(alice, `/tasks/${t.id}`, { status: "blocked" })).status, 400);
  await del(alice, `/tasks/${t.id}`);
});
await test("no task anywhere has a status other than the four", async () => {
  const all = (await api(alice, "/tasks")).json; assert(all.length > 10); assert(all.every((t) => ["todo", "in-progress", "review", "done"].includes(t.status)), "stray status");
});
await test("moving to Done completes the task (100%); moving back never leaves a 100% task in an open column", async () => {
  const t = (await post(alice, "/tasks", { title: "finish me", progress: 40 })).json;
  eq((await patch(alice, `/tasks/${t.id}`, { status: "done" })).json.progress, 100); eq((await patch(alice, `/tasks/${t.id}`, { status: "review" })).json.progress, 90); await del(alice, `/tasks/${t.id}`);
});
await test("new tickets are keyed by company (BOSS-…, RLI-…, LL-…), unique across companies", async () => {
  const made = []; for (const co of ["boss", "rli", "ll"]) made.push((await post(alice, "/tasks", { title: "k " + co, companyId: co })).json);
  eq(made.map((t) => t.key.split("-")[0]), ["BOSS", "RLI", "LL"]); assert(new Set(made.map((t) => t.key)).size === 3);
  for (const t of made) await del(alice, `/tasks/${t.id}`);
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
section("3. Sprints — plan, start, run, complete (Jira-style)");
let co = "rli", s2, s3;
await test("a new task lands in the company's active sprint by default; null means unscheduled", async () => {
  const active = (await sprints(co)).find((s) => s.status === "active");
  const t = (await post(alice, "/tasks", { title: "default sprint", companyId: co })).json; eq(t.sprintId, active.id);
  const u = (await post(alice, "/tasks", { title: "unscheduled", companyId: co, sprintId: null })).json; eq(u.sprintId, null);
  await del(alice, `/tasks/${t.id}`); await del(alice, `/tasks/${u.id}`);
});
await test("create a sprint: numbered per company, planned, two-week default", async () => {
  const r = await post(alice, "/sprints", { companyId: co, goal: "Hit the numbers" }); eq(r.status, 201); s2 = r.json;
  eq([s2.number, s2.name, s2.status, s2.goal], [2, "Sprint 2", "planned", "Hit the numbers"]);
  const days = (new Date(s2.endDate) - new Date(s2.startDate)) / 86400000; eq(days, 14);
  eq((await post(alice, "/sprints", { companyId: "boss" })).json.number >= 4, true, "BOSS numbering is independent (it has 3 already)");
  await del(alice, `/sprints/${(await sprints("boss")).find((s) => s.number === 4).id}`);
});
await test("sprint validation: name, dates, company", async () => {
  eq((await post(alice, "/sprints", { companyId: co, name: "  " })).status, 400);
  const r = await post(alice, "/sprints", { companyId: co, startDate: "2026-10-10", endDate: "2026-10-09" }); eq(r.status, 400); assert(/before it starts/.test(r.json.error));
  eq((await post(alice, "/sprints", { companyId: co, startDate: "2026-02-31" })).status, 400); eq((await post(alice, "/sprints", { companyId: co, startDate: "2026-13-01" })).status, 400, "an impossible date is a 400, never a 500");
  eq((await post(alice, "/sprints", { companyId: "nope" })).status, 400);
});
await test("plan work into the sprint; a task can't go into another company's sprint", async () => {
  const t = (await post(alice, "/tasks", { title: "plan me", companyId: co, sprintId: s2.id })).json; eq(t.sprintId, s2.id);
  const other = (await sprints("ll"))[0]; const r = await patch(alice, `/tasks/${t.id}`, { sprintId: other.id }); eq(r.status, 400); assert(/different company/.test(r.json.error));
  eq((await patch(alice, `/tasks/${t.id}`, { sprintId: null })).json.sprintId, null); eq((await patch(alice, `/tasks/${t.id}`, { sprintId: s2.id })).json.sprintId, s2.id);
});
await test("only ONE active sprint per company: starting a second is refused with a clear reason", async () => {
  const r = await post(alice, `/sprints/${s2.id}/start`); eq(r.status, 409); assert(/still active/.test(r.json.error), r.json.error);
});
await test("another company can run its own sprint at the same time", async () => {
  const llPlanned = (await sprints("ll")).find((s) => s.status === "planned"); eq((await post(alice, `/sprints/${llPlanned.id}/start`)).status, 409, "LL already has its own active sprint");
  const c = (await api(alice, "/companies")).json; assert(c.filter((x) => x.activeSprint).length === 3);
});
await test("complete the active sprint: finished work stays, unfinished moves to the chosen planned sprint", async () => {
  const active = (await sprints(co)).find((s) => s.status === "active"); const before = (await tasks(co)).filter((t) => t.sprintId === active.id);
  const notDone = before.filter((t) => t.status !== "done"), done = before.filter((t) => t.status === "done"); assert(notDone.length && done.length, "fixture has both");
  eq((await post(alice, `/sprints/${active.id}/complete`, { moveTo: "bogus" })).status, 400, "bad destination");
  const r = await post(alice, `/sprints/${active.id}/complete`, { moveTo: s2.id }); eq(r.status, 200); eq(r.json.movedTasks, notDone.length);
  const after = await tasks(co);
  for (const t of done) eq(after.find((x) => x.id === t.id).sprintId, active.id, "finished work is history");
  for (const t of notDone) eq(after.find((x) => x.id === t.id).sprintId, s2.id, "unfinished work moved on");
  const s = (await sprints(co)).find((x) => x.id === active.id); eq([s.status, s.summary.done, s.summary.moved], ["completed", done.length, notDone.length]); assert(s.completedAt);
  eq((await post(alice, `/sprints/${active.id}/complete`, {})).status, 409, "can't complete twice");
  eq((await patch(alice, `/sprints/${active.id}`, { name: "x" })).status, 409, "completed sprints are a record");
  eq((await del(alice, `/sprints/${active.id}`)).status, 409);
  const closed = (await post(alice, "/tasks", { title: "into the past", companyId: co, sprintId: active.id })); eq(closed.status, 400); assert(/completed/.test(closed.json.error));
});
await test("start the next sprint (adjusting its dates and goal in the same step); the board follows", async () => {
  const r = await post(alice, `/sprints/${s2.id}/start`, { name: "Q4 push", goal: "Close the quarter", startDate: day(0), endDate: day(9) }); eq(r.status, 200);
  eq([r.json.status, r.json.name, r.json.goal, r.json.endDate], ["active", "Q4 push", "Close the quarter", day(9)]);
  eq((await api(alice, "/companies")).json.find((x) => x.id === co).activeSprint.name, "Q4 push");
  eq((await post(alice, `/sprints/${s2.id}/start`)).status, 409, "already started");
});
await test("complete with no destination → unfinished work returns to unscheduled", async () => {
  const r = await post(alice, `/sprints/${s2.id}/complete`, {}); eq(r.status, 200);
  const left = (await tasks(co)).filter((t) => t.sprintId === s2.id); assert(left.every((t) => t.status === "done"), "only finished work remains");
  assert((await tasks(co)).some((t) => t.sprintId === null && t.status !== "done"), "unfinished work is unscheduled now");
});
await test("delete a planned sprint: its work goes back to unscheduled; active/completed ones can't be deleted", async () => {
  s3 = (await post(alice, "/sprints", { companyId: co })).json; const t = (await post(alice, "/tasks", { title: "orphan", companyId: co, sprintId: s3.id })).json;
  const r = await del(alice, `/sprints/${s3.id}`); eq(r.status, 200); eq(r.json.movedTasks, 1);
  eq((await tasks(co)).find((x) => x.id === t.id).sprintId, null); eq((await del(alice, `/sprints/${s3.id}`)).status, 404); await del(alice, `/tasks/${t.id}`);
});
await test("edit a planned sprint", async () => {
  const s = (await post(alice, "/sprints", { companyId: co })).json; const r = await patch(alice, `/sprints/${s.id}`, { name: "Renamed", goal: "G", endDate: day(30) });
  eq([r.json.name, r.json.goal, r.json.endDate], ["Renamed", "G", day(30)]); eq((await patch(alice, `/sprints/${s.id}`, { endDate: "2001-01-01" })).status, 400, "end before start"); await del(alice, `/sprints/${s.id}`);
});
await test("moving a task to another company clears its sprint and re-keys it", async () => {
  const t = (await post(alice, "/tasks", { title: "relocate", companyId: "boss" })).json; assert(t.key.startsWith("BOSS-"));
  const m = (await patch(alice, `/tasks/${t.id}`, { companyId: "ll" })).json; eq([m.companyId, m.sprintId], ["ll", null]); assert(m.key.startsWith("LL-")); assert(m.rev > t.rev);
  const withSprint = (await patch(alice, `/tasks/${t.id}`, { companyId: "rli", sprintId: (await sprints("rli")).find((s) => s.status === "active")?.id ?? null })).json; eq(withSprint.companyId, "rli"); await del(alice, `/tasks/${t.id}`);
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
section("4. Real-time board updates");
const sa = await openStream(alice), sb = await openStream(bob);
const live = (s, from, pred) => s.waitFor((e) => pred(e), { from, ms: 4000 });
let lt;
await test("creating a task tells everyone, naming who did it — and the sender's tab can tell it's their own echo", async () => {
  const from = sb.mark(), fromA = sa.mark(); lt = (await post(alice, "/tasks", { title: "live one", companyId: "boss" })).json;
  const e = await live(sb, from, (x) => x.type === "task" && x.taskIds.includes(lt.id));
  eq([e.change, e.companyId, e.by, e.byId], ["created", "boss", "Alice", "m_alice"]);
  assert(await live(sa, fromA, (x) => x.type === "task" && x.taskIds.includes(lt.id) && x.byId === "m_alice"), "Alice's own tab gets it with byId=her");
});
await test("moving a card (status change) reaches the other board without a refresh, and the task has a newer revision", async () => {
  const from = sb.mark(); const m = (await patch(alice, `/tasks/${lt.id}`, { status: "review" })).json;
  assert(await live(sb, from, (x) => x.type === "task" && x.change === "updated" && x.taskIds.includes(lt.id)), "no live event");
  const fresh = (await api(bob, `/tasks?ids=${lt.id}`)).json[0]; eq([fresh.status, fresh.rev > lt.rev, fresh.updatedBy], ["review", true, "m_alice"]); eq(fresh.rev, m.rev);
});
await test("editing details and re-planning into a sprint are live too", async () => {
  const from = sb.mark(); await patch(alice, `/tasks/${lt.id}`, { title: "live one (edited)", priority: "high" }); assert(await live(sb, from, (x) => x.type === "task" && x.taskIds.includes(lt.id)));
  const from2 = sb.mark(); await patch(alice, `/tasks/${lt.id}`, { sprintId: null }); assert(await live(sb, from2, (x) => x.type === "task" && x.taskIds.includes(lt.id)));
});
await test("deleting a task is live, and the task is gone", async () => {
  const from = sb.mark(); await del(alice, `/tasks/${lt.id}`); const e = await live(sb, from, (x) => x.type === "task" && x.change === "deleted");
  eq([e.taskIds, e.companyId], [[lt.id], "boss"]); eq((await api(bob, `/tasks?ids=${lt.id}`)).json, []);
});
await test("a task moved between companies notifies BOTH companies' boards", async () => {
  const t = (await post(alice, "/tasks", { title: "two boards", companyId: "boss" })).json; const from = sb.mark();
  await patch(alice, `/tasks/${t.id}`, { companyId: "ll" });
  const seen = new Set(); const end = Date.now() + 4000; while (Date.now() < end && seen.size < 2) { for (const e of sb.events.slice(from)) if (e.type === "task" && e.taskIds.includes(t.id)) seen.add(e.companyId); await new Promise((r) => setTimeout(r, 30)); }
  eq([...seen].sort(), ["boss", "ll"]); await del(alice, `/tasks/${t.id}`);
});
await test("sprint lifecycle events: created → started → completed, plus the tasks that moved", async () => {
  const from = sb.mark(); const s = (await post(alice, "/sprints", { companyId: "ll", name: "Live sprint" })).json;
  assert(await live(sb, from, (x) => x.type === "sprint" && x.change === "created" && x.sprintId === s.id), "created");
  await patch(alice, `/sprints/${s.id}`, { goal: "g" }); assert(await live(sb, from, (x) => x.type === "sprint" && x.change === "updated" && x.sprintId === s.id), "updated");
  const llActive = (await sprints("ll")).find((x) => x.status === "active"); const f2 = sb.mark(); await post(alice, `/sprints/${llActive.id}/complete`, { moveTo: s.id });
  const done = await live(sb, f2, (x) => x.type === "sprint" && x.change === "completed"); eq([done.sprintId, done.companyId, done.by], [llActive.id, "ll", "Alice"]);
  assert(await live(sb, f2, (x) => x.type === "task" && x.change === "updated" && x.companyId === "ll"), "the unfinished tasks that moved are announced too");
  const f3 = sb.mark(); await post(alice, `/sprints/${s.id}/start`); assert(await live(sb, f3, (x) => x.type === "sprint" && x.change === "started" && x.sprintId === s.id), "started");
  const f4 = sb.mark(); await post(alice, `/sprints/${s.id}/complete`, {}); await new Promise((r) => setTimeout(r, 300));
  const p = (await post(alice, "/sprints", { companyId: "ll" })).json; const f5 = sb.mark(); await del(alice, `/sprints/${p.id}`); assert(await live(sb, f5, (x) => x.type === "sprint" && x.change === "deleted" && x.sprintId === p.id), "deleted");
});
await test("a rejected change publishes nothing", async () => {
  const t = (await post(alice, "/tasks", { title: "quiet", companyId: "boss" })).json; await new Promise((r) => setTimeout(r, 300)); const from = sb.mark();
  eq((await patch(alice, `/tasks/${t.id}`, { status: "backlog" })).status, 400); eq((await post(alice, "/sprints", { companyId: "boss", name: "" })).status, 400);
  assert(await sb.stays((x) => x.type === "task" || x.type === "sprint", { from }), "events leaked from a failed request"); await del(alice, `/tasks/${t.id}`);
});
await test("nothing is delivered to someone who isn't signed in", async () => { eq((await fetch(BASE + "/api/channels/events")).status, 401); eq((await fetch(BASE + "/api/sprints")).status, 401); eq((await fetch(BASE + "/api/companies")).status, 401); });
await test("two people editing at once: no lost update, revisions strictly increase", async () => {
  const t = (await post(alice, "/tasks", { title: "race", companyId: "boss", progress: 0 })).json;
  await Promise.all([...Array.from({ length: 10 }, (_, i) => patch(i % 2 ? alice : bob, `/tasks/${t.id}`, { progress: i * 10 }))]);
  const final = (await api(alice, `/tasks?ids=${t.id}`)).json[0]; eq(final.rev, 11, "all ten writes were applied in order"); await del(alice, `/tasks/${t.id}`);
});
sa.close(); sb.close();

// ───────────────────────────────────────────────────────────────────────────────────────────────
section("5. Everything else that touches tasks still works");
await test("dashboard metrics follow the active sprints (fresh install: 12 / 8 / 15)", async () => {
  const m = Object.fromEntries((await api(alice, "/metrics")).json.map((x) => [x.key, x.value])); assert(m.todo >= 0 && m["in-progress"] >= 0 && m.done >= 0, JSON.stringify(m));
  const t = (await post(alice, "/tasks", { title: "metric", companyId: "boss" })).json; const m2 = Object.fromEntries((await api(alice, "/metrics")).json.map((x) => [x.key, x.value])); eq(m2.todo, m.todo + 1);
  await patch(alice, `/tasks/${t.id}`, { status: "done" }); const m3 = Object.fromEntries((await api(alice, "/metrics")).json.map((x) => [x.key, x.value])); eq([m3.todo, m3.done], [m.todo, m.done + 1]); await del(alice, `/tasks/${t.id}`);
});
await test("search finds tasks and links to their board (or the sprints screen if they aren't in the active sprint)", async () => {
  const r = (await api(alice, "/search?q=route")).json; const hit = r.find((x) => x.title.includes("Route optimisation")); assert(hit, JSON.stringify(r).slice(0, 200)); assert(/^\/actions\/ll\/(board|sprints)\?task=t-60$/.test(hit.href), hit.href);
  const un = (await api(alice, "/search?q=insurance")).json.find((x) => x.title.includes("insurance")); assert(un.href.startsWith("/actions/rli/sprints?task="), un.href);
});
await test("removing a member unassigns their tasks and bumps the revision (so boards update)", async () => {
  const m = (await post(alice, "/members", { name: "Temp Person", role: "Temp", department: "Ops" })).json; const t = (await post(alice, "/tasks", { title: "temp's", companyId: "boss", assigneeId: m.id })).json;
  eq((await del(alice, `/members/${m.id}`)).status, 200); const after = (await api(alice, `/tasks?ids=${t.id}`)).json[0]; eq(after.assigneeId, null); assert(after.rev > t.rev); await del(alice, `/tasks/${t.id}`);
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
section("6. Upgrade: a board saved BEFORE sprints and companies existed");
await test("old tasks keep working: Backlog → To Do, assigned to BOSS and unscheduled until migrated", async () => {
  const st = (await sql.query("select data from teambase_state where id=1")).rows[0].data;
  st.tasks.push({ id: "t-old-1", key: "TB-1", title: "Legacy backlog item", description: "", status: "backlog", priority: "low", dueDate: day(3), progress: 0, assigneeId: null },
                { id: "t-old-2", key: "TB-2", title: "Legacy review item", description: "", status: "review", priority: "high", dueDate: day(1), progress: 50, assigneeId: null });
  await sql.query("update teambase_state set data=$1::jsonb, version=version+1 where id=1", [JSON.stringify(st)]);
  const t = (await api(alice, "/tasks?ids=t-old-1,t-old-2")).json;
  eq(t.map((x) => [x.status, x.companyId, x.sprintId]), [["todo", "boss", null], ["review", "boss", null]], "Backlog is gone even for data saved with it");
  eq((await patch(alice, "/tasks/t-old-1", { status: "in-progress" })).status, 200, "and they can be edited normally");
});

sql.end(); summary();
