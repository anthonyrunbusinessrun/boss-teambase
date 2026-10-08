/**
 * Actions rules — companies, sprints and tasks — as pure functions over the application state (no I/O), so every rule is unit-testable.
 *
 * The model, in Jira terms:
 *  - A **company** (BOSS · RLI · LL) is a top-level folder. Every task and every sprint belongs to exactly one.
 *  - A **sprint** is a time-boxed container of work: planned → active → completed. A company has at most ONE active sprint.
 *  - The **board** shows the active sprint's tasks in four columns (To Do · In Progress · Review · Done).
 *  - Work that isn't in a sprint yet is *unscheduled* (`sprintId: null`). That is not a status — there is no Backlog status.
 */
import { randomUUID } from "node:crypto";
import { COMPANIES, getCompany, isCompanyId } from "@/config/companies";
import { addDaysKey, keyToUtc } from "@/lib/time";
import type { Db } from "./db";
import type { CompanyId, CompanySummary, ID, Priority, Sprint, Task, TaskStatus } from "@/types/models";

export const STATUSES: readonly TaskStatus[] = ["todo", "in-progress", "review", "done"];
export const PRIORITIES: readonly Priority[] = ["high", "medium", "low"];
export const isStatus = (v: unknown): v is TaskStatus => STATUSES.includes(v as TaskStatus);
export const isPriority = (v: unknown): v is Priority => PRIORITIES.includes(v as Priority);

export const STATUS_LABELS: Record<TaskStatus, string> = { todo: "To Do", "in-progress": "In Progress", review: "Review", done: "Done" };

const EPOCH = "1970-01-01T00:00:00.000Z";
export const LEGACY_SPRINT_ID = "sp_legacy_boss";
export const SPRINT_DEFAULT_DAYS = 14;

type Loose<T> = { [K in keyof T]?: T[K] | undefined };
type Result<T> = ({ ok: true } & T) | { ok: false; error: string; status: number };
const fail = (error: string, status = 400): { ok: false; error: string; status: number } => ({ ok: false, error, status });

export function isDateKey(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = keyToUtc(v);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v; // rejects 2026-02-31 and out-of-range dates without throwing
}

/* ------------------------------ migration ------------------------------ */

/**
 * Brings older saved state up to date on every read. Structural and idempotent — it never reads the clock, so reading twice
 * gives identical results: the removed "backlog" status becomes "todo", missing fields get defaults.
 */
export function normalizeActions(db: Db): void {
  db.sprints ??= [];
  for (const t of db.tasks) {
    const status = t.status as string;
    if (status === "backlog" || !isStatus(status)) t.status = "todo";
    if (!isCompanyId(t.companyId)) t.companyId = "boss";
    if ((t.sprintId as ID | null | undefined) === undefined) t.sprintId = null;
    t.rev ??= 1;
    t.updatedAt ??= EPOCH;
  }
}

/**
 * One-time upgrade of a board saved before sprints existed (run once, when the schema is prepared, and persisted):
 * everything that was on the single old board becomes BOSS's "Sprint 1", active — so nothing disappears from the board.
 * Returns whether anything changed.
 */
export function migrateLegacyBoard(db: Db, nowIso: string): boolean {
  db.sprints ??= [];
  const legacy = db.tasks.filter((t) => (t.sprintId as ID | null | undefined) === undefined);
  if (!legacy.length) return false;
  let sprint = db.sprints.find((s) => s.id === LEGACY_SPRINT_ID);
  if (!sprint) {
    const start = nowIso.slice(0, 10);
    sprint = { id: LEGACY_SPRINT_ID, companyId: "boss", number: 1, name: "Sprint 1", goal: "", status: "active", startDate: start, endDate: addDaysKey(start, SPRINT_DEFAULT_DAYS), startedAt: nowIso };
    db.sprints.push(sprint);
  }
  for (const t of legacy) {
    t.companyId = "boss";
    if ((t.status as string) === "backlog") t.status = "todo";
    t.sprintId = sprint.id;
  }
  return true;
}

/* ------------------------------ lookups ------------------------------ */

export const sprintsOf = (db: Db, companyId: CompanyId): Sprint[] => db.sprints.filter((s) => s.companyId === companyId);
export const activeSprintOf = (db: Db, companyId: CompanyId): Sprint | undefined => db.sprints.find((s) => s.companyId === companyId && s.status === "active");

export function summarize(db: Db): CompanySummary[] {
  return COMPANIES.map((c) => {
    const active = activeSprintOf(db, c.id);
    const inSprint = active ? db.tasks.filter((t) => t.sprintId === active.id) : [];
    return {
      id: c.id,
      activeSprint: active ? { id: active.id, name: active.name, startDate: active.startDate, endDate: active.endDate } : null,
      sprintCount: sprintsOf(db, c.id).length,
      open: inSprint.filter((t) => t.status !== "done").length,
      done: inSprint.filter((t) => t.status === "done").length,
      unscheduled: db.tasks.filter((t) => t.companyId === c.id && t.sprintId === null).length,
    };
  });
}

/** Where a task lives: its board if it's in the active sprint, otherwise the sprints screen. */
export function taskHref(db: Db, task: Pick<Task, "id" | "companyId" | "sprintId">): string {
  const onBoard = !!task.sprintId && activeSprintOf(db, task.companyId)?.id === task.sprintId;
  return `/actions/${task.companyId}/${onBoard ? "board" : "sprints"}?task=${task.id}`;
}

/* ------------------------------ tasks ------------------------------ */

/** Can this work be placed in `sprintId` of `companyId`? (`current` = where it is now, so leaving it where it is is always fine.) */
export function placementError(db: Db, companyId: CompanyId, sprintId: ID | null, current?: ID | null): string | null {
  if (sprintId === null) return null;
  const sprint = db.sprints.find((s) => s.id === sprintId);
  if (!sprint) return "That sprint no longer exists.";
  if (sprint.companyId !== companyId) return "That sprint belongs to a different company.";
  if (sprint.status === "completed" && sprintId !== current) return "That sprint is completed. Choose an active or planned sprint.";
  return null;
}

/** Validates the task fields present in `body`. Only provided fields are returned. */
export function parseTaskFields(db: Db, body: Record<string, unknown>): Result<{ fields: Loose<Task> }> {
  const f: Loose<Task> = {};
  if ("title" in body) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return fail("Title is required");
    if (title.length > 200) return fail("Keep the title under 200 characters.");
    f.title = title;
  }
  if ("description" in body) f.description = typeof body.description === "string" ? body.description.trim().slice(0, 5000) : "";
  if ("status" in body) {
    if (!isStatus(body.status)) return fail("Status must be To Do, In Progress, Review or Done.");
    f.status = body.status;
  }
  if ("priority" in body) {
    if (!isPriority(body.priority)) return fail("Invalid priority");
    f.priority = body.priority;
  }
  if ("dueDate" in body) {
    if (!isDateKey(body.dueDate)) return fail("Due date must be a valid date");
    f.dueDate = body.dueDate;
  }
  if ("progress" in body) {
    const n = Number(body.progress);
    if (!Number.isFinite(n)) return fail("Progress must be a number");
    f.progress = Math.min(100, Math.max(0, Math.round(n)));
  }
  if ("assigneeId" in body) {
    const id = typeof body.assigneeId === "string" && body.assigneeId ? body.assigneeId : null;
    if (id && !db.members.some((m) => m.id === id)) return fail("Assignee not found");
    f.assigneeId = id;
  }
  if ("companyId" in body) {
    if (!isCompanyId(body.companyId)) return fail("Choose a company: BOSS, RLI or LL.");
    f.companyId = body.companyId;
  }
  if ("sprintId" in body) {
    if (body.sprintId !== null && typeof body.sprintId !== "string") return fail("Invalid sprint");
    f.sprintId = body.sprintId === "" ? null : (body.sprintId as ID | null);
  }
  return { ok: true, fields: f };
}

/** Next ticket key for a company, e.g. BOSS-49. Shares one counter across companies, so keys are unique everywhere. */
const nextKey = (db: Db, companyId: CompanyId) => `${getCompany(companyId).code}-${db.nextTicket++}`;

export function createTask(db: Db, fields: Loose<Task>, by: ID, nowIso: string): Result<{ task: Task }> {
  const companyId = fields.companyId ?? "boss";
  // Omitted sprint → the company's active sprint, so the new work appears on its board. `null` means "unscheduled".
  const sprintId = fields.sprintId === undefined ? (activeSprintOf(db, companyId)?.id ?? null) : fields.sprintId;
  const error = placementError(db, companyId, sprintId);
  if (error) return fail(error);
  const status = fields.status ?? "todo";
  const task: Task = {
    id: `t-${db.nextTicket}`,
    key: nextKey(db, companyId),
    title: fields.title ?? "",
    description: fields.description ?? "",
    companyId,
    sprintId,
    status,
    priority: fields.priority ?? "medium",
    dueDate: fields.dueDate ?? nowIso.slice(0, 10),
    progress: status === "done" ? 100 : (fields.progress ?? 0),
    assigneeId: fields.assigneeId ?? null,
    rev: 1,
    updatedAt: nowIso,
    updatedBy: by,
  };
  db.tasks.push(task);
  return { ok: true, task };
}

export interface TaskUpdate {
  task: Task;
  before: { status: TaskStatus; companyId: CompanyId; sprintId: ID | null };
}

/** Applies validated fields to a task: placement rules, "done" ⇒ 100%, re-keying on a company change, and a new revision. */
export function updateTask(db: Db, task: Task, fields: Loose<Task>, by: ID, nowIso: string): Result<TaskUpdate> {
  const before = { status: task.status, companyId: task.companyId, sprintId: task.sprintId };
  const nextCompany = fields.companyId ?? task.companyId;
  const companyChanged = nextCompany !== task.companyId;
  const nextSprint = fields.sprintId !== undefined ? fields.sprintId : companyChanged ? null : task.sprintId;
  if (companyChanged || nextSprint !== task.sprintId) {
    const error = placementError(db, nextCompany, nextSprint, task.sprintId);
    if (error) return fail(error);
  }
  const { companyId: _c, sprintId: _s, ...rest } = fields;
  void _c;
  void _s;
  Object.assign(task, rest);
  if (companyChanged) {
    task.companyId = nextCompany;
    task.key = nextKey(db, nextCompany);
  }
  task.sprintId = nextSprint;
  if (fields.status && fields.status !== before.status && fields.progress === undefined) {
    if (fields.status === "done") task.progress = 100;
    else if (before.status === "done" && task.progress === 100) task.progress = 90;
  }
  task.rev += 1;
  task.updatedAt = nowIso;
  task.updatedBy = by;
  return { ok: true, task, before };
}

/* ------------------------------ sprints ------------------------------ */

const newSprintId = () => `sp_${randomUUID().slice(0, 8)}`;

/** Validates the sprint fields present in `body`. For a new sprint pass `base` so dates can be cross-checked. */
export function parseSprintFields(body: Record<string, unknown>, base?: Pick<Sprint, "startDate" | "endDate">): Result<{ fields: Loose<Sprint> }> {
  const f: Loose<Sprint> = {};
  if ("name" in body) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return fail("Give the sprint a name.");
    if (name.length > 60) return fail("Keep the sprint name under 60 characters.");
    f.name = name;
  }
  if ("goal" in body) {
    const goal = typeof body.goal === "string" ? body.goal.trim() : "";
    if (goal.length > 300) return fail("Keep the sprint goal under 300 characters.");
    f.goal = goal;
  }
  if ("startDate" in body) {
    if (!isDateKey(body.startDate)) return fail("Pick a valid start date.");
    f.startDate = body.startDate;
  }
  if ("endDate" in body) {
    if (!isDateKey(body.endDate)) return fail("Pick a valid end date.");
    f.endDate = body.endDate;
  }
  const start = f.startDate ?? base?.startDate;
  const end = f.endDate ?? base?.endDate;
  if (start && end && end < start) return fail("The sprint can't end before it starts.");
  return { ok: true, fields: f };
}

export function createSprint(db: Db, companyId: CompanyId, fields: Loose<Sprint>, todayKey: string): Sprint {
  const number = Math.max(0, ...sprintsOf(db, companyId).map((s) => s.number)) + 1;
  const startDate = fields.startDate ?? todayKey;
  const sprint: Sprint = {
    id: newSprintId(), companyId, number, name: fields.name ?? `Sprint ${number}`, goal: fields.goal ?? "", status: "planned",
    startDate, endDate: fields.endDate ?? addDaysKey(startDate, SPRINT_DEFAULT_DAYS),
  };
  db.sprints.push(sprint);
  return sprint;
}

/** Starts a planned sprint (optionally adjusting its name/goal/dates in the same step). A company can have one active sprint. */
export function startSprint(db: Db, id: ID, fields: Loose<Sprint>, nowIso: string): Result<{ sprint: Sprint }> {
  const sprint = db.sprints.find((s) => s.id === id);
  if (!sprint) return fail("Sprint not found", 404);
  if (sprint.status !== "planned") return fail(sprint.status === "active" ? "That sprint has already started." : "A completed sprint can't be restarted.", 409);
  const running = activeSprintOf(db, sprint.companyId);
  if (running) return fail(`${running.name} is still active. Complete it before starting another sprint.`, 409);
  const startDate = fields.startDate ?? sprint.startDate;
  const endDate = fields.endDate ?? sprint.endDate;
  if (endDate < startDate) return fail("The sprint can't end before it starts.");
  Object.assign(sprint, fields, { status: "active" as const, startedAt: nowIso, startDate, endDate });
  return { ok: true, sprint };
}

/**
 * Completes the active sprint. Finished work stays in it as history; unfinished work moves to `moveTo`
 * (a planned sprint of the same company) or, when `moveTo` is null, back to unscheduled.
 */
export function completeSprint(db: Db, id: ID, moveTo: ID | null, nowIso: string, by: ID): Result<{ sprint: Sprint; movedIds: ID[] }> {
  const sprint = db.sprints.find((s) => s.id === id);
  if (!sprint) return fail("Sprint not found", 404);
  if (sprint.status !== "active") return fail("Only the active sprint can be completed.", 409);
  if (moveTo !== null) {
    const target = db.sprints.find((s) => s.id === moveTo);
    if (!target || target.companyId !== sprint.companyId || target.status !== "planned") return fail("Unfinished work can only move to a planned sprint of the same company, or back to unscheduled.");
  }
  const inSprint = db.tasks.filter((t) => t.sprintId === id);
  const unfinished = inSprint.filter((t) => t.status !== "done");
  for (const t of unfinished) {
    t.sprintId = moveTo;
    t.rev += 1;
    t.updatedAt = nowIso;
    t.updatedBy = by;
  }
  sprint.status = "completed";
  sprint.completedAt = nowIso;
  sprint.summary = { total: inSprint.length, done: inSprint.length - unfinished.length, moved: unfinished.length };
  return { ok: true, sprint, movedIds: unfinished.map((t) => t.id) };
}

/** Deletes a planned sprint; its work goes back to unscheduled. Active and completed sprints are kept (they're the record). */
export function deleteSprint(db: Db, id: ID, nowIso: string, by: ID): Result<{ sprint: Sprint; movedIds: ID[] }> {
  const index = db.sprints.findIndex((s) => s.id === id);
  if (index < 0) return fail("Sprint not found", 404);
  const sprint = db.sprints[index];
  if (sprint.status !== "planned") return fail(sprint.status === "active" ? "Complete the active sprint instead of deleting it." : "Completed sprints are kept as a record.", 409);
  const moved = db.tasks.filter((t) => t.sprintId === id);
  for (const t of moved) {
    t.sprintId = null;
    t.rev += 1;
    t.updatedAt = nowIso;
    t.updatedBy = by;
  }
  db.sprints.splice(index, 1);
  return { ok: true, sprint, movedIds: moved.map((t) => t.id) };
}
