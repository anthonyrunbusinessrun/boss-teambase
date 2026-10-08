import { getDb } from "@/server/db";
import { ok } from "@/server/http";
import type { WeeklyMetric } from "@/types/models";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";

// Mock weekly baselines (stand-in for a real analytics service). The first three
// numbers move with the work in the active sprints so "Create Task" is visible on the dashboard.
const BASE = { todo: 12, inProgress: 8, done: 15, completed: 94 };
// What the seeded active sprints hold, so a fresh install shows exactly the BASE numbers above.
const SEED = { todo: 5, inProgress: 3, done: 3 };

export const GET = authed(async () => {
  const { tasks, sprints } = await getDb();
  const active = new Set(sprints.filter((s) => s.status === "active").map((s) => s.id));
  const live = tasks.filter((t) => t.sprintId && active.has(t.sprintId));
  const count = (status: string) => live.filter((t) => t.status === status).length;
  const metrics: WeeklyMetric[] = [
    { key: "todo", label: "Todo Tasks", value: Math.max(0, BASE.todo + count("todo") - SEED.todo), delta: -4 },
    { key: "in-progress", label: "In Progress", value: Math.max(0, BASE.inProgress + count("in-progress") - SEED.inProgress), delta: 12 },
    { key: "done", label: "Done", value: Math.max(0, BASE.done + count("done") - SEED.done), delta: 24 },
    { key: "completed", label: "Completed this Week", value: BASE.completed, delta: 8, percent: true },
  ];
  return ok(metrics);
});
