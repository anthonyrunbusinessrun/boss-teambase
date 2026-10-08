/** Pure helpers for the Actions board and sprints screens (no React), so the rules are easy to test. */
import { addDaysKey, formatKeyMonthDay } from "./time";
import type { Sprint, Task, TaskStatus } from "@/types/models";

export const STATUS_TEXT: Record<TaskStatus, string> = { todo: "To Do", "in-progress": "In Progress", review: "Review", done: "Done" };

/**
 * Applies newer versions of tasks to what's on screen. A task only replaces the local copy if its revision is the same or newer,
 * so a late-arriving older update can never undo a newer change (and our own optimistic edit is replaced by the server's copy).
 */
export function mergeTasks(current: Task[], incoming: Task[]): Task[] {
  const byId = new Map(current.map((t) => [t.id, t]));
  for (const t of incoming) {
    const have = byId.get(t.id);
    if (!have || t.rev >= have.rev) byId.set(t.id, t);
  }
  return Array.from(byId.values());
}

/** What the board shows immediately when you move a card — the same rules the server applies, so there's no visible jump. */
export function withStatus(task: Task, status: TaskStatus): Task {
  if (status === task.status) return task;
  const progress = status === "done" ? 100 : task.status === "done" && task.progress === 100 ? 90 : task.progress;
  return { ...task, status, progress };
}

export interface RemoteChange {
  by: string;
  change: "created" | "updated" | "deleted";
  /** What we had before (absent for a task we hadn't seen). */
  prev?: Task;
  /** What it is now (absent when it was deleted or left this board). */
  next?: Task;
  /** Name of the sprint `next` is in, or null for unscheduled. */
  sprintName?: string | null;
}

/** "Bob moved BOSS-49 to Review" — the one-line announcement when someone else changes the board. */
export function describeRemoteChange({ by, change, prev, next, sprintName }: RemoteChange): string {
  if (change === "created" && next) return `${by} added ${next.key}`;
  if (change === "deleted" || !next) return `${by} ${prev ? `removed ${prev.key}` : "removed a task"}`;
  if (prev && prev.status !== next.status) return `${by} moved ${next.key} to ${STATUS_TEXT[next.status]}`;
  if (prev && prev.sprintId !== next.sprintId) return `${by} moved ${next.key} to ${sprintName ?? "Unscheduled"}`;
  return `${by} updated ${next.key}`;
}

/** Whole days from `todayKey` to the sprint's last day (0 = ends today, negative = overdue). */
export function daysLeft(sprint: Pick<Sprint, "endDate">, todayKey: string): number {
  let n = 0;
  for (let key = todayKey; key < sprint.endDate && n < 3660; n++) key = addDaysKey(key, 1);
  if (todayKey > sprint.endDate) for (let key = sprint.endDate; key < todayKey && n > -3660; n--) key = addDaysKey(key, 1);
  return n;
}

export function daysLeftText(sprint: Pick<Sprint, "endDate">, todayKey: string): string {
  const n = daysLeft(sprint, todayKey);
  if (n > 1) return `${n} days left`;
  if (n === 1) return "1 day left";
  if (n === 0) return "Ends today";
  return `${-n} day${n === -1 ? "" : "s"} overdue`;
}

/** "Oct 5 – Oct 19" */
export const sprintRange = (s: Pick<Sprint, "startDate" | "endDate">): string => `${formatKeyMonthDay(s.startDate)} – ${formatKeyMonthDay(s.endDate)}`;

export interface StatusCounts {
  todo: number;
  "in-progress": number;
  review: number;
  done: number;
  total: number;
}

export function countByStatus(tasks: Pick<Task, "status">[]): StatusCounts {
  const c: StatusCounts = { todo: 0, "in-progress": 0, review: 0, done: 0, total: tasks.length };
  for (const t of tasks) c[t.status] += 1;
  return c;
}

/** Percent of tasks done (0 when there are none). */
export const percentDone = (c: Pick<StatusCounts, "done" | "total">): number => (c.total ? Math.round((c.done / c.total) * 100) : 0);
