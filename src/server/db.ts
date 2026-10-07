/**
 * In-memory mock "database".
 *
 * This is the ONLY file that knows data lives in memory. API route handlers talk to
 * `getDb()` and the helper functions below, so swapping in a real database later means
 * replacing this module (and nothing in the UI or service layer).
 *
 * Seed data mirrors the supplied designs. Dates are generated relative to "today"
 * (in the primary time zone) so the app always looks alive.
 */
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { zonedParts, zonedTimeToUtc } from "@/lib/time";
import { makeInitials } from "@/lib/utils";
import type {
  ActivityItem,
  AppNotification,
  CalendarEvent,
  ChatMessage,
  Conversation,
  ID,
  ReportDraft,
  ReportTemplate,
  Settings,
  SystemMeters,
  Task,
  TeamMember,
} from "@/types/models";

const SEED_ZONE = "Asia/Manila";

/**
 * Who may sign in: a work email mapped to a team member. Kept apart from `TeamMember` so emails stay out of the
 * public member API. Accounts are provisioned by an administrator — the app has no sign-up.
 */
export interface Account {
  memberId: ID;
  /** Work email, lower-case. */
  email: string;
  passwordHash?: string;
  emailVerifiedAt?: string;
  verificationTokenHash?: string;
  verificationExpiresAt?: string;
  createdAt?: string;
}

export interface Db {
  members: TeamMember[];
  accounts: Account[];
  tasks: Task[];
  events: CalendarEvent[];
  conversations: Conversation[];
  messages: Record<ID, ChatMessage[]>;
  templates: ReportTemplate[];
  drafts: ReportDraft[];
  activity: ActivityItem[];
  notifications: AppNotification[];
  settings: Settings;
  system: SystemMeters;
  nextTicket: number;
}

export const newId = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`;

/* ------------------------------ seed ------------------------------ */

function seed(): Db {
  const now = new Date();
  const t = zonedParts(now, SEED_ZONE);
  /** A moment `dayOffset` days from today at h:mm (Manila wall-clock), as ISO UTC. */
  const at = (dayOffset: number, h: number, m = 0) =>
    zonedTimeToUtc(SEED_ZONE, t.year, t.month, t.day + dayOffset, h, m).toISOString();
  const dateOnly = (dayOffset: number) =>
    new Date(Date.UTC(t.year, t.month - 1, t.day + dayOffset)).toISOString().slice(0, 10);
  const minsAgo = (m: number) => new Date(now.getTime() - m * 60000).toISOString();

  const member = (
    id: ID,
    name: string,
    role: string,
    department: string,
    initials: string,
    status: TeamMember["status"],
    managerId: ID | null,
    availability: TeamMember["availability"] = "free",
  ): TeamMember => ({ id, name, role, department, initials, status, availability, managerId, skills: [] });

  const members: TeamMember[] = [
    member("m-ray", "Ray Land", "CEO", "Admin", "RL", "active", null),
    member("m-joseph", "Joseph Anthony", "CTO", "Tech", "JAD", "active", "m-ray", "in-meeting"),
    member("m-ereika", "Ereika", "CFO", "Finance", "EJE", "offline", "m-ray"),
    member("m-stad", "Stad Osuyos", "UI/UX Designer", "Tech", "SO", "active", "m-joseph"),
    member("m-andrea", "Andrea", "Communications", "Communications", "AN", "active", "m-ray"),
    member("m-shiela", "Shiela", "Marketing", "Marketing", "SH", "active", "m-ray"),
    member("m-benj", "Benj", "Sales", "Sales", "BE", "active", "m-ray"),
  ];

  const accounts: Account[] = members.map((m) => ({
    memberId: m.id,
    email: `${m.name.split(" ")[0].toLowerCase()}@teambase.test`,
  }));

  const task = (
    n: number,
    title: string,
    status: Task["status"],
    priority: Task["priority"],
    dueOffset: number,
    progress: number,
    assigneeId: ID,
    description: string,
  ): Task => ({ id: `t-${n}`, key: `TB-${n}`, title, status, priority, dueDate: dateOnly(dueOffset), progress, assigneeId, description });

  const tasks: Task[] = [
    task(44, "Database Index Tuning", "backlog", "medium", 2, 0, "m-stad", "Review slow queries and add the missing indexes."),
    task(45, "Docker Compose Setup", "backlog", "low", 6, 0, "m-joseph", "Containerize the local development stack."),
    task(46, "API Payload Validation", "todo", "high", 0, 15, "m-joseph", "Validate request payloads at the API boundary."),
    task(
      48,
      "Actions Panel Refactor",
      "in-progress",
      "high",
      -2,
      65,
      "m-stad",
      "Rebuilding the Jira bento Kanban architecture to strictly support fluid cross-axis layouts and precise material design shadows.",
    ),
    task(47, "Budget Service Integration Audit", "review", "medium", -3, 90, "m-stad", "Audit the budget service integration before sign-off."),
  ];

  const ev = (
    id: string,
    title: string,
    kind: CalendarEvent["kind"],
    start: string,
    end: string,
    importance: CalendarEvent["importance"] = "standard",
    location?: string,
  ): CalendarEvent => ({ id, title, kind, start, end, importance, location });

  const events: CalendarEvent[] = [
    ev("e-sync", "API Sync Workshop", "event", at(-10, 11), at(-10, 12), "high"),
    ev("e-checkpoint", "UI Final Checkpoint", "event", at(-7, 15), at(-7, 16)),
    ev("e-qa", "QA Sandbox Review", "event", at(9, 14), at(9, 15)),
    ev("e-leadsync", "Lead Sync & Alignment", "meeting", at(0, 10), at(0, 10, 30), "standard", "Room 4B & Zoom"),
    ev("e-uifinal", "UI Design Finalization", "meeting", at(0, 13, 30), at(0, 14, 30), "standard", "Figma Workshop"),
    ev("e-retro", "Sprint Retro Alignment", "meeting", at(1, 14), at(1, 15)),
    ev("e-apireview", "API Review & Sync", "meeting", at(2, 15), at(2, 16)),
    ev("e-dbsession", "Database Structuring Session", "meeting", at(3, 10), at(3, 11, 30)),
  ];

  /* conversations */
  const conv = (
    id: ID,
    type: Conversation["type"],
    name: string,
    description: string,
    topic: string,
    memberIds: ID[],
    extra: Partial<Conversation> = {},
  ): Conversation => ({ id, type, name, description, topic, memberIds, favorite: false, unread: 0, ...extra });

  const conversations: Conversation[] = [
    conv(
      "c-announcements",
      "channel",
      "announcements",
      "Official updates and operational notices",
      "SaaS architecture launch announcements and system critical operations syncs.",
      ["m-stad", "m-joseph", "m-ray"],
      { favorite: true, typingUser: "John Doe" },
    ),
    conv("c-design-system", "channel", "design-system", "Design tokens, components and UI guidelines", "Design tokens, components and UI guidelines.", ["m-stad", "m-joseph"], { unread: 2 }),
    conv("c-engineering-sync", "channel", "engineering-sync", "Engineering updates and syncs", "Engineering updates, reviews and syncs.", ["m-joseph", "m-stad", "m-ray"], { unread: 1 }),
    conv("c-dev-qa", "channel", "dev-qa", "Development and QA coordination", "Development and QA coordination.", ["m-stad", "m-joseph"]),
    conv("c-marketing-ops", "channel", "marketing-ops", "Marketing operations", "Marketing operations and campaign planning.", ["m-shiela", "m-andrea", "m-benj", "m-stad"]),
    conv("dm-sarah", "dm", "Sarah Chen", "Direct message", "Direct message with Sarah Chen.", [], { unread: 1, peer: { name: "Sarah Chen", online: true } }),
    conv("dm-john", "dm", "John Doe", "Direct message", "Direct message with John Doe.", [], { peer: { name: "John Doe", online: true } }),
    conv("dm-liam", "dm", "Liam Johnson", "Direct message", "Direct message with Liam Johnson.", [], { peer: { name: "Liam Johnson", online: true } }),
  ];

  const messages: Record<ID, ChatMessage[]> = {
    "c-announcements": [
      {
        id: "msg-1",
        conversationId: "c-announcements",
        authorMemberId: "m-joseph",
        authorName: "Joseph Anthony",
        authorInitials: "JAD",
        body: "Hi everyone! The UI design systems branch has been finalized. We are ready to merge into main. Coding phase begins now.",
        createdAt: at(0, 10, 15),
        reactions: [
          { emoji: "👍", count: 4, reacted: false },
          { emoji: "🚀", count: 8, reacted: false },
        ],
        attachments: [],
      },
      {
        id: "msg-2",
        conversationId: "c-announcements",
        authorMemberId: "m-stad",
        authorName: "Stad Osuyos",
        authorInitials: "SO",
        body: "Excellent. I've initiated the setup for Screen 3 - Actions Kanban board. Let's make sure our tokens match perfectly.",
        createdAt: at(0, 10, 22),
        reactions: [],
        attachments: [],
      },
    ],
  };

  messages["c-design-system"] = [
    {
      id: "msg-ds-1",
      conversationId: "c-design-system",
      authorMemberId: "m-joseph",
      authorName: "Joseph Anthony",
      authorInitials: "JAD",
      body: "Design tokens are published. Please pull the latest before starting new components.",
      createdAt: minsAgo(34),
      reactions: [{ emoji: "👍", count: 2, reacted: false }],
      attachments: [],
    },
    {
      id: "msg-ds-2",
      conversationId: "c-design-system",
      authorMemberId: "m-joseph",
      authorName: "Joseph Anthony",
      authorInitials: "JAD",
      body: "Spacing scale and radii are in the same release.",
      createdAt: minsAgo(33),
      reactions: [],
      attachments: [],
    },
  ];
  messages["c-engineering-sync"] = [
    {
      id: "msg-es-1",
      conversationId: "c-engineering-sync",
      authorMemberId: "m-joseph",
      authorName: "Joseph Anthony",
      authorInitials: "JAD",
      body: "Reminder: the API review is on the calendar for this week.",
      createdAt: minsAgo(52),
      reactions: [],
      attachments: [],
    },
  ];
  messages["dm-sarah"] = [
    {
      id: "msg-dm-1",
      conversationId: "dm-sarah",
      authorName: "Sarah Chen",
      authorInitials: "SC",
      body: "Could you review the Actions board when you get a chance?",
      createdAt: minsAgo(18),
      reactions: [],
      attachments: [],
    },
  ];

  /* Document Center templates */
  const templates: ReportTemplate[] = [
    {
      id: "tpl-weekly",
      name: "Weekly Report",
      description: "Standard weekly progress tracking across engineering, marketing and product tasks.",
      updatedAt: "2026-08-14",
      kind: "standard",
      version: "v2.4",
      documentTitle: "Weekly Progress Sync",
      sections: [
        {
          heading: "High Level Executive Summary",
          body: "Briefly describe the key milestones achieved this week. Keep it confined to three core bullets that sync up with executive OKRs.",
        },
        {
          heading: "Metric Alignment & Goals",
          table: { columns: ["Metric Description", "Target"], rows: [["API Success Rate", ">99.9%"]] },
        },
        {
          heading: "Key Blockers",
          body: "Detail any cross-functional dependencies that might impact shipping velocities.",
        },
      ],
    },
    {
      id: "tpl-monthly",
      name: "Monthly Report",
      description: "Deep-dive operational metrics, revenue alignment, budget burn rate, and KPIs.",
      updatedAt: "2026-08-01",
      kind: "standard",
      version: "v1.8",
      documentTitle: "Monthly Operations Review",
      sections: [
        { heading: "Operational Metrics", body: "Summarize the month's operational performance against plan." },
        { heading: "Revenue Alignment", body: "Compare revenue to targets and note any variance drivers." },
        {
          heading: "Budget Burn Rate",
          table: { columns: ["Metric Description", "Target"], rows: [["Monthly burn", "On plan"]] },
        },
        { heading: "KPIs", body: "List the KPIs tracked this month and their status." },
      ],
    },
    {
      id: "tpl-incident",
      name: "Incident Report",
      description: "Root cause analysis, resolution times, post-mortem notes and service impact details.",
      updatedAt: "2026-07-28",
      kind: "custom",
      version: "v1.2",
      documentTitle: "Incident Post-Mortem",
      sections: [
        { heading: "Root Cause Analysis", body: "Describe what failed and why." },
        { heading: "Resolution Times", body: "Record detection, response and resolution timestamps." },
        { heading: "Post-Mortem Notes", body: "Capture what went well, what did not, and follow-up actions." },
        { heading: "Service Impact Details", body: "List affected services and customer impact." },
      ],
    },
    {
      id: "tpl-project",
      name: "Project Report",
      description: "Milestone check-ins, product scope status, blockages, and next-phase timelines.",
      updatedAt: "2026-07-15",
      kind: "custom",
      version: "v1.5",
      documentTitle: "Project Status Report",
      sections: [
        { heading: "Milestone Check-ins", body: "Summarize progress against each milestone." },
        { heading: "Product Scope Status", body: "Note any scope changes since the last report." },
        { heading: "Blockages", body: "Detail anything slowing the project down." },
        { heading: "Next-Phase Timelines", body: "Outline what ships next and when." },
      ],
    },
  ];

  const activity: ActivityItem[] = [
    {
      id: "a-1",
      at: minsAgo(12),
      actor: { name: "Stad Osuyos", initials: "SO" },
      text: "completed",
      object: "UI Refactoring for Actions Panel",
      objectHref: "/actions",
      objectTone: "link",
    },
    {
      id: "a-2",
      at: minsAgo(45),
      actor: { name: "Joseph Anthony", initials: "JAD" },
      text: "scheduled a new meeting:",
      object: "API Review & Sync",
      objectHref: "/calendar?event=e-apireview",
      objectTone: "strong",
    },
    {
      id: "a-3",
      at: minsAgo(60),
      system: true,
      text: "Budget request",
      object: "#BR-8049",
      objectTone: "link",
      suffix: "requires your review",
    },
  ];

  const notifications: AppNotification[] = [
    { id: "n-1", type: "budget", text: "Budget request #BR-8049 requires your review", at: minsAgo(60), read: false, href: "/" },
    { id: "n-2", type: "meetings", text: "Joseph Anthony scheduled a new meeting: API Review & Sync", at: minsAgo(45), read: false, href: "/calendar?event=e-apireview" },
    { id: "n-3", type: "messages", text: "2 new messages in #design-system", at: minsAgo(30), read: false, href: "/channels?c=c-design-system" },
    { id: "n-4", type: "tasks", text: "Docker Compose Setup was assigned to Joseph Anthony", at: minsAgo(180), read: true, href: "/actions?task=t-45" },
  ];

  return {
    members,
    accounts,
    tasks,
    events,
    conversations,
    messages,
    templates,
    drafts: [],
    activity,
    notifications,
    settings: {
      theme: "dark",
      reduceMotion: false,
      notifications: { messages: true, tasks: true, meetings: true, budget: true },
      primaryZoneId: "manila",
      secondaryZoneId: "chicago",
    },
    system: { apiVolume: { percent: 82 }, latency: { label: "Optimal", percent: 100 } },
    nextTicket: 49,
  };
}

type DbGlobals = {
  __teambaseDb?: Db;
  __teambaseDbVersion?: number;
  __teambasePool?: Pool;
  __teambaseSchemaReady?: Promise<void>;
};

const g = globalThis as unknown as DbGlobals;
const databaseUrl = process.env.DATABASE_URL;

function pool(): Pool {
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured");
  return (g.__teambasePool ??= new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined,
  }));
}

function normalizeDb(value: Db): Db {
  value.accounts ??= [];
  value.members ??= [];
  value.tasks ??= [];
  value.events ??= [];
  value.conversations ??= [];
  value.messages ??= {};
  value.templates ??= [];
  value.drafts ??= [];
  value.activity ??= [];
  value.notifications ??= [];
  value.nextTicket ??= 1;
  return value;
}

async function ensureSchema(): Promise<void> {
  if (!databaseUrl) return;
  g.__teambaseSchemaReady ??= (async () => {
    const db = pool();
    await db.query(`
      CREATE TABLE IF NOT EXISTS teambase_state (
        id SMALLINT PRIMARY KEY CHECK (id = 1),
        data JSONB NOT NULL,
        version BIGINT NOT NULL DEFAULT 1,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.query(
      `INSERT INTO teambase_state (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING`,
      [JSON.stringify(seed())],
    );
  })();
  return g.__teambaseSchemaReady;
}

/** Read the latest persisted application state. Local development falls back to memory when DATABASE_URL is absent. */
export async function getDb(): Promise<Db> {
  if (!databaseUrl) return (g.__teambaseDb ??= seed());
  await ensureSchema();
  const result = await pool().query<{ data: Db }>("SELECT data FROM teambase_state WHERE id = 1");
  if (!result.rows[0]) throw new Error("Teambase database state is missing");
  return normalizeDb(result.rows[0].data);
}

/**
 * Apply a mutation under a PostgreSQL row lock. This keeps concurrent creates and updates from overwriting each other.
 * The callback may throw; the transaction is rolled back and the error is handled by the API auth wrapper.
 */
export async function mutateDb<T>(mutate: (db: Db) => T | Promise<T>): Promise<T> {
  if (!databaseUrl) {
    const db = (g.__teambaseDb ??= seed());
    const result = await mutate(db);
    g.__teambaseDbVersion = (g.__teambaseDbVersion ?? 1) + 1;
    return result;
  }

  await ensureSchema();
  const client: PoolClient = await pool().connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query<{ data: Db }>("SELECT data FROM teambase_state WHERE id = 1 FOR UPDATE");
    if (!locked.rows[0]) throw new Error("Teambase database state is missing");
    const db = normalizeDb(locked.rows[0].data);
    const result = await mutate(db);
    await client.query(
      "UPDATE teambase_state SET data = $1::jsonb, version = version + 1, updated_at = NOW() WHERE id = 1",
      [JSON.stringify(db)],
    );
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getDbVersion(): Promise<number> {
  if (!databaseUrl) return g.__teambaseDbVersion ?? 1;
  await ensureSchema();
  const result = await pool().query<{ version: string }>("SELECT version FROM teambase_state WHERE id = 1");
  return Number(result.rows[0]?.version ?? 1);
}

/* ------------------------------ helpers ------------------------------ */

export function logActivity(db: Db, me: TeamMember, item: Omit<ActivityItem, "id" | "at" | "actor"> & { actor?: ActivityItem["actor"] }) {
  db.activity.unshift({
    id: newId("a"),
    at: new Date().toISOString(),
    actor: item.system ? undefined : (item.actor ?? { name: me.name, initials: me.initials }),
    ...item,
  });
  db.activity.length = Math.min(db.activity.length, 30);
}

/** Resolve live author name/initials for messages written by team members. */
export function resolveMessage(db: Db, msg: ChatMessage): ChatMessage {
  if (!msg.authorMemberId) return msg;
  const m = db.members.find((x) => x.id === msg.authorMemberId);
  return m ? { ...msg, authorName: m.name, authorInitials: m.initials } : msg;
}

/** DM peers that are team members take their presence from the directory. */
export function resolveConversation(db: Db, c: Conversation): Conversation {
  if (c.type !== "dm" || !c.peer?.memberId) return c;
  const m = db.members.find((x) => x.id === c.peer?.memberId);
  return m ? { ...c, name: m.name, peer: { ...c.peer, name: m.name, online: m.status === "active" } } : c;
}

export function wouldCreateCycle(db: Db, memberId: ID, newManagerId: ID | null): boolean {
  let cursor: ID | null = newManagerId;
  const seen = new Set<ID>();
  while (cursor) {
    if (cursor === memberId) return true;
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = db.members.find((m) => m.id === cursor)?.managerId ?? null;
  }
  return false;
}

export { makeInitials };
