import { getDb } from "@/server/db";
import { ok } from "@/server/http";
import type { WeeklyMetric } from "@/types/models";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";

// Mock weekly baselines (stand-in for a real analytics service). The first three
// numbers move with the live task board so "Create Task" is visible on the dashboard.
const BASE = { todo: 12, inProgress: 8, done: 15, completed: 94 };
const SEED_OPEN = 3; // backlog + to do in the seed board
const SEED_IN_PROGRESS = 1;

export const GET = authed(async () => {
  const { tasks } = getDb();
  const open = tasks.filter((t) => t.status === "backlog" || t.status === "todo").length;
  const inProgress = tasks.filter((t) => t.status === "in-progress").length;
  const metrics: WeeklyMetric[] = [
    { key: "todo", label: "Todo Tasks", value: Math.max(0, BASE.todo + open - SEED_OPEN), delta: -4 },
    { key: "in-progress", label: "In Progress", value: Math.max(0, BASE.inProgress + inProgress - SEED_IN_PROGRESS), delta: 12 },
    { key: "done", label: "Done", value: BASE.done, delta: 24 },
    { key: "completed", label: "Completed this Week", value: BASE.completed, delta: 8, percent: true },
  ];
  return ok(metrics);
});
