/**
 * Startup upgrade of a board saved BEFORE companies and sprints existed. It starts and stops real servers:
 *   DATABASE_URL=… SESSION_SECRET=… node qa/api/upgrade.test.mjs     (uses port 3205; wipes the database's Teambase tables)
 */
import { spawn } from "node:child_process";
import pg from "pg";
import { api, assert, eq, login, section, summary, test } from "../support/client.mjs";

const PORT = 3205, BASE = `http://localhost:${PORT}`;
const sql = new pg.Client({ connectionString: process.env.DATABASE_URL }); await sql.connect();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let server;
async function start() {
  server = spawn("node", ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], { env: { ...process.env, APP_URL: BASE }, stdio: "ignore" });
  for (let i = 0; i < 60; i++) { try { if ((await (await fetch(BASE + "/api/health")).json()).ok) return; } catch {} await sleep(500); }
  throw new Error("server did not start");
}
async function stop() { server?.kill("SIGKILL"); await sleep(800); }
const state = async () => (await sql.query("select data, version from teambase_state where id=1")).rows[0];

await sql.query("DROP TABLE IF EXISTS teambase_state, teambase_presence, teambase_attachments");
section("Boards saved by the previous version");
await start(); await stop();                                     // first start creates the schema + modern seed data
await new Promise((r, j) => spawn("node", ["qa/support/seed-accounts.mjs"], { env: process.env, stdio: "ignore" }).on("exit", (c) => (c === 0 ? r() : j(new Error("seed failed")))));

// Rewrite the saved data into exactly what the previous version stored: five tasks, no companies, no sprints, a Backlog status.
const { data } = await state();
const old = (id, key, title, status, priority, progress, assignee) => ({ id, key, title, description: "", status, priority, dueDate: "2026-10-12", progress, assigneeId: assignee });
data.tasks = [old("t-44", "TB-44", "Database Index Tuning", "backlog", "medium", 0, "m-stad"), old("t-45", "TB-45", "Docker Compose Setup", "backlog", "low", 0, "m-joseph"),
  old("t-46", "TB-46", "API Payload Validation", "todo", "high", 15, "m-joseph"), old("t-48", "TB-48", "Actions Panel Refactor", "in-progress", "high", 65, "m-stad"), old("t-47", "TB-47", "Budget Service Integration Audit", "review", "medium", 90, "m-stad")];
delete data.sprints; data.nextTicket = 49;
await sql.query("update teambase_state set data=$1::jsonb, version=version+1 where id=1", [JSON.stringify(data)]);

await test("before the upgrade the saved data really is the old shape (backlog, no sprints, no company)", async () => {
  const { data: d } = await state(); assert(!("sprints" in d) && d.tasks.some((t) => t.status === "backlog") && d.tasks.every((t) => !("companyId" in t)));
});
await start();
let alice; 
await test("starting the new version upgrades it ONCE and saves the result: BOSS gets an active 'Sprint 1' holding the whole old board", async () => {
  const { data: d } = await state(); eq(d.sprints.length, 1); const s = d.sprints[0];
  eq([s.id, s.companyId, s.name, s.status], ["sp_legacy_boss", "boss", "Sprint 1", "active"]); assert(s.startedAt && s.startDate <= s.endDate);
  eq(d.tasks.map((t) => [t.id, t.companyId, t.sprintId]), ["t-44", "t-45", "t-46", "t-48", "t-47"].map((id) => [id, "boss", "sp_legacy_boss"]));
});
await test("Backlog is gone from the saved data: those two tasks are now To Do", async () => {
  const { data: d } = await state(); eq(d.tasks.map((t) => t.status), ["todo", "todo", "todo", "in-progress", "review"]);
});
await test("the board works straight away: the old tasks are on BOSS's board, RLI and LL are empty, and everything can be edited", async () => {
  alice = await login(BASE, "alice@test.local"); const c = (await api(alice, "/companies")).json;
  eq([c[0].activeSprint.name, c[0].open, c[0].done, c[1].activeSprint, c[2].activeSprint], ["Sprint 1", 5, 0, null, null]);
  const t = (await api(alice, "/tasks?company=boss&sprint=sp_legacy_boss")).json; eq(t.length, 5);
  const moved = await api(alice, "/tasks/t-44", { method: "PATCH", body: JSON.stringify({ status: "done" }) }); eq([moved.status, moved.json.status, moved.json.progress], [200, "done", 100]);
  eq((await api(alice, "/tasks/t-45", { method: "PATCH", body: JSON.stringify({ status: "backlog" }) })).status, 400);
});
await test("a company that never had sprints can start from nothing: create → plan → start", async () => {
  const s = (await api(alice, "/sprints", { method: "POST", body: JSON.stringify({ companyId: "ll" }) })).json; eq(s.number, 1);
  const t = (await api(alice, "/tasks", { method: "POST", body: JSON.stringify({ title: "first LL task", companyId: "ll", sprintId: s.id }) })).json; eq(t.sprintId, s.id);
  eq((await api(alice, `/sprints/${s.id}/start`, { method: "POST", body: "{}" })).json.status, "active");
  eq((await api(alice, "/companies")).json[2].open, 1);
});
const before = await state();
await stop(); await start();
await test("restarting again changes nothing (the upgrade is not repeated)", async () => {
  const after = await state(); eq(after.data.sprints.length, before.data.sprints.length); eq(after.data.tasks.length, before.data.tasks.length); eq(after.version, before.version, "no write on a normal start");
});
await stop(); await sql.end(); summary();
