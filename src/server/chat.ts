/**
 * Channel & messaging rules — pure functions over the application state (no I/O), so every rule here can be unit-tested.
 *
 * Vocabulary
 *  - registered:  an account with a password AND a verified email. That is exactly who can sign in, so it is the only kind of
 *                 person who can ever be "online", appear in a members list, or be messaged. (One function — change it here.)
 *  - audience:    who may see/receive realtime events for a conversation.
 *  - recipients:  the registered people a message is addressed to; each gets a delivered/seen receipt.
 */
import type {
  ChannelMember,
  ChatMessage,
  Conversation,
  ID,
  MessageStatus,
  MessageStatusRecipient,
  Reaction,
  Receipt,
  TeamMember,
} from "@/types/models";
import type { Account, Db } from "./db";

/* ------------------------------ registration ------------------------------ */

export const isRegisteredAccount = (a: Account): boolean => !!a.passwordHash && !!a.emailVerifiedAt;

/** Member ids that have a registered account (and still exist in the directory). */
export function registeredIds(db: Db): Set<ID> {
  const members = new Set(db.members.map((m) => m.id));
  return new Set(db.accounts.filter((a) => isRegisteredAccount(a) && members.has(a.memberId)).map((a) => a.memberId));
}

export const isRegistered = (db: Db, memberId: ID): boolean => registeredIds(db).has(memberId);

/* ------------------------------ access ------------------------------ */

export type Audience = ID[] | "all";

/**
 * Channels are workspace-wide. A DM is visible to its participants only.
 * Legacy placeholder DMs (no participant list at all) stay visible as before; a DM with fewer than two participants is dead.
 */
export function canAccess(c: Conversation, memberId: ID): boolean {
  if (c.type === "channel") return true;
  if (!c.participantIds) return true;
  return c.participantIds.length >= 2 && c.participantIds.includes(memberId);
}

export function audienceOf(c: Conversation): Audience {
  if (c.type !== "dm" || !c.participantIds) return "all";
  return c.participantIds.length >= 2 ? c.participantIds : []; // a one-person "DM" is dead: nobody hears about it
}

export const inAudience = (aud: Audience, memberId: ID): boolean => aud === "all" || aud.includes(memberId);

/** The registered people a new message from `authorId` is addressed to (snapshotted into the message's receipts). */
export function recipientsOf(db: Db, c: Conversation, authorId: ID): ID[] {
  const registered = registeredIds(db);
  const pool = c.type === "channel" ? [...registered] : (c.participantIds ?? []);
  return pool.filter((id) => id !== authorId && registered.has(id));
}

/** The members shown in a conversation's member panel: registered only. Channels are workspace-wide. */
export function panelMembers(db: Db, c: Conversation, isOnline: (id: ID) => boolean, viewerId: ID): ChannelMember[] {
  const registered = registeredIds(db);
  const ids = c.type === "channel" ? [...registered] : (c.participantIds ?? [viewerId]).filter((id) => registered.has(id));
  return db.members
    .filter((m) => ids.includes(m.id))
    .map((m) => ({ ...m, registered: true, online: isOnline(m.id) }))
    .sort((a, b) => Number(b.id === viewerId) - Number(a.id === viewerId) || Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
}

/* ------------------------------ migration ------------------------------ */

const unique = <T,>(xs: T[]): T[] => Array.from(new Set(xs));

/**
 * Brings older saved state up to date. Idempotent, runs on every read:
 *  - DMs created before participants existed get them from who is actually in the conversation
 *    (the person it was opened with + everyone who wrote in it), so outsiders lose access and participants keep it.
 *  - The fake `typingUser` field is dropped (typing is real-time now).
 */
export function normalizeChat(db: Db): void {
  for (const c of db.conversations) {
    delete (c as { typingUser?: string }).typingUser;
    if (c.type === "dm" && !c.participantIds && c.peer?.memberId) {
      const authors = (db.messages[c.id] ?? []).map((m) => m.authorMemberId).filter((id): id is ID => !!id);
      c.participantIds = unique([c.peer.memberId, ...authors]);
    }
  }
}

/* ------------------------------ presentation ------------------------------ */

/** A conversation as seen by one viewer: DM names/peers resolved relative to them, unread counted for them, presence only for registered peers. */
export function presentConversation(db: Db, c: Conversation, viewerId: ID, isOnline: (id: ID) => boolean): Conversation {
  const unread = unreadFor(db, c, viewerId);
  if (c.type === "channel") return { ...c, unread, memberIds: [...registeredIds(db)] };

  const registered = registeredIds(db);
  const otherId = c.participantIds?.find((id) => id !== viewerId) ?? c.peer?.memberId;
  const other = otherId ? db.members.find((m) => m.id === otherId) : undefined;
  const isReg = !!other && registered.has(other.id);
  const name = other?.name ?? c.peer?.name ?? c.name;
  return {
    ...c,
    name,
    topic: `Direct message with ${name}.`,
    unread,
    memberIds: [],
    peer: { name, memberId: other?.id, registered: isReg, online: isReg ? isOnline(other!.id) : undefined },
  };
}

/** How many messages from other people this viewer hasn't seen. Messages that predate receipts count as already read. */
export function unreadFor(db: Db, c: Conversation, memberId: ID): number {
  let n = 0;
  for (const m of db.messages[c.id] ?? []) {
    const r = m.receipts?.[memberId];
    if (r && !r.seenAt && m.authorMemberId !== memberId) n += 1;
  }
  return n;
}

const latest = (xs: (string | undefined)[]): string | undefined => xs.filter((x): x is string => !!x).sort().at(-1);

export function statusOf(db: Db, msg: ChatMessage): MessageStatus | undefined {
  if (!msg.authorMemberId) return undefined;
  const recipients: MessageStatusRecipient[] = Object.entries(msg.receipts ?? {}).map(([memberId, r]) => ({
    memberId,
    name: db.members.find((m) => m.id === memberId)?.name ?? "Former member",
    deliveredAt: r.deliveredAt ?? r.seenAt, // seen implies delivered
    seenAt: r.seenAt,
  }));
  const total = recipients.length;
  const delivered = recipients.filter((r) => r.deliveredAt);
  const seen = recipients.filter((r) => r.seenAt);
  return {
    state: total > 0 && seen.length === total ? "seen" : total > 0 && delivered.length === total ? "delivered" : "sent",
    sentAt: msg.createdAt,
    total,
    deliveredCount: delivered.length,
    seenCount: seen.length,
    deliveredAt: latest(delivered.map((r) => r.deliveredAt)),
    seenAt: latest(seen.map((r) => r.seenAt)),
    recipients,
  };
}

/**
 * Reactions remember who reacted (`by`), so "you reacted" and toggling are per person. A reaction saved before this existed has
 * only a count; that count is kept as the base and nobody is credited with it.
 */
export function presentReactions(reactions: Reaction[], viewerId: ID): Reaction[] {
  return reactions.map((r) => ({ emoji: r.emoji, count: r.count + (r.by?.length ?? 0), reacted: !!r.by?.includes(viewerId) }));
}

export function toggleReaction(reactions: Reaction[], emoji: string, memberId: ID): Reaction[] {
  const r = reactions.find((x) => x.emoji === emoji);
  if (!r) return [...reactions, { emoji, count: 0, reacted: false, by: [memberId] }];
  r.by = r.by?.includes(memberId) ? r.by.filter((id) => id !== memberId) : [...(r.by ?? []), memberId];
  return r.count + r.by.length > 0 ? reactions : reactions.filter((x) => x !== r);
}

/** A message as seen by one viewer: live author name, no raw receipts, and delivery status only for the author. */
export function presentMessage(db: Db, msg: ChatMessage, viewerId: ID): ChatMessage {
  const { receipts: _receipts, ...rest } = msg;
  void _receipts;
  const author = msg.authorMemberId ? db.members.find((m) => m.id === msg.authorMemberId) : undefined;
  return {
    ...rest,
    reactions: presentReactions(msg.reactions, viewerId),
    authorName: author?.name ?? msg.authorName,
    authorInitials: author?.initials ?? msg.authorInitials,
    status: msg.authorMemberId === viewerId ? statusOf(db, msg) : undefined,
  };
}

export const presentMember = (db: Db, m: TeamMember): TeamMember => ({ ...m, registered: registeredIds(db).has(m.id) });

/* ------------------------------ receipts ------------------------------ */

export interface StatusChange {
  conversationId: ID;
  messageIds: ID[];
  /** People whose messages changed (they get a live status update). */
  authorIds: ID[];
}

const accessible = (db: Db, memberId: ID) => db.conversations.filter((c) => canAccess(c, memberId));

/** Is anything addressed to this person still undelivered? (read-only check, so no write is needed when it's false) */
export function hasUndelivered(db: Db, memberId: ID): boolean {
  return accessible(db, memberId).some((c) => (db.messages[c.id] ?? []).some((m) => m.receipts?.[memberId] && !m.receipts[memberId].deliveredAt && !m.receipts[memberId].seenAt));
}

/** The person's app just opened: everything addressed to them is now on their device → "Delivered". */
export function markDelivered(db: Db, memberId: ID, at: string): StatusChange[] {
  const changes: StatusChange[] = [];
  for (const c of accessible(db, memberId)) {
    const ids: ID[] = [];
    const authors = new Set<ID>();
    for (const m of db.messages[c.id] ?? []) {
      const r = m.receipts?.[memberId];
      if (r && !r.deliveredAt) {
        r.deliveredAt = r.seenAt ?? at;
        ids.push(m.id);
        if (m.authorMemberId) authors.add(m.authorMemberId);
      }
    }
    if (ids.length) changes.push({ conversationId: c.id, messageIds: ids, authorIds: [...authors] });
  }
  return changes;
}

export function hasUnseen(db: Db, convId: ID, memberId: ID): boolean {
  return (db.messages[convId] ?? []).some((m) => m.receipts?.[memberId] && !m.receipts[memberId].seenAt);
}

/** The person is looking at this conversation: everything addressed to them in it is now "Seen" (and implicitly delivered). */
export function markSeen(db: Db, convId: ID, memberId: ID, at: string): StatusChange | null {
  const ids: ID[] = [];
  const authors = new Set<ID>();
  for (const m of db.messages[convId] ?? []) {
    const r: Receipt | undefined = m.receipts?.[memberId];
    if (r && !r.seenAt) {
      r.seenAt = at;
      r.deliveredAt ??= at;
      ids.push(m.id);
      if (m.authorMemberId) authors.add(m.authorMemberId);
    }
  }
  return ids.length ? { conversationId: convId, messageIds: ids, authorIds: [...authors] } : null;
}

/* ------------------------------ message text ------------------------------ */

export { MAX_BODY } from "@/lib/chat-limits";

/**
 * Cleans a message for storage WITHOUT touching its formatting: line endings are normalised to \n, control characters are
 * dropped, and only blank lines at the very start and whitespace at the very end are removed. Indentation, tabs, bullets,
 * numbering, blank lines between paragraphs and spaces inside lines are all kept exactly as typed or pasted.
 */
export function normalizeBody(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/^(?:[ \t]*\n)+/, "")
    .trimEnd();
}
