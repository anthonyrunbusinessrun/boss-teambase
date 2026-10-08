/* Run with: npx tsx src/server/chat.test.ts */
import assert from "node:assert/strict";
import { audienceOf, canAccess, hasUndelivered, hasUnseen, inAudience, isRegisteredAccount, markDelivered, markSeen, normalizeBody, normalizeChat, panelMembers, presentConversation, presentMessage, presentReactions, recipientsOf, registeredIds, statusOf, toggleReaction, unreadFor } from "./chat";
import { sniff } from "./files";
import { attachmentUrl, fileTypeLabel, formatStamp, hasInlinePreview, statusView, typingLabel } from "../lib/chat";
import type { Db } from "./db";
import type { ChatMessage, Conversation, MessageStatus } from "../types/models";

const member = (id: string, name: string) => ({ id, name, role: "r", department: "d", initials: name.slice(0, 2), status: "active" as const, availability: "free" as const, managerId: null, skills: [] });
const acct = (memberId: string, extra: object = {}) => ({ memberId, email: `${memberId}@x.test`, ...extra });
const REG = { passwordHash: "h", emailVerifiedAt: "2026-01-01T00:00:00Z" };

function db(): Db {
  return {
    members: ["a", "b", "c", "d", "e", "f"].map((id) => member(id, id.toUpperCase() + "-name")),
    accounts: [acct("a", REG), acct("b", REG), acct("c", REG), acct("d", { passwordHash: "h" }) /* unverified */, acct("e") /* seeded, no password */],
    // "f" has no account at all
    tasks: [], sprints: [], events: [], conversations: [], messages: {}, templates: [], drafts: [], activity: [], notifications: [],
    settings: {} as Db["settings"], system: {} as Db["system"], nextTicket: 1,
  };
}
const channel = (id = "ch"): Conversation => ({ id, type: "channel", name: "general", description: "", topic: "", favorite: false, unread: 0, memberIds: [] });
const dm = (id: string, participantIds?: string[], peer?: Conversation["peer"]): Conversation => ({ id, type: "dm", name: "x", description: "", topic: "", favorite: false, unread: 0, memberIds: [], participantIds, peer });
const msg = (id: string, conversationId: string, author: string | undefined, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id, conversationId, authorMemberId: author, authorName: author ?? "Ghost", authorInitials: "XX", body: "hi", createdAt: `2026-01-01T00:00:0${id.slice(-1)}Z`, reactions: [], attachments: [], ...extra,
});

/* ---- who is registered ---- */
assert.deepEqual([...registeredIds(db())].sort(), ["a", "b", "c"], "only password + verified email counts");
assert.equal(isRegisteredAccount(acct("x", REG)), true);
assert.equal(isRegisteredAccount(acct("x", { passwordHash: "h" })), false, "unverified");
assert.equal(isRegisteredAccount(acct("x", { emailVerifiedAt: "t" })), false, "no password");
{ const d = db(); d.members = d.members.filter((m) => m.id !== "a"); assert.ok(!registeredIds(d).has("a"), "an account whose member was deleted is not registered"); }

/* ---- access + audience ---- */
assert.equal(canAccess(channel(), "zzz"), true, "channels are workspace-wide");
assert.equal(canAccess(dm("1", ["a", "b"]), "a"), true);
assert.equal(canAccess(dm("1", ["a", "b"]), "c"), false, "outsider");
assert.equal(canAccess(dm("1", undefined), "c"), true, "legacy placeholder stays visible");
assert.equal(canAccess(dm("1", ["a"]), "a"), false, "a one-person DM is dead");
assert.deepEqual(audienceOf(dm("1", ["a", "b"])), ["a", "b"]);
assert.equal(audienceOf(channel()), "all");
assert.equal(audienceOf(dm("1")), "all");
assert.deepEqual(audienceOf(dm("1", ["a"])), [], "dead DM: nobody hears about it");
assert.ok(inAudience("all", "q") && inAudience(["a"], "a") && !inAudience(["a"], "b") && !inAudience([], "a"));

/* ---- recipients ---- */
assert.deepEqual(recipientsOf(db(), channel(), "a").sort(), ["b", "c"], "channel: registered people except the author");
assert.deepEqual(recipientsOf(db(), dm("1", ["a", "b"]), "a"), ["b"]);
assert.deepEqual(recipientsOf(db(), dm("1", ["a", "d"]), "a"), [], "an unregistered participant is never a recipient");
assert.deepEqual(recipientsOf(db(), dm("1"), "a"), [], "legacy placeholder DM has no registered recipients");

/* ---- members panel: registered only, you first, then online ---- */
{
  const online = new Set(["c"]);
  const names = panelMembers(db(), channel(), (id) => online.has(id), "b").map((m) => m.id);
  assert.deepEqual(names, ["b", "c", "a"], "viewer first, then online, then the rest");
  assert.deepEqual(panelMembers(db(), dm("1", ["a", "d"]), () => false, "a").map((m) => m.id), ["a"], "unregistered participant is not listed");
  assert.deepEqual(panelMembers(db(), dm("2"), () => false, "a").map((m) => m.id), ["a"], "placeholder DM lists only the viewer");
}

/* ---- legacy migration ---- */
{
  const d = db();
  d.conversations = [dm("old", undefined, { name: "B", memberId: "b", online: true }), dm("ph", undefined, { name: "Sarah", online: true }), { ...dm("t"), participantIds: undefined, peer: undefined }];
  (d.conversations[0] as { typingUser?: string }).typingUser = "John Doe";
  d.messages = { old: [msg("m1", "old", "a"), msg("m2", "old", "c"), msg("m3", "old", "a")], ph: [msg("m4", "ph", undefined)] };
  normalizeChat(d);
  assert.deepEqual(d.conversations[0].participantIds, ["b", "a", "c"], "peer first, then everyone who wrote in it, no duplicates");
  assert.equal(d.conversations[1].participantIds, undefined, "placeholder with no peer id is left alone");
  assert.equal("typingUser" in d.conversations[0], false, "fake typing field is dropped");
  normalizeChat(d);
  assert.deepEqual(d.conversations[0].participantIds, ["b", "a", "c"], "idempotent");
}

/* ---- presentation: names per viewer, presence only for registered peers ---- */
{
  const d = db(); const c = dm("1", ["a", "b"], { name: "stale", memberId: "b" }); d.conversations = [c]; d.messages = { 1: [] };
  const forA = presentConversation(d, c, "a", () => true), forB = presentConversation(d, c, "b", () => false);
  assert.deepEqual([forA.name, forA.peer?.registered, forA.peer?.online], ["B-name", true, true]);
  assert.deepEqual([forB.name, forB.peer?.registered, forB.peer?.online], ["A-name", true, false]);
  const withUnreg = presentConversation(d, dm("2", ["a", "d"]), "a", () => true);
  assert.deepEqual([withUnreg.peer?.registered, withUnreg.peer?.online], [false, undefined], "no presence for an unverified account");
  const ph = presentConversation(d, dm("3", undefined, { name: "Sarah Chen", online: true }), "a", () => true);
  assert.deepEqual([ph.name, ph.peer?.registered, ph.peer?.online], ["Sarah Chen", false, undefined]);
}

/* ---- receipts, unread, status ---- */
{
  const d = db(); const c = channel(); d.conversations = [c];
  const m1 = msg("m1", "ch", "a", { receipts: { b: {}, c: { deliveredAt: "2026-01-01T00:01:00Z" } } });
  const legacy = msg("m2", "ch", "a"); // no receipts at all → predates the feature → already read
  d.messages = { ch: [m1, legacy] };
  assert.equal(unreadFor(d, c, "b"), 1); assert.equal(unreadFor(d, c, "a"), 0, "your own messages are never unread"); assert.equal(unreadFor(d, c, "zz"), 0, "late joiners aren't asked to read history");
  assert.ok(hasUndelivered(d, "b") && !hasUndelivered(d, "c") && !hasUndelivered(d, "a"));

  let s = statusOf(d, m1)!;
  assert.deepEqual([s.state, s.total, s.deliveredCount, s.seenCount], ["sent", 2, 1, 0], "one of two delivered → still 'sent' overall");
  const ch = markDelivered(d, "b", "2026-01-01T00:02:00Z");
  assert.deepEqual(ch, [{ conversationId: "ch", messageIds: ["m1"], authorIds: ["a"] }]);
  assert.deepEqual(markDelivered(d, "b", "later"), [], "idempotent");
  s = statusOf(d, m1)!; assert.equal(s.state, "delivered"); assert.equal(s.deliveredAt, "2026-01-01T00:02:00Z", "latest delivery");

  assert.ok(hasUnseen(d, "ch", "b"));
  const seen = markSeen(d, "ch", "b", "2026-01-01T00:03:00Z");
  assert.deepEqual(seen, { conversationId: "ch", messageIds: ["m1"], authorIds: ["a"] });
  assert.equal(markSeen(d, "ch", "b", "later"), null, "nothing new → no change (so no write)");
  s = statusOf(d, m1)!; assert.deepEqual([s.state, s.seenCount, s.seenAt], ["delivered", 1, "2026-01-01T00:03:00Z"], "one of two has seen it");
  markSeen(d, "ch", "c", "2026-01-01T00:04:00Z");
  s = statusOf(d, m1)!; assert.deepEqual([s.state, s.seenAt], ["seen", "2026-01-01T00:04:00Z"], "all seen → state seen, time of the last reader");
  assert.equal(m1.receipts!.c.deliveredAt, "2026-01-01T00:01:00Z", "seeing never overwrites an earlier delivery time");
  assert.equal(unreadFor(d, c, "b"), 0);

  // seen implies delivered even if nothing recorded delivery
  const m3 = msg("m3", "ch", "a", { receipts: { b: {} } }); d.messages.ch.push(m3); markSeen(d, "ch", "b", "2026-01-01T00:05:00Z");
  assert.deepEqual([m3.receipts!.b.deliveredAt, m3.receipts!.b.seenAt], ["2026-01-01T00:05:00Z", "2026-01-01T00:05:00Z"]);

  // viewers: only the author gets status; raw receipts never leave the server
  const forAuthor = presentMessage(d, m1, "a"), forReader = presentMessage(d, m1, "b");
  assert.ok(forAuthor.status && !forReader.status && !("receipts" in forAuthor) && !("receipts" in forReader));
  assert.equal(statusOf(d, msg("m9", "ch", undefined)), undefined, "no status for placeholder authors");
  assert.equal(statusOf(d, msg("m8", "ch", "a", { receipts: {} }))!.state, "sent", "nobody to deliver to → sent");
}

/* ---- reactions are per person ---- */
{
  let r = toggleReaction([], "👍", "a");
  assert.deepEqual(presentReactions(r, "a"), [{ emoji: "👍", count: 1, reacted: true }]);
  assert.deepEqual(presentReactions(r, "b"), [{ emoji: "👍", count: 1, reacted: false }], "others don't appear to have reacted");
  r = toggleReaction(r, "👍", "b"); assert.equal(presentReactions(r, "a")[0].count, 2);
  r = toggleReaction(r, "👍", "a"); assert.deepEqual(presentReactions(r, "a")[0], { emoji: "👍", count: 1, reacted: false });
  r = toggleReaction(r, "👍", "b"); assert.deepEqual(r, [], "last one removes the reaction");
  const legacy = () => [{ emoji: "🚀", count: 8, reacted: true }]; // saved before reactions tracked people
  assert.deepEqual(presentReactions(legacy(), "a"), [{ emoji: "🚀", count: 8, reacted: false }], "old shared flag is ignored; the count is kept");
  assert.deepEqual(presentReactions(toggleReaction(legacy(), "🚀", "a"), "a"), [{ emoji: "🚀", count: 9, reacted: true }], "your reaction adds one to the old count");
}

/* ---- message text: format preserved ---- */
assert.equal(normalizeBody("\n \n\t\n  indented\r\n\r\n  - bullet\n1. one\n\ttabbed   \n\n"), "  indented\n\n  - bullet\n1. one\n\ttabbed");
assert.equal(normalizeBody("a\u0000b\u0007c\u007fd\te"), "abcd\te", "control characters out, tabs kept");
assert.equal(normalizeBody("line1\n\n\n\nline2"), "line1\n\n\n\nline2", "paragraph spacing untouched");
assert.equal(normalizeBody("  "), ""); assert.equal(normalizeBody(undefined), ""); assert.equal(normalizeBody(42), "");
assert.equal(normalizeBody(" ".repeat(100_000) + "x" + " ".repeat(100_000)).length, 100_001, "no catastrophic backtracking");
assert.equal(normalizeBody("日本語 🚀 émoji"), "日本語 🚀 émoji");

/* ---- file type detection is from the bytes ---- */
const b = (...xs: number[]) => Uint8Array.from(xs);
const text = (s: string) => new TextEncoder().encode(s);
assert.equal(sniff("x.png", b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)).kind, "image");
assert.equal(sniff("x.jpg", b(0xff, 0xd8, 0xff, 0xe0)).mime, "image/jpeg");
assert.equal(sniff("x.gif", text("GIF89a....")).mime, "image/gif");
assert.equal(sniff("x.webp", Uint8Array.from([...text("RIFF"), 0, 0, 0, 0, ...text("WEBPVP8 ")])).mime, "image/webp");
assert.equal(sniff("x.pdf", text("%PDF-1.7\n")).kind, "pdf");
assert.equal(sniff("a.m4a", Uint8Array.from([0, 0, 0, 24, ...text("ftypM4A ")])).kind, "audio");
assert.equal(sniff("a.mov", Uint8Array.from([0, 0, 0, 24, ...text("ftypqt  ")])).mime, "video/quicktime");
assert.equal(sniff("a.webm", b(0x1a, 0x45, 0xdf, 0xa3, 0)).mime, "video/webm");
assert.equal(sniff("a.mp3", text("ID3\u0004")).mime, "audio/mpeg");
assert.equal(sniff("a.wav", Uint8Array.from([...text("RIFF"), 0, 0, 0, 0, ...text("WAVEfmt ")])).mime, "audio/wav");
assert.equal(sniff("notes.csv", text("a,b\n1,2")).kind, "text");
assert.equal(sniff("bin.csv", b(0x61, 0, 0x62)).kind, "file", "a 'text' name with NUL bytes is not text");
assert.deepEqual(sniff("evil.png", text("<html><script>alert(1)</script>")), { mime: "application/octet-stream", kind: "file", inline: false }, "the name lies");
assert.equal(sniff("logo.svg", text("<svg onload=alert(1)>")).inline, false, "SVG never inline");
assert.equal(sniff("page.html", text("<html>")).inline, false, "HTML never inline");
assert.equal(sniff("setup.exe", text("MZ")).inline, false);
assert.equal(sniff("empty", new Uint8Array()).kind, "file");

/* ---- client wording ---- */
assert.equal(typingLabel([]), ""); assert.equal(typingLabel(["Stad"]), "Stad is typing…"); assert.equal(typingLabel(["Stad", "Ray"]), "Stad and Ray are typing…");
assert.equal(typingLabel(["A", "B", "C"]), "A, B and 1 other are typing…"); assert.equal(typingLabel(["A", "B", "C", "D"]), "A, B and 2 others are typing…");
assert.equal(typingLabel(["Stad", "Stad"]), "Stad is typing…", "same person on two tabs is one person");
const base: MessageStatus = { state: "sent", sentAt: "2026-10-08T12:00:00Z", total: 1, deliveredCount: 0, seenCount: 0, recipients: [] };
const TZ = "Asia/Manila";
assert.equal(statusView(base, TZ).label, "Sent");
assert.equal(statusView({ ...base, state: "delivered", deliveredCount: 1, deliveredAt: "2026-10-08T12:01:00Z" }, TZ).label, "Delivered");
assert.equal(statusView({ ...base, state: "seen", deliveredCount: 1, seenCount: 1, deliveredAt: "2026-10-08T12:01:00Z", seenAt: "2026-10-08T12:02:00Z" }, TZ).label, "Seen");
const group = { ...base, total: 3 };
assert.equal(statusView({ ...group, deliveredCount: 2, deliveredAt: "2026-10-08T12:01:00Z" }, TZ).label, "Delivered to 2 of 3");
assert.equal(statusView({ ...group, state: "delivered", deliveredCount: 3, deliveredAt: "2026-10-08T12:01:00Z" }, TZ).label, "Delivered");
assert.equal(statusView({ ...group, deliveredCount: 3, seenCount: 1, deliveredAt: "x", seenAt: "2026-10-08T12:02:00Z" }, TZ).label, "Seen by 1 of 3");
assert.equal(statusView({ ...group, state: "seen", deliveredCount: 3, seenCount: 3, deliveredAt: "x", seenAt: "2026-10-08T12:02:00Z" }, TZ).label, "Seen by everyone");
{
  const now = new Date("2026-10-08T14:00:00Z"); // 10:00 PM in Manila, Oct 8
  assert.equal(formatStamp("2026-10-08T12:47:00Z", TZ, now), "8:47 PM");
  assert.equal(formatStamp("2026-10-07T12:47:00Z", TZ, now), "Oct 7, 8:47 PM");
  assert.equal(formatStamp("2025-10-07T12:47:00Z", TZ, now), "Oct 7, 2025, 8:47 PM");
  assert.equal(formatStamp("2026-10-08T17:30:00Z", TZ, now), "Oct 9, 1:30 AM", "past midnight Manila time is the next day");
}
assert.equal(fileTypeLabel({ name: "Budget.XLSX" }), "Excel spreadsheet"); assert.equal(fileTypeLabel({ name: "x.weird", kind: "file" }), "WEIRD file"); assert.equal(fileTypeLabel({ name: "noext", kind: "file" }), "File");
assert.equal(fileTypeLabel({ name: "fake.png", kind: "file" }), "PNG file", "a spoofed image is not labelled Image"); assert.equal(fileTypeLabel({ name: "real.png", kind: "image" }), "Image");
assert.ok(hasInlinePreview("image") && hasInlinePreview("text") && !hasInlinePreview("pdf") && !hasInlinePreview("file") && !hasInlinePreview(undefined));
assert.equal(attachmentUrl("f_1"), "/api/attachments/f_1"); assert.equal(attachmentUrl("f_1", true), "/api/attachments/f_1?download=1");

console.log("chat rules + helpers: all assertions passed");
