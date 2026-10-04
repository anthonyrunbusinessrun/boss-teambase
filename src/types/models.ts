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
  reacted: boolean;
}

export interface Attachment {
  name: string;
  size: number;
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
}

export interface DirectPeer {
  name: string;
  memberId?: ID;
  online: boolean;
}

export interface Conversation {
  id: ID;
  type: "channel" | "dm";
  /** Channel name without "#", or the peer's name for DMs. */
  name: string;
  /** One-line description shown in the thread header. */
  description: string;
  /** Longer topic shown in the Channel Details panel. */
  topic: string;
  favorite: boolean;
  unread: number;
  memberIds: ID[];
  peer?: DirectPeer;
  typingUser?: string;
}

export interface ConversationList {
  conversations: Conversation[];
  unreadTotal: number;
}

export interface ConversationDetail {
  conversation: Conversation;
  messages: ChatMessage[];
  members: TeamMember[];
}

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
