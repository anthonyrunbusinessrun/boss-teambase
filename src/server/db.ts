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
import { migrateLegacyBoard, normalizeActions } from "./actions";
import { normalizeChat } from "./chat";
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
  Sprint,
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
  sprints: Sprint[];
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
    key: string,
    title: string,
    companyId: Task["companyId"],
    sprintId: ID | null,
    status: Task["status"],
    priority: Task["priority"],
    dueOffset: number,
    progress: number,
    assigneeId: ID | null,
    description: string,
  ): Task => ({ id: `t-${n}`, key, title, description, companyId, sprintId, status, priority, dueDate: dateOnly(dueOffset), progress, assigneeId, rev: 1, updatedAt: minsAgo(24 * 60) });

  const sprint = (id: ID, companyId: Sprint["companyId"], number: number, status: Sprint["status"], startOffset: number, endOffset: number, goal: string, extra: Partial<Sprint> = {}): Sprint => ({
    id, companyId, number, name: `Sprint ${number}`, goal, status, startDate: dateOnly(startOffset), endDate: dateOnly(endOffset), ...extra,
  });

  // Each company has its own sprints; the board shows the active one.
  const sprints: Sprint[] = [
    sprint("sp-boss-1", "boss", 1, "completed", -28, -15, "Foundations: CI, sign-in and the design tokens", { startedAt: at(-28, 9), completedAt: at(-15, 17), summary: { total: 3, done: 3, moved: 0 } }),
    sprint("sp-boss-2", "boss", 2, "active", -6, 7, "Ship the Actions board and the Channels revamp", { startedAt: at(-6, 9) }),
    sprint("sp-boss-3", "boss", 3, "planned", 8, 21, "Notifications and reporting polish"),
    sprint("sp-rli-1", "rli", 1, "active", -4, 9, "Close the quarter: budget, vendors and reporting", { startedAt: at(-4, 9) }),
    sprint("sp-ll-1", "ll", 1, "active", -3, 10, "Stabilise routes and fleet upkeep", { startedAt: at(-3, 9) }),
    sprint("sp-ll-2", "ll", 2, "planned", 11, 24, "Warehouse intake and driver onboarding"),
  ];

  const tasks: Task[] = [
    // BOSS — Sprint 2 (active)
    task(44, "TB-44", "Database Index Tuning", "boss", "sp-boss-2", "todo", "medium", 2, 0, "m-stad", "Review slow queries and add the missing indexes."),
    task(45, "TB-45", "Docker Compose Setup", "boss", "sp-boss-2", "todo", "low", 6, 0, "m-joseph", "Containerize the local development stack."),
    task(46, "TB-46", "API Payload Validation", "boss", "sp-boss-2", "todo", "high", 0, 15, "m-joseph", "Validate request payloads at the API boundary."),
    task(48, "TB-48", "Actions Panel Refactor", "boss", "sp-boss-2", "in-progress", "high", -2, 65, "m-stad", "Rebuilding the Jira bento Kanban architecture to strictly support fluid cross-axis layouts and precise material design shadows."),
    task(47, "TB-47", "Budget Service Integration Audit", "boss", "sp-boss-2", "review", "medium", -3, 90, "m-stad", "Audit the budget service integration before sign-off."),
    task(49, "BOSS-49", "Design token audit", "boss", "sp-boss-2", "done", "low", -4, 100, "m-stad", "Verified every colour and spacing token against the design system."),
    // BOSS — Sprint 3 (planned) and unscheduled
    task(50, "BOSS-50", "Notification preferences screen", "boss", "sp-boss-3", "todo", "medium", 12, 0, "m-andrea", "Let people choose what shows up in the bell."),
    task(51, "BOSS-51", "Document the realtime architecture", "boss", null, "todo", "low", 20, 0, null, "How presence, typing and board updates reach every browser."),
    // BOSS — Sprint 1 (completed)
    task(52, "BOSS-52", "Set up the CI pipeline", "boss", "sp-boss-1", "done", "high", -20, 100, "m-joseph", "Lint, type-check and build on every push."),
    task(53, "BOSS-53", "Sign-in page", "boss", "sp-boss-1", "done", "medium", -18, 100, "m-stad", "Email and password sign-in."),
    task(54, "BOSS-54", "Design system tokens", "boss", "sp-boss-1", "done", "medium", -17, 100, "m-stad", "Colours, type and spacing as CSS variables."),
    // RLI — Sprint 1 (active) and unscheduled
    task(55, "RLI-55", "Q4 budget review", "rli", "sp-rli-1", "in-progress", "high", 2, 55, "m-ereika", "Review departmental budgets against the Q4 forecast."),
    task(56, "RLI-56", "Vendor contract renewals", "rli", "sp-rli-1", "todo", "medium", 5, 0, "m-ray", "Renegotiate the three contracts that expire this quarter."),
    task(57, "RLI-57", "Publish the quarterly report", "rli", "sp-rli-1", "review", "medium", 1, 85, "m-andrea", "Final read-through before it goes to the board."),
    task(58, "RLI-58", "Close the September books", "rli", "sp-rli-1", "done", "high", -3, 100, "m-ereika", "Reconcile accounts and sign off the month."),
    task(59, "RLI-59", "Review insurance coverage", "rli", null, "todo", "low", 25, 0, null, "Compare current cover with the new headcount."),
    // LL — Sprint 1 (active), Sprint 2 (planned)
    task(60, "LL-60", "Route optimisation audit", "ll", "sp-ll-1", "in-progress", "high", 3, 40, "m-benj", "Find the routes that burn the most fuel per delivery."),
    task(61, "LL-61", "Fleet maintenance schedule", "ll", "sp-ll-1", "todo", "medium", 4, 0, "m-shiela", "Plan service windows so no more than two trucks are out at once."),
    task(62, "LL-62", "Warehouse intake checklist", "ll", "sp-ll-1", "review", "low", 2, 80, "m-shiela", "Standardise how incoming pallets are checked."),
    task(63, "LL-63", "Driver onboarding pack", "ll", "sp-ll-1", "done", "medium", -2, 100, "m-benj", "Welcome guide, safety rules and route basics."),
    task(64, "LL-64", "Fuel cost dashboard", "ll", "sp-ll-2", "todo", "medium", 15, 0, "m-benj", "Track fuel spend per route and per vehicle."),
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
      { favorite: true },
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
        receipts: {},
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
        receipts: {},
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
      receipts: {},
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
      receipts: {},
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
      receipts: {},
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
      receipts: {},
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
    sprints,
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
    nextTicket: 65,
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

/** Connection settings, shared by the pool and the dedicated LISTEN connection used by the realtime layer. */
export function connectionConfig() {
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured");
  return { connectionString: databaseUrl, ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined };
}

export const hasDatabase = (): boolean => !!databaseUrl;

export function getPool(): Pool {
  return (g.__teambasePool ??= new Pool({ ...connectionConfig(), max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 }));
}
const pool = getPool;

function normalizeDb(value: Db): Db {
  value.accounts ??= [];
  value.members ??= [];
  value.tasks ??= [];
  value.sprints ??= [];
  value.events ??= [];
  value.conversations ??= [];
  value.messages ??= {};
  value.templates ??= [];
  value.drafts ??= [];
  value.activity ??= [];
  value.notifications ??= [];
  value.nextTicket ??= 1;
  normalizeActions(value);
  normalizeChat(value);
  return value;
}

async function ensureSchema(): Promise<void> {
  if (!databaseUrl) return;
  g.__teambaseSchemaReady ??= (async () => {
    const db = pool();
    const lock = await db.connect();
    try {
      await lock.query("SELECT pg_advisory_lock(727001)");
      await lock.query(`
      CREATE TABLE IF NOT EXISTS teambase_state (
        id SMALLINT PRIMARY KEY CHECK (id = 1),
        data JSONB NOT NULL,
        version BIGINT NOT NULL DEFAULT 1,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
      await lock.query(
        `INSERT INTO teambase_state (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING`,
        [JSON.stringify(seed())],
      );
      // Boards saved before sprints existed: the single old board becomes BOSS's "Sprint 1" (once, persisted).
      await lock.query("BEGIN");
      const current = await lock.query<{ data: Db }>("SELECT data FROM teambase_state WHERE id = 1 FOR UPDATE");
      if (current.rows[0] && migrateLegacyBoard(current.rows[0].data, new Date().toISOString())) {
        await lock.query("UPDATE teambase_state SET data = $1::jsonb, version = version + 1, updated_at = NOW() WHERE id = 1", [JSON.stringify(current.rows[0].data)]);
      }
      await lock.query("COMMIT");
      // Who is connected right now (one row per open browser connection; stale rows expire). Ephemeral by design:
      // presence changes every few seconds and must never go through the single locked state row.
      await lock.query(`
        CREATE TABLE IF NOT EXISTS teambase_presence (
          conn_id TEXT PRIMARY KEY,
          member_id TEXT NOT NULL,
          instance_id TEXT NOT NULL,
          last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await lock.query("CREATE INDEX IF NOT EXISTS teambase_presence_member_idx ON teambase_presence (member_id)");
      // Chat attachments. The bytes live here (not in the JSON state); messages only reference them by id.
      await lock.query(`
        CREATE TABLE IF NOT EXISTS teambase_attachments (
          id TEXT PRIMARY KEY,
          uploader_id TEXT NOT NULL,
          name TEXT NOT NULL,
          mime TEXT NOT NULL,
          kind TEXT NOT NULL,
          size INTEGER NOT NULL,
          data BYTEA NOT NULL,
          conversation_id TEXT,
          message_id TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await lock.query("CREATE INDEX IF NOT EXISTS teambase_attachments_message_idx ON teambase_attachments (message_id)");
      await lock.query("CREATE INDEX IF NOT EXISTS teambase_attachments_conversation_idx ON teambase_attachments (conversation_id)");
    } finally {
      await lock.query("SELECT pg_advisory_unlock(727001)").catch(() => undefined);
      lock.release();
    }
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
