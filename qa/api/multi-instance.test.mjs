/**
 * Two server instances sharing one PostgreSQL database (what you get with replicas or during a rolling deploy).
 *   A=http://localhost:3201 B=http://localhost:3202 PID_B=/tmp/pid3202 DATABASE_URL=… node qa/api/multi-instance.test.mjs
 */
import { api, assert, eq, login, openStream, post, section, sleep, summary, test } from "../support/client.mjs";
import fs from "node:fs";

const A = process.env.A || "http://localhost:3201", B = process.env.B || "http://localhost:3202";
const aliceA = await login(A, "alice@test.local"), bobB = await login(B, "bob@test.local"), carolB = await login(B, "carol@test.local"), aliceB = await login(B, "alice@test.local");
const bobA = await login(A, "bob@test.local");

section("Cross-instance realtime (Alice talks to server A, Bob to server B)");
let sbB, saA, dm;
await test("presence: a late-joining instance learns who is already online elsewhere", async () => {
  sbB = await openStream(bobB);                  // Bob connects to B first
  saA = await openStream(aliceA);                // Alice then connects to A
  assert(saA.events[0].online.includes("m_bob"), "A should know Bob is online through the database");
  assert((await api(aliceA, "/channels/c-announcements")).json.members.find((m) => m.id === "m_bob").online, "A's members API must show Bob online");
});
await test("presence: Bob hears Alice come online on the other instance (via PostgreSQL NOTIFY)", async () => {
  const hit = sbB.events.find((e) => e.type === "presence" && e.memberId === "m_alice" && e.online);
  assert(hit || (await sbB.waitFor((e) => e.type === "presence" && e.memberId === "m_alice" && e.online, { ms: 4000 })), "no presence event across instances");
});
await test("typing crosses instances, and stays private to the DM", async () => {
  dm = (await post(aliceA, "/channels/dm", { memberId: "m_bob" })).json.id;
  const sCarol = await openStream(carolB); const from = sbB.mark(), fromC = sCarol.mark();
  await post(aliceA, `/channels/${dm}/typing`, { typing: true });
  const e = await sbB.waitFor((x) => x.type === "typing" && x.typing && x.name === "Alice", { from });
  assert(e, "Bob (instance B) never saw Alice (instance A) typing");
  assert(await sCarol.stays((x) => x.type === "typing", { from: fromC }), "Carol saw a private DM's typing");
  const stop = sbB.mark(); await post(aliceA, `/channels/${dm}/typing`, { typing: false });
  assert(await sbB.waitFor((x) => x.type === "typing" && !x.typing, { from: stop }), "stop did not cross instances");
  sCarol.close();
});
await test("a message sent on A appears live on B, and is already 'delivered' (B's user is online)", async () => {
  const from = sbB.mark();
  const r = await post(aliceA, `/channels/${dm}/messages`, { body: "across instances" });
  assert(await sbB.waitFor((x) => x.type === "message" && x.change === "created" && x.messageIds.includes(r.json.id), { from }), "no live event on B");
  eq(r.json.status.state, "delivered", "A must see Bob as reachable even though he's connected to B");
  eq((await api(bobB, `/channels/${dm}/messages?ids=${r.json.id}`)).json.messages[0].body, "across instances");
});
await test("'seen' on B updates Alice's status live on A", async () => {
  const from = saA.mark();
  await post(bobB, `/channels/${dm}/seen`);
  assert(await saA.waitFor((x) => x.type === "message" && x.change === "status", { from }), "A never heard about the status change");
  const last = (await api(aliceA, `/channels/${dm}`)).json.messages.at(-1); eq(last.status.state, "seen");
});
await test("a file uploaded through A is downloadable through B (bytes live in the shared database)", async () => {
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const f = new FormData(); f.append("file", new File([PNG], "x.png", { type: "image/png" }));
  const up = (await api(aliceA, "/attachments", { method: "POST", body: f })).json.attachments[0];
  await post(aliceA, `/channels/${dm}/messages`, { body: "", attachments: [up] });
  const got = await api(bobB, `/attachments/${up.id}`); assert(Buffer.from(await got.res.arrayBuffer()).equals(PNG), "bytes differ across instances");
});
await test("concurrent writers on both instances lose nothing (row-locked state)", async () => {
  const before = (await api(aliceA, `/channels/${dm}`)).json.messages.length;
  await Promise.all(Array.from({ length: 40 }, (_, i) => post(i % 2 ? aliceA : bobA, `/channels/${dm}/messages`, { body: `burst ${i}` })));
  await Promise.all(Array.from({ length: 20 }, (_, i) => post(i % 2 ? aliceB : bobB, `/channels/${dm}/messages`, { body: `burst-b ${i}` })));
  eq((await api(aliceA, `/channels/${dm}`)).json.messages.length - before, 60, "every message from both servers is stored");
});
await test("board changes cross instances: a card moved on A, a sprint started on B, both reach the other server's browsers", async () => {
  const patch = (u, p, b) => api(u, p, { method: "PATCH", body: JSON.stringify(b) });
  const from = sbB.mark(); await patch(aliceA, "/tasks/t-44", { status: "review" });
  const t = await sbB.waitFor((x) => x.type === "task" && x.taskIds.includes("t-44") && x.change === "updated", { from }); assert(t, "B never heard about a task moved on A"); eq([t.companyId, t.by], ["boss", "Alice"]);
  assert((await api(bobB, "/tasks?ids=t-44")).json[0].status === "review", "and B reads the new state from the shared database");
  const s = (await post(bobB, "/sprints", { companyId: "ll", name: "Cross-server" })).json; const fromA = saA.mark();
  await patch(bobB, `/sprints/${s.id}`, { goal: "g" }); assert(await saA.waitFor((x) => x.type === "sprint" && x.sprintId === s.id && x.change === "updated", { from: fromA }), "A never heard about a sprint edited on B");
  await patch(aliceA, "/tasks/t-44", { status: "todo" });
});
await test("closing the last connection on B makes Bob offline on A (after the reload grace)", async () => {
  const from = saA.mark(); sbB.close();
  assert(await saA.waitFor((x) => x.type === "presence" && x.memberId === "m_bob" && !x.online, { from, ms: 10000 }), "A never saw Bob go offline");
});

section("A server crash must not leave people 'online' forever");
await test("hard-killing instance B (no clean disconnect) → its users go offline everywhere once their heartbeat goes stale", async () => {
  const sc = await openStream(carolB);
  assert(await saA.waitFor((x) => x.type === "presence" && x.memberId === "m_carol" && x.online, { ms: 5000 }) || (await api(aliceA, "/channels/c-announcements")).json.members.find((m) => m.id === "m_carol").online, "Carol should be online first");
  const pid = Number(fs.readFileSync(process.env.PID_B || "/tmp/pid3202", "utf8")); const from = saA.mark();
  process.kill(pid, "SIGKILL"); sc.close();
  const gone = await saA.waitFor((x) => x.type === "presence" && x.memberId === "m_carol" && !x.online, { from, ms: 130_000 });
  assert(gone, "Carol still shows online 130s after her server died");
  assert(!(await api(aliceA, "/channels/c-announcements")).json.members.find((m) => m.id === "m_carol").online);
});
await test("the surviving instance keeps working", async () => {
  eq((await post(aliceA, `/channels/${dm}/messages`, { body: "still here" })).status, 201);
});
saA.close(); summary();
