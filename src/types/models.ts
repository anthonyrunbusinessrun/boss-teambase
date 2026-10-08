/**
 * Domain models for BOSS Teambase.
 * These are the shapes shared by the UI, the service layer and the API routes.
 * When a real database arrives, these interfaces stay the contract.
 */

export type ID = string;

/* ----------------------------- Team ----------------------------- */

export type MemberStatus = "active" | "offline";
export type Availability = "free" | "in-meeting";

export interface TeamMember {
  id: ID;
  name: string;
  /** Job title, e.g. "CTO". Shown on cards and used by the "All Roles" filter. */
  role: string;
  department: string;
  /** 2–3 letter avatar code (avatars are initials-only in the design system). */
  initials: string;
  status: MemberStatus;
  availability: Availability;
  /** Reporting line for the organizational chart. `null` = top of the chart. */
  managerId: ID | null;
  skills: string[];
  /**
   * Computed by the API, never stored: true when this person has a verified account and can sign in.
   * Only registered people can be messaged and only they ever show a presence indicator.
   */
  registered?: boolean;
}

export type NewTeamMember = Pick<TeamMember, "name" | "role" | "department"> &
  Partial<Pick<TeamMember, "initials" | "status" | "managerId" | "skills">>;

/* ----------------------------- Actions (kanban) ----------------------------- */

export type TaskStatus = "backlog" | "todo" | "in-progress" | "review";
export type Priority = "high" | "medium" | "low";

export interface Task {
  id: ID;
  /** Human ticket key, e.g. "TB-48". */
  key: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  /** yyyy-mm-dd */
  dueDate: string;
  /** 0–100 */
  progress: number;
  assigneeId: ID | null;
}

export type TaskInput = Omit<Task, "id" | "key">;

/* ----------------------------- Calendar ----------------------------- */

export type EventKind = "event" | "meeting";
export type Importance = "standard" | "high";

export interface CalendarEvent {
  id: ID;
  title: string;
  kind: EventKind;
  /** ISO timestamps (UTC). Displayed in the user's primary time zone. */
  start: string;
  end: string;
  importance: Importance;
  location?: string;
}

export type EventInput = Omit<CalendarEvent, "id">;

/* ----------------------------- Channels ----------------------------- */

export interface Reaction {
  emoji: string;
  count: number;
  /** Whether *you* reacted (computed per viewer). */
  reacted: boolean;
  /** Server-side only: who reacted. `count` then holds only reactions saved before this was tracked. */
  by?: ID[];
}

export type AttachmentKind = "image" | "video" | "audio" | "pdf" | "text" | "file";

export interface Attachment {
  name: string;
  size: number;
  /** Present when the file is stored on the server. Older attachments only kept a name + size, so they can't be previewed or downloaded. */
  id?: string;
  mime?: string;
  kind?: AttachmentKind;
}

/** One recipient's delivery/read receipt for a message. */
export interface Receipt {
  deliveredAt?: string;
  seenAt?: string;
}

export type MessageState = "sent" | "delivered" | "seen";

export interface MessageStatusRecipient {
  memberId: ID;
  name: string;
  deliveredAt?: string;
  seenAt?: string;
}

/**
 * Delivery status of a message, shown to its author.
 * `state` is the strictest state that holds for *every* recipient (so "seen" means everyone has seen it);
 * the counts let the UI say "Seen by 2 of 3" in channels.
 */
export interface MessageStatus {
  state: MessageState;
  sentAt: string;
  /** Number of registered people the message was addressed to when it was sent. */
  total: number;
  deliveredCount: number;
  seenCount: number;
  /** When it reached the latest recipient who has received it so far. */
  deliveredAt?: string;
  /** When the latest recipient who has seen it so far saw it. */
  seenAt?: string;
  recipients: MessageStatusRecipient[];
}

export interface ChatMessage {
  id: ID;
  conversationId: ID;
  /** Present when the author is a team member (name/initials are resolved live). */
  authorMemberId?: ID;
  authorName: string;
  authorInitials: string;
  body: string;
  createdAt: string;
  reactions: Reaction[];
  attachments: Attachment[];
  /** Stored per recipient at send time. Server-side only — never returned by the API. */
  receipts?: Record<ID, Receipt>;
  /** Computed for the author's own messages only. */
  status?: MessageStatus;
}

export interface DirectPeer {
  name: string;
  memberId?: ID;
  /** True only for people with a registered (verified) account. Presence is never shown for anyone else. */
  registered?: boolean;
  /** Only defined when `registered` is true. */
  online?: boolean;
}

export interface Conversation {
  id: ID;
  type: "channel" | "dm";
  /** Channel name without "#", or — for DMs — the *other* person's name (resolved per viewer). */
  name: string;
  /** One-line description shown in the thread header. */
  description: string;
  /** Longer topic shown in the Channel Details panel. */
  topic: string;
  favorite: boolean;
  /** Messages from other people that *you* haven't seen (computed per viewer). */
  unread: number;
  memberIds: ID[];
  /** DMs: exactly who can see this conversation. Absent only on legacy placeholder conversations. */
  participantIds?: ID[];
  peer?: DirectPeer;
}

export interface ConversationList {
  conversations: Conversation[];
  unreadTotal: number;
}

/** A registered member as shown in the members panel and "new message" picker. */
export interface ChannelMember extends TeamMember {
  online: boolean;
}

export interface ConversationDetail {
  conversation: Conversation;
  messages: ChatMessage[];
  /** Registered members only. */
  members: ChannelMember[];
}

/* ----------------------------- Realtime ----------------------------- */

/** Everything the server pushes over `/api/channels/events`. */
export type RealtimeEvent =
  | { type: "ready"; connectionId: string; online: ID[] }
  | { type: "presence"; memberId: ID; online: boolean }
  | { type: "typing"; conversationId: ID; memberId: ID; name: string; typing: boolean }
  | { type: "message"; conversationId: ID; change: "created" | "updated" | "status"; messageIds: ID[] }
  | { type: "conversation"; conversationId: ID; change: "created" | "updated" | "deleted" | "read" };

/* ----------------------------- Reports / Document Center ----------------------------- */

export interface TemplateSection {
  heading: string;
  body?: string;
  table?: { columns: [string, string]; rows: [string, string][] };
}

export interface ReportTemplate {
  id: ID;
  name: string;
  description: string;
  /** Last-updated date, yyyy-mm-dd. */
  updatedAt: string;
  kind: "standard" | "custom";
  version: string;
  /** Title shown inside the live preview sheet. */
  documentTitle: string;
  sections: TemplateSection[];
  fileName?: string;
}

export interface ReportDraft {
  id: ID;
  templateId: ID;
  title: string;
  createdAt: string;
}

/* ----------------------------- Dashboard ----------------------------- */

export interface ActivityItem {
  id: ID;
  at: string;
  actor?: { name: string; initials: string };
  /** Sentence before the object, e.g. "completed". */
  text: string;
  object?: string;
  objectHref?: string;
  /** "link" = red-light link, "strong" = white emphasis. */
  objectTone?: "link" | "strong";
  suffix?: string;
  /** System events render a shield icon instead of an avatar. */
  system?: boolean;
}

export interface WeeklyMetric {
  key: "todo" | "in-progress" | "done" | "completed";
  label: string;
  value: number;
  /** Percent change vs last week. Negative = decrease. */
  delta: number;
  /** Display the value as a percentage (e.g. "94%"). */
  percent?: boolean;
}

export interface SystemMeters {
  apiVolume: { percent: number };
  latency: { label: string; percent: number };
}

/* ----------------------------- Notifications ----------------------------- */

export type NotificationType = "messages" | "tasks" | "meetings" | "budget";

export interface AppNotification {
  id: ID;
  type: NotificationType;
  text: string;
  at: string;
  read: boolean;
  href: string;
}

/* ----------------------------- Settings / session ----------------------------- */

export interface NotificationPrefs {
  messages: boolean;
  tasks: boolean;
  meetings: boolean;
  budget: boolean;
}

export interface Settings {
  /** Only "dark" is designed today; light is reserved for when it is. */
  theme: "dark";
  reduceMotion: boolean;
  notifications: NotificationPrefs;
  /** Header "home" clock and the zone used to display events. */
  primaryZoneId: string;
  secondaryZoneId: string;
}

export interface Session {
  userId: ID;
  /** Work email of the signed-in account. */
  email: string;
}

/* ----------------------------- Search ----------------------------- */

export interface SearchResult {
  id: ID;
  group: "People" | "Channels" | "Actions" | "Calendar" | "Reports";
  title: string;
  subtitle?: string;
  href: string;
}
