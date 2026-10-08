/**
 * Channel & messaging backend tests — real HTTP, real Server-Sent Events, real PostgreSQL.
 *   DATABASE_URL=… node qa/support/seed-accounts.mjs && BASE=http://localhost:3201 node qa/api/channels.test.mjs
 */
import { PASSWORD, api, assert, eq, login, openStream, post, section, sleep, summary, test } from "../support/client.mjs";
import pg from "pg";

const BASE = process.env.BASE || "http://localhost:3201";
const sql = new pg.Client({ connectionString: process.env.DATABASE_URL }); await sql.connect();
const [alice, bob, carol, gina, dave, erin] = await Promise.all(["alice", "bob", "carol", "gina"].map((n) => login(BASE, `${n}@test.local`)).concat([null, null]));
const names = (list) => list.map((m) => m.name).sort();
const REGISTERED = ["Alice Tester", "Bob Tester", "Carol Tester", "Gina Tester"];

// ───────────────────────────────────────────────────────────────────────────────────────────────
section("1. Online status — registered accounts only");

await test("members of a channel are exactly the registered accounts (no demo people, no member-without-account, no unverified)", async () => {
  const d = await api(alice, "/channels/c-announcements");
  eq(names(d.json.members), REGISTERED);
});
await test("everyone is offline when nobody is connected", async () => {
  const d = await api(alice, "/channels/c-announcements");
  assert(d.json.members.every((m) => m.online === false), "someone shows online with no connection");
});
await test("unregistered people are not in the directory either", async () => {
  eq(names((await api(alice, "/channels/directory")).json), ["Bob Tester", "Carol Tester", "Gina Tester"]);
});
await test("the members API flags who is registered", async () => {
  const m = (await api(alice, "/members")).json;
  const reg = Object.fromEntries(m.map((x) => [x.id, x.registered]));
  eq([reg.m_alice, reg.m_bob, reg.m_dave, reg.m_erin, reg["m-ray"], reg["m-stad"]], [true, true, false, false, false, false]);
});
await test("people who cannot sign in cannot open the live connection", async () => {
  const r = await fetch(BASE + "/api/channels/events");
  assert(r.status === 401, "anonymous event stream must be refused");
});

let sa, sb, sc;
await test("connecting makes you online: others get a live 'online' event and you appear online in members", async () => {
  sb = await openStream(bob);
  const from = sb.mark();
  sa = await openStream(alice);
  assert(await sb.waitFor((e) => e.type === "presence" && e.memberId === "m_alice" && e.online, { from }), "Bob never heard Alice come online");
  const ready = sa.events[0]; eq(ready.type, "ready", "ready must come first"); assert(ready.online.includes("m_bob") && ready.online.includes("m_alice"), "ready snapshot should list who is online");
  const d = await api(carol, "/channels/c-announcements");
  eq(d.json.members.filter((m) => m.online).map((m) => m.name).sort(), ["Alice Tester", "Bob Tester"]);
});
await test("a second tab does not flicker presence; closing one tab keeps you online", async () => {
  const from = sb.mark();
  const tab2 = await openStream(alice);
  assert(await sb.stays((e) => e.type === "presence" && e.memberId === "m_alice", { from }), "second tab caused a presence event");
  tab2.close(); await sleep(6000);
  assert((await api(carol, "/channels/c-announcements")).json.members.find((m) => m.id === "m_alice").online, "Alice went offline while one tab was still open");
});
await test("disconnecting makes you offline for everyone (after the short reload grace)", async () => {
  sc = await openStream(carol);
  const from = sb.mark();
  sc.close();
  assert(await sb.waitFor((e) => e.type === "presence" && e.memberId === "m_carol" && !e.online, { from, ms: 9000 }), "Bob never heard Carol go offline");
  assert(!(await api(bob, "/channels/c-announcements")).json.members.find((m) => m.id === "m_carol").online);
});
await test("a quick reconnect (page reload) does not flash offline", async () => {
  const r1 = await openStream(gina); const from = sb.mark(); r1.close(); await sleep(800);
  const r2 = await openStream(gina);
  assert(await sb.stays((e) => e.type === "presence" && e.memberId === "m_gina" && !e.online, { from, ms: 5500 }), "reload flashed offline");
  r2.close();
});
await test("a DM shows the peer's presence only when the peer is registered", async () => {
  const dm = (await post(alice, "/channels/dm", { memberId: "m_bob" })).json;
  eq([dm.peer.registered, dm.peer.online, dm.name], [true, true, "Bob Tester"]);
  const list = (await api(alice, "/channels")).json.conversations;
  const sarah = list.find((c) => c.name === "Sarah Chen");
  assert(sarah, "legacy placeholder DM should still be listed");
  eq([sarah.peer.registered, sarah.peer.online], [false, undefined], "no presence for a person who isn't registered");
});
await test("you cannot start a conversation with someone who isn't registered", async () => {
  for (const id of ["m_dave", "m_erin", "m-ray", "m-stad"]) {
    const r = await post(alice, "/channels/dm", { memberId: id });
    assert(r.status === 400 && /hasn't registered/.test(r.json.error), `${id} → ${r.status} ${r.json?.error}`);
  }
  assert((await post(alice, "/channels/dm", { memberId: "m_alice" })).status === 400, "DM with yourself");
  assert((await post(alice, "/channels/dm", { memberId: "nope" })).status === 404);
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
section("2. Typing indicator");
let dmAB;
await test("typing reaches the other person in a DM (with a first name), live", async () => {
  dmAB = (await post(alice, "/channels/dm", { memberId: "m_bob" })).json.id;
  const from = sb.mark();
  assert((await post(alice, `/channels/${dmAB}/typing`, { typing: true })).status === 200);
  const e = await sb.waitFor((x) => x.type === "typing" && x.conversationId === dmAB && x.typing, { from });
  assert(e, "Bob never saw Alice typing"); eq([e.memberId, e.name], ["m_alice", "Alice"]);
});
await test("typing in a private DM is NOT delivered to people outside it", async () => {
  sc = await openStream(carol); const from = sc.mark();
  await post(alice, `/channels/${dmAB}/typing`, { typing: true });
  assert(await sc.stays((x) => x.type === "typing", { from }), "Carol received typing from a DM she is not in");
});
await test("typing in a channel reaches everyone connected", async () => {
  const from = sc.mark();
  await post(bob, `/channels/c-announcements/typing`, { typing: true });
  assert(await sc.waitFor((x) => x.type === "typing" && x.conversationId === "c-announcements" && x.name === "Bob", { from }), "Carol didn't see Bob typing in the channel");
});
await test("explicit stop: the indicator is cleared", async () => {
  const from = sb.mark();
  await post(alice, `/channels/${dmAB}/typing`, { typing: false });
  assert(await sb.waitFor((x) => x.type === "typing" && x.memberId === "m_alice" && !x.typing, { from }), "no stop event");
});
await test("if the typist's browser disappears the indicator still expires on the server", async () => {
  const from = sb.mark();
  await post(alice, `/channels/${dmAB}/typing`, { typing: true });
  assert(await sb.waitFor((x) => x.type === "typing" && x.typing, { from }));
  const stop = await sb.waitFor((x) => x.type === "typing" && !x.typing && x.memberId === "m_alice", { from, ms: 9000 });
  assert(stop, "indicator never expired");
});
await test("sending the message clears typing immediately", async () => {
  await post(alice, `/channels/${dmAB}/typing`, { typing: true });
  const from = sb.mark();
  await post(alice, `/channels/${dmAB}/messages`, { body: "clearing typing" });
  const clear = await sb.waitFor((x) => x.type === "typing" && !x.typing && x.memberId === "m_alice", { from, ms: 2000 });
  const made = await sb.waitFor((x) => x.type === "message" && x.change === "created", { from, ms: 2000 });
  assert(clear && made, "typing not cleared / message event missing");
});
await test("closing the connection clears typing", async () => {
  const tmp = await openStream(gina);
  await post(gina, `/channels/c-announcements/typing`, { typing: true });
  const from = sb.mark(); tmp.close();
  assert(await sb.waitFor((x) => x.type === "typing" && x.memberId === "m_gina" && !x.typing, { from }), "typing stuck after disconnect");
});
await test("people outside a DM cannot type into it", async () => {
  assert((await post(carol, `/channels/${dmAB}/typing`, { typing: true })).status === 404);
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
section("3. Message status — Sent / Delivered / Seen with times");
await test("Bob is online → delivered at the moment of sending", async () => {
  const r = await post(alice, `/channels/${dmAB}/messages`, { body: "status: bob online" });
  const s = r.json.status;
  eq([s.state, s.total, s.deliveredCount, s.seenCount], ["delivered", 1, 1, 0]);
  assert(s.deliveredAt && !s.seenAt && s.sentAt <= s.deliveredAt, "timestamps");
});
await test("Bob marks it seen → Alice is told live; state=seen with a time ≥ delivered", async () => {
  const from = sa.mark();
  assert((await post(bob, `/channels/${dmAB}/seen`)).status === 200);
  assert(await sa.waitFor((e) => e.type === "message" && e.change === "status" && e.conversationId === dmAB, { from }), "Alice not notified");
  const m = (await api(alice, `/channels/${dmAB}/messages?ids=` + (await api(alice, `/channels/${dmAB}`)).json.messages.at(-1).id)).json.messages[0];
  eq(m.status.state, "seen"); assert(m.status.seenAt >= m.status.deliveredAt && m.status.deliveredAt >= m.status.sentAt, "time order");
});
await test("only the author gets the status; receipts are never exposed", async () => {
  const mine = await api(alice, `/channels/${dmAB}`); const theirs = await api(bob, `/channels/${dmAB}`);
  assert(mine.json.messages.at(-1).status, "author should see status");
  assert(theirs.json.messages.every((m) => !m.status), "recipient must not get status");
  assert(!JSON.stringify([mine.json, theirs.json]).includes("receipts"), "raw receipts leaked");
});
let offlineMsg;
await test("recipient offline → stays 'sent'", async () => {
  sb.close(); await sleep(300);
  const r = await post(alice, `/channels/${dmAB}/messages`, { body: "status: bob offline" });
  eq(r.json.status.state, "sent"); offlineMsg = r.json.id;
  assert(!r.json.status.deliveredAt);
});
await test("…and becomes 'delivered' the moment Bob's app connects (author hears about it live)", async () => {
  const from = sa.mark();
  sb = await openStream(bob);
  assert(await sa.waitFor((e) => e.type === "message" && e.change === "status" && e.messageIds.includes(offlineMsg), { from }), "no live delivery update");
  const s = (await api(alice, `/channels/${dmAB}/messages?ids=${offlineMsg}`)).json.messages[0].status;
  eq([s.state, s.deliveredCount], ["delivered", 1]); assert(s.deliveredAt);
});
await test("unread is per person: Bob has 1 unread, Alice 0; seen clears Bob's only", async () => {
  const bobList = () => api(bob, "/channels").then((r) => r.json.conversations.find((c) => c.id === dmAB));
  eq((await bobList()).unread, 1, "only the message sent while he was offline is unseen");
  eq((await api(alice, "/channels")).json.conversations.find((c) => c.id === dmAB).unread, 0);
  await post(bob, `/channels/${dmAB}/seen`);
  eq((await bobList()).unread, 0);
  eq((await api(bob, "/channels")).json.unreadTotal, 0);
});
await test("a channel message tracks every recipient: 'seen' only when ALL have seen it", async () => {
  sc = sc ?? (await openStream(carol)); const g = await openStream(gina); // gina connects; everybody online
  const r = await post(alice, "/channels/c-announcements/messages", { body: "all hands" });
  eq([r.json.status.total, r.json.status.state], [3, "delivered"]); const id = r.json.id;
  const view = async () => (await api(alice, `/channels/c-announcements/messages?ids=${id}`)).json.messages[0].status;
  await post(bob, "/channels/c-announcements/seen"); let s = await view();
  eq([s.state, s.seenCount, s.total], ["delivered", 1, 3], "one of three seen → not 'seen' yet");
  await post(carol, "/channels/c-announcements/seen"); await post(gina, "/channels/c-announcements/seen"); s = await view();
  eq([s.state, s.seenCount], ["seen", 3]); assert(s.seenAt);
  eq(s.recipients.map((x) => x.name).sort(), ["Bob Tester", "Carol Tester", "Gina Tester"]);
  assert(s.recipients.every((x) => x.deliveredAt && x.seenAt), "each recipient has both times");
  g.close();
});
await test("a person who registers later is not asked to 'read' old messages", async () => {
  const state = (await sql.query("select data from teambase_state where id=1")).rows[0].data;
  const msgs = state.messages["c-announcements"].filter((m) => m.receipts);
  assert(msgs.every((m) => !("m_zed" in m.receipts)), "recipients are snapshotted at send time");
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
section("4. Members, selectable, private 1-on-1 conversations");
await test("one DM per pair: the same conversation whichever of them opens it; each sees the OTHER's name", async () => {
  const a = (await post(alice, "/channels/dm", { memberId: "m_bob" })).json; const b = (await post(bob, "/channels/dm", { memberId: "m_alice" })).json;
  eq(a.id, b.id); eq([a.name, b.name], ["Bob Tester", "Alice Tester"]);
  eq((await post(alice, "/channels/dm", { memberId: "m_bob" })).status, 200, "opening an existing DM is not a 'create'");
});
await test("a third person cannot read, list, write, type, react, mark seen, delete, or fetch files in someone else's DM", async () => {
  await post(alice, `/channels/${dmAB}/messages`, { body: "secret" });
  assert(!(await api(carol, "/channels")).json.conversations.some((c) => c.id === dmAB), "listed");
  for (const [m, p, b] of [["GET", `/channels/${dmAB}`], ["GET", `/channels/${dmAB}/messages?ids=x`], ["POST", `/channels/${dmAB}/messages`, { body: "hi" }], ["POST", `/channels/${dmAB}/typing`, {}], ["POST", `/channels/${dmAB}/seen`, {}], ["PATCH", `/channels/${dmAB}`, { read: true }], ["DELETE", `/channels/${dmAB}`]]) {
    const r = await api(carol, p, { method: m, body: b ? JSON.stringify(b) : undefined });
    assert(r.status === 404, `${m} ${p} → ${r.status}`);
  }
  const mid = (await api(alice, `/channels/${dmAB}`)).json.messages.at(-1).id;
  assert((await post(carol, `/channels/${dmAB}/messages/${mid}/reactions`, { emoji: "👍" })).status === 404, "reaction");
  assert((await api(alice, `/channels/${dmAB}`)).status === 200 && (await api(bob, `/channels/${dmAB}`)).status === 200, "participants keep access");
});
await test("DM members panel lists only registered participants", async () => {
  eq(names((await api(alice, `/channels/${dmAB}`)).json.members), ["Alice Tester", "Bob Tester"]);
  const sarah = (await api(alice, "/channels")).json.conversations.find((c) => c.name === "Sarah Chen");
  eq(names((await api(alice, `/channels/${sarah.id}`)).json.members), ["Alice Tester"], "placeholder DM: the unregistered peer is not listed");
});
await test("legacy DMs are migrated: participants come from who is actually in them; outsiders lose access", async () => {
  const st = (await sql.query("select data from teambase_state where id=1")).rows[0].data;
  st.conversations.push({ id: "dm-legacy-1", type: "dm", name: "Bob Tester", description: "Direct message", topic: "x", favorite: false, unread: 0, memberIds: [], peer: { name: "Bob Tester", memberId: "m_bob", online: true } });
  st.messages["dm-legacy-1"] = [{ id: "legacy-m1", conversationId: "dm-legacy-1", authorMemberId: "m_gina", authorName: "Gina Tester", authorInitials: "GT", body: "old message", createdAt: new Date(Date.now() - 86400000).toISOString(), reactions: [], attachments: [] }];
  await sql.query("update teambase_state set data=$1::jsonb, version=version+1 where id=1", [JSON.stringify(st)]);
  assert((await api(gina, "/channels/dm-legacy-1")).status === 200, "the person who wrote in it keeps access");
  assert((await api(bob, "/channels/dm-legacy-1")).status === 200, "the person it was opened with keeps access");
  assert((await api(alice, "/channels/dm-legacy-1")).status === 404, "an outsider no longer can read it");
  const bobView = (await api(bob, "/channels")).json.conversations.find((c) => c.id === "dm-legacy-1");
  eq([bobView.name, bobView.unread], ["Gina Tester", 0], "legacy messages count as already read (no unread flood)");
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
section("5. Formatting is preserved; long messages are not truncated");
const FORMATTED = "Sprint recap:\n\n  • Shipped the realtime layer\n  • Fixed DM privacy\n\n1. First step\n2. Second step\n    - nested with 4 spaces\n\tindented with a tab\n\nSigned,\n  Alice   (extra   spaces   inside)\n日本語 – emoji 🚀✅";
await test("bullets, numbering, line breaks, paragraph spacing and indentation round-trip byte-for-byte", async () => {
  const r = await post(alice, `/channels/${dmAB}/messages`, { body: FORMATTED });
  eq(r.json.body, FORMATTED);
  eq((await api(bob, `/channels/${dmAB}`)).json.messages.at(-1).body, FORMATTED, "stored and re-read identically");
});
await test("only blank lines at the start and whitespace at the end are trimmed; first-line indentation is kept; CRLF normalised", async () => {
  const r = await post(alice, `/channels/${dmAB}/messages`, { body: "\n\n   \n    indented first line\r\n  second\r\n\r\n   \n" });
  eq(r.json.body, "    indented first line\n  second");
});
await test("a 19,999-character message is stored and returned in full", async () => {
  const long = Array.from({ length: 400 }, (_, i) => `Line ${i + 1}: ${"lorem ipsum ".repeat(4)}`).join("\n").slice(0, 19_999);
  const r = await post(alice, `/channels/${dmAB}/messages`, { body: long });
  assert(r.status === 201, "status " + r.status); eq(r.json.body.length, 19_999);
  eq((await api(bob, `/channels/${dmAB}`)).json.messages.at(-1).body, long, "no truncation on read");
});
await test("over the limit is refused with a clear message (not silently cut)", async () => {
  const r = await post(alice, `/channels/${dmAB}/messages`, { body: "x".repeat(20_001) });
  assert(r.status === 413 && /20,000/.test(r.json.error), `${r.status} ${r.json?.error}`);
});
await test("control characters are stripped; nothing else is altered", async () => {
  eq((await post(alice, `/channels/${dmAB}/messages`, { body: "a\u0000b\u0007c\td" })).json.body, "abc\td");
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
section("6. Attachments — real files, preview + download");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
const upload = async (user, name, bytes, type = "application/octet-stream") => {
  const f = new FormData(); f.append("file", new File([bytes], name, { type })); return api(user, "/attachments", { method: "POST", body: f });
};
let imgAtt, pdfAtt, txtAtt, imgMsg;
await test("upload detects images from their bytes; unsent files are private to the uploader", async () => {
  const r = await upload(alice, "résumé photo.png", PNG, "image/png");
  assert(r.status === 201, "status " + r.status); imgAtt = r.json.attachments[0];
  eq([imgAtt.kind, imgAtt.mime, imgAtt.name, imgAtt.size], ["image", "image/png", "résumé photo.png", PNG.length]);
  assert((await api(alice, `/attachments/${imgAtt.id}`)).status === 200, "uploader can preview before sending");
  assert((await api(bob, `/attachments/${imgAtt.id}`)).status === 404, "others cannot before it is sent");
});
await test("sending a message with the file: the other person gets the identical bytes, inline, with safe headers", async () => {
  const r = await post(alice, `/channels/${dmAB}/messages`, { body: "look at this", attachments: [imgAtt] }); assert(r.status === 201); imgMsg = r.json;
  eq(r.json.attachments[0].kind, "image");
  const f = await api(bob, `/attachments/${imgAtt.id}`); const bytes = Buffer.from(await f.res.arrayBuffer());
  assert(f.status === 200 && bytes.equals(PNG), "bytes differ");
  eq(f.headers.get("content-type"), "image/png"); assert(/^inline;/.test(f.headers.get("content-disposition")), "should be inline for the preview");
  eq(f.headers.get("x-content-type-options"), "nosniff"); assert(/sandbox/.test(f.headers.get("content-security-policy")), "CSP sandbox");
});
await test("download: forced attachment with the original (even non-ASCII) filename", async () => {
  const f = await api(bob, `/attachments/${imgAtt.id}?download=1`); const cd = f.headers.get("content-disposition");
  assert(/^attachment;/.test(cd) && cd.includes("filename*=UTF-8''r%C3%A9sum%C3%A9%20photo.png"), cd);
});
await test("PDF: recognised, served inline (no CSP sandbox, which would break the browser's PDF viewer)", async () => {
  const r = await upload(alice, "report.pdf", PDF, "application/pdf"); pdfAtt = r.json.attachments[0]; eq([pdfAtt.kind, pdfAtt.mime], ["pdf", "application/pdf"]);
  await post(alice, `/channels/${dmAB}/messages`, { body: "", attachments: [pdfAtt] });
  const f = await api(bob, `/attachments/${pdfAtt.id}`); eq(f.headers.get("content-type"), "application/pdf"); assert(!f.headers.get("content-security-policy"));
});
await test("text file: gets a snippet preview endpoint, and is served as plain text", async () => {
  const text = Array.from({ length: 80 }, (_, i) => `row ${i + 1},value`).join("\n");
  txtAtt = (await upload(alice, "data.csv", Buffer.from(text), "text/csv")).json.attachments[0]; eq(txtAtt.kind, "text");
  await post(alice, `/channels/${dmAB}/messages`, { body: "", attachments: [txtAtt] });
  const p = (await api(bob, `/attachments/${txtAtt.id}?preview=text`)).json; eq(p.truncated, true); eq(p.text.split("\n").length, 40);
  assert(/^text\/plain/.test((await api(bob, `/attachments/${txtAtt.id}`)).headers.get("content-type")));
});
await test("a file whose name/type CLAIMS to be an image but isn't (HTML in a .png) is never rendered inline", async () => {
  const r = await upload(alice, "innocent.png", Buffer.from("<html><script>alert(1)</script></html>"), "image/png");
  eq([r.json.attachments[0].kind, r.json.attachments[0].mime], ["file", "application/octet-stream"]);
  await post(alice, `/channels/${dmAB}/messages`, { body: "", attachments: [r.json.attachments[0]] });
  const f = await api(bob, `/attachments/${r.json.attachments[0].id}`); assert(/^attachment;/.test(f.headers.get("content-disposition")) && f.headers.get("content-type") === "application/octet-stream");
});
await test("SVG and executables are download-only", async () => {
  for (const [n, b] of [["logo.svg", "<svg xmlns='http://www.w3.org/2000/svg'><script>1</script></svg>"], ["setup.exe", "MZ\u0090\u0000"]]) {
    const a = (await upload(alice, n, Buffer.from(b))).json.attachments[0]; eq(a.kind, "file", n);
  }
});
await test("limits: empty file, >10 MB, and >5 files per message are refused", async () => {
  assert((await upload(alice, "empty.txt", Buffer.alloc(0))).status === 400, "empty");
  assert((await upload(alice, "big.bin", Buffer.alloc(10 * 1024 * 1024 + 1, 1))).status === 413, "too big");
  const six = Array.from({ length: 6 }, (_, i) => ({ id: "f_x" + i, name: "x", size: 1 }));
  assert((await post(alice, `/channels/${dmAB}/messages`, { body: "x", attachments: six })).status === 400, "six files");
});
await test("a file can't be attached by someone else, nor attached twice (no way to expose another person's upload)", async () => {
  const mine = (await upload(alice, "mine.txt", Buffer.from("private"))).json.attachments[0];
  const steal = await post(bob, `/channels/${dmAB}/messages`, { body: "stolen", attachments: [mine] });
  assert(steal.status === 400, "bob attached alice's file: " + steal.status);
  assert((await post(alice, `/channels/${dmAB}/messages`, { body: "once", attachments: [mine] })).status === 201);
  assert((await post(alice, `/channels/${dmAB}/messages`, { body: "twice", attachments: [mine] })).status === 400, "reuse");
});
await test("files in a private DM are invisible to outsiders; channel files are visible to everyone", async () => {
  assert((await api(carol, `/attachments/${imgAtt.id}`)).status === 404, "outsider got a DM file");
  const ch = (await upload(alice, "pub.png", PNG, "image/png")).json.attachments[0];
  await post(alice, "/channels/c-announcements/messages", { body: "for all", attachments: [ch] });
  assert((await api(carol, `/attachments/${ch.id}`)).status === 200);
});
await test("range requests work (audio/video seeking) and bad ranges are rejected", async () => {
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.alloc(1000, 7)]);
  const v = (await upload(alice, "clip.mp4", mp4)).json.attachments[0]; eq([v.kind, v.mime], ["video", "video/mp4"]);
  await post(alice, `/channels/${dmAB}/messages`, { body: "", attachments: [v] });
  const r = await api(bob, `/attachments/${v.id}`, { headers: { range: "bytes=0-99" } });
  eq(r.status, 206); eq(r.headers.get("content-range"), `bytes 0-99/${mp4.length}`); eq((await r.res.arrayBuffer()).byteLength, 100);
  eq((await api(bob, `/attachments/${v.id}`, { headers: { range: "bytes=99999-" } })).status, 416);
});
await test("removing an unsent attachment deletes it; a sent one can't be deleted", async () => {
  const tmp = (await upload(alice, "tmp.txt", Buffer.from("x"))).json.attachments[0];
  eq((await api(alice, `/attachments/${tmp.id}`, { method: "DELETE" })).status, 200); eq((await api(alice, `/attachments/${tmp.id}`)).status, 404);
  eq((await api(alice, `/attachments/${imgAtt.id}`, { method: "DELETE" })).status, 404, "sent file");
});
await test("attachments from before files were stored (name + size only) are still accepted and shown", async () => {
  const r = await post(alice, `/channels/${dmAB}/messages`, { body: "", attachments: [{ name: "old.docx", size: 1234 }] });
  eq(r.json.attachments, [{ name: "old.docx", size: 1234 }]);
});
await test("deleting a conversation also deletes its files", async () => {
  const ch = (await post(alice, "/channels", { name: "temp-room" })).json;
  const f = (await upload(alice, "t.png", PNG, "image/png")).json.attachments[0]; await post(alice, `/channels/${ch.id}/messages`, { body: "", attachments: [f] });
  eq((await api(bob, `/attachments/${f.id}`)).status, 200); await api(alice, `/channels/${ch.id}`, { method: "DELETE" });
  eq((await sql.query("select count(*)::int n from teambase_attachments where id=$1", [f.id])).rows[0].n, 0);
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
section("Reactions are per person (they used to be one flag shared by everybody)");
await test("each person's reaction is their own; toggling only removes yours; others see live updates", async () => {
  const mid = (await post(alice, `/channels/${dmAB}/messages`, { body: "react to me" })).json.id; const from = sb.mark();
  let a = (await post(alice, `/channels/${dmAB}/messages/${mid}/reactions`, { emoji: "👍" })).json; eq([a.reactions[0].count, a.reactions[0].reacted], [1, true]);
  assert(await sb.waitFor((e) => e.type === "message" && e.change === "updated" && e.messageIds.includes(mid), { from }), "no live update");
  let b = (await api(bob, `/channels/${dmAB}/messages?ids=${mid}`)).json.messages[0]; eq([b.reactions[0].count, b.reactions[0].reacted], [1, false], "Bob must NOT appear to have reacted");
  b = (await post(bob, `/channels/${dmAB}/messages/${mid}/reactions`, { emoji: "👍" })).json; eq([b.reactions[0].count, b.reactions[0].reacted], [2, true]);
  a = (await post(alice, `/channels/${dmAB}/messages/${mid}/reactions`, { emoji: "👍" })).json; eq([a.reactions[0].count, a.reactions[0].reacted], [1, false]);
  b = (await post(bob, `/channels/${dmAB}/messages/${mid}/reactions`, { emoji: "👍" })).json; eq(b.reactions, [], "last reaction removed");
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
section("Upgrade: data saved by the PREVIOUS version keeps working");
await test("old channels, messages, reactions, attachments and counters are read correctly and stay usable", async () => {
  const st = (await sql.query("select data from teambase_state where id=1")).rows[0].data;
  const old = (id, extra = {}) => ({ id, conversationId: "c-legacy", authorMemberId: "m_gina", authorName: "Gina Tester", authorInitials: "GT", body: "legacy " + id, createdAt: new Date(Date.now() - 3600_000).toISOString(), reactions: [], attachments: [], ...extra });
  st.conversations.push({ id: "c-legacy", type: "channel", name: "legacy-room", description: "d", topic: "t", favorite: false, unread: 5, typingUser: "John Doe", memberIds: ["m_gina", "m-ray"] });
  st.messages["c-legacy"] = [
    old("L1", { reactions: [{ emoji: "👍", count: 4, reacted: true }], attachments: [{ name: "old.pdf", size: 10 }] }), // shared 'reacted' flag + name/size-only attachment
    old("L2", { body: "line one\n  indented\n\tTabbed" }),
  ];
  await sql.query("update teambase_state set data=$1::jsonb, version=version+1 where id=1", [JSON.stringify(st)]);

  const d = (await api(alice, "/channels/c-legacy")).json;
  assert(d, "legacy channel loads"); eq(d.messages.length, 2);
  eq(d.conversation.unread, 0, "the old shared unread counter is gone; old messages count as read");
  assert(!("typingUser" in d.conversation), "fake typing field dropped");
  eq(d.messages[0].reactions, [{ emoji: "👍", count: 4, reacted: false }], "old count kept, old shared 'reacted' flag ignored");
  eq(d.messages[0].attachments, [{ name: "old.pdf", size: 10 }], "old attachment unchanged");
  eq(d.messages[1].body, "line one\n  indented\n\tTabbed", "old text untouched");
  eq(d.messages[0].status, undefined, "no status for messages that predate it (not the author's)");
  eq((await api(alice, "/channels")).json.conversations.find((c) => c.id === "c-legacy").unread, 0);
  // and they can be used like any other message
  const r = (await post(alice, "/channels/c-legacy/messages/L1/reactions", { emoji: "👍" })).json;
  eq([r.reactions[0].count, r.reactions[0].reacted], [5, true], "your reaction adds to the old count");
  eq((await post(bob, "/channels/c-legacy/seen")).json.changed, 0, "nothing to mark seen in old messages");
  const mine = (await post(alice, "/channels/c-legacy/messages", { body: "new after upgrade" })).json;
  eq(mine.status.total, 3, "new messages get receipts for every registered person");
});

sa?.close(); sb?.close(); sc?.close(); await sql.end(); summary();
