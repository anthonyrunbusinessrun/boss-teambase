"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/providers/AppProvider";
import { useRealtimeEvents } from "@/providers/RealtimeProvider";
import { useToast } from "@/providers/ToastProvider";
import { companyService, errorMessage, sprintService, taskService } from "@/services";
import { STATUS_TEXT, describeRemoteChange, mergeTasks, withStatus } from "@/lib/board";
import type { CompanyId, CompanySummary, ID, RealtimeEvent, Sprint, Task, TaskStatus } from "@/types/models";

interface Announcement {
  id: number;
  text: string;
}

export interface ActionsData {
  company: CompanyId;
  tasks: Task[];
  sprints: Sprint[];
  /** Overview of all three companies (for the folder cards). */
  summaries: CompanySummary[];
  loading: boolean;
  error?: string;
  activeSprint?: Sprint;
  /** Ids of tasks someone else just changed (briefly highlighted). */
  flash: ReadonlySet<ID>;
  /** "Bob moved BOSS-49 to Review" — the latest change by somebody else. */
  announcement: Announcement | null;
  reload: () => Promise<void>;
  /** Move a card to another column (optimistic, rolled back if the server refuses). */
  moveTask: (id: ID, status: TaskStatus) => Promise<void>;
  /** Plan a task into a sprint, or back to unscheduled with `null`. */
  setTaskSprint: (id: ID, sprintId: ID | null) => Promise<boolean>;
  upsertTask: (task: Task) => void;
  removeTask: (id: ID) => void;
  upsertSprint: (sprint: Sprint) => void;
  /** Re-fetches this company's sprints and returns them. */
  refreshSprints: () => Promise<Sprint[]>;
  refreshTasks: () => Promise<void>;
}

const Ctx = createContext<ActionsData | null>(null);

export function useActions(): ActionsData {
  const v = useContext(Ctx);
  if (!v) throw new Error("useActions must be used inside <ActionsProvider>");
  return v;
}

/**
 * One company's board + sprints, kept in sync with everyone else's changes over the app's live connection.
 * Mount it with `key={company}` so switching companies starts clean.
 */
export function ActionsProvider({ company, children }: { company: CompanyId; children: React.ReactNode }) {
  const { me } = useApp();
  const toast = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [summaries, setSummaries] = useState<CompanySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [flash, setFlash] = useState<ReadonlySet<ID>>(() => new Set());
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);

  // Latest copies for use inside async callbacks without re-creating them.
  const tasksRef = useRef(tasks);
  const sprintsRef = useRef(sprints);
  useEffect(() => {
    tasksRef.current = tasks;
    sprintsRef.current = sprints;
  });
  const counter = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };

  /* ----- loading ----- */
  const loadAll = useCallback(async () => {
    try {
      const [t, s, c] = await Promise.all([taskService.list({ company }), sprintService.list(company), companyService.list()]);
      setTasks(t);
      setSprints(s);
      setSummaries(c);
      setError(undefined);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [company]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([taskService.list({ company }), sprintService.list(company), companyService.list()])
      .then(([t, s, c]) => {
        if (cancelled) return;
        setTasks(t);
        setSprints(s);
        setSummaries(c);
        setError(undefined);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(errorMessage(e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [company]);

  const refreshSprints = useCallback(async (): Promise<Sprint[]> => {
    try {
      const fresh = await sprintService.list(company);
      setSprints(fresh);
      return fresh;
    } catch {
      return sprintsRef.current; // a later event or reconnect will catch up
    }
  }, [company]);

  const refreshTasks = useCallback(async () => {
    try {
      const fresh = await taskService.list({ company });
      setTasks((cur) => mergeTasks(cur.filter((t) => fresh.some((f) => f.id === t.id)), fresh));
    } catch {
      /* ditto */
    }
  }, [company]);

  const summaryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refreshSummaries = useCallback(() => {
    clearTimeout(summaryTimer.current);
    summaryTimer.current = setTimeout(() => void companyService.list().then(setSummaries).catch(() => undefined), 400);
  }, []);
  useEffect(() => () => clearTimeout(summaryTimer.current), []);

  /* ----- announcing other people's changes ----- */
  const announce = useCallback((text: string, ids: ID[]) => {
    counter.current += 1;
    const id = counter.current;
    setAnnouncement({ id, text });
    later(() => setAnnouncement((cur) => (cur?.id === id ? null : cur)), 8000);
    if (ids.length) {
      setFlash((cur) => new Set([...cur, ...ids]));
      later(() => setFlash((cur) => new Set([...cur].filter((x) => !ids.includes(x)))), 1800);
    }
  }, []);

  /* ----- live events ----- */
  const applyTaskEvent = useCallback(
    async (ev: Extract<RealtimeEvent, { type: "task" }>) => {
      let fetched: Task[];
      try {
        fetched = await taskService.list({ ids: ev.taskIds });
      } catch {
        void loadAll(); // couldn't fetch the changes — resync everything
        return;
      }
      const before = new Map(tasksRef.current.map((t) => [t.id, t]));
      const here = fetched.filter((t) => t.companyId === company); // a task moved to another company leaves this board
      setTasks((cur) => mergeTasks(cur.filter((t) => !ev.taskIds.includes(t.id) || here.some((f) => f.id === t.id)), here));
      refreshSummaries();

      if (ev.byId === me.id) return; // our own change — we already see it
      if (ev.taskIds.length > 1) return announce(`${ev.by} updated ${ev.taskIds.length} tasks`, ev.taskIds);
      const id = ev.taskIds[0];
      const next = here.find((t) => t.id === id);
      const prev = before.get(id);
      const sprintName = next?.sprintId ? (sprintsRef.current.find((s) => s.id === next.sprintId)?.name ?? null) : null;
      announce(describeRemoteChange({ by: ev.by, change: ev.change, prev, next, sprintName }), next ? [id] : []);
    },
    [company, loadAll, me.id, announce, refreshSummaries],
  );

  useRealtimeEvents((ev) => {
    if (ev.type === "task" && ev.companyId === company) {
      void applyTaskEvent(ev);
    } else if (ev.type === "sprint" && ev.companyId === company) {
      void refreshSprints().then((fresh) => {
        refreshSummaries();
        if (ev.byId === me.id) return;
        const name = fresh.find((s) => s.id === ev.sprintId)?.name ?? "a sprint";
        const verb = { created: "planned", updated: "edited", deleted: "deleted a sprint", started: "started", completed: "completed" }[ev.change];
        announce(ev.change === "deleted" ? `${ev.by} deleted a sprint` : `${ev.by} ${verb} ${name}`, []);
      });
    } else if (ev.type === "task" || ev.type === "sprint") {
      refreshSummaries(); // another company changed: only the folder cards care
    } else if (ev.type === "ready") {
      void loadAll(); // (re)connected: catch up on anything missed
    }
  });

  // The browser regained its network.
  useEffect(() => {
    const onOnline = () => void loadAll();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [loadAll]);

  /* ----- changes made here ----- */
  const upsertTask = useCallback((task: Task) => setTasks((cur) => mergeTasks(cur, [task])), []);
  const removeTask = useCallback((id: ID) => setTasks((cur) => cur.filter((t) => t.id !== id)), []);
  const upsertSprint = useCallback((sprint: Sprint) => setSprints((cur) => (cur.some((s) => s.id === sprint.id) ? cur.map((s) => (s.id === sprint.id ? sprint : s)) : [...cur, sprint])), []);

  const moveTask = useCallback(
    async (id: ID, status: TaskStatus) => {
      const prev = tasksRef.current.find((t) => t.id === id);
      if (!prev || prev.status === status) return;
      setTasks((cur) => cur.map((t) => (t.id === id ? withStatus(t, status) : t)));
      try {
        const saved = await taskService.update(id, { status });
        upsertTask(saved);
        toast.success(`${prev.key} moved to ${STATUS_TEXT[status]}`);
      } catch (e) {
        setTasks((cur) => cur.map((t) => (t.id === id ? prev : t)));
        toast.error(errorMessage(e));
        if (/not found/i.test(errorMessage(e))) removeTask(id);
      }
    },
    [toast, upsertTask, removeTask],
  );

  const setTaskSprint = useCallback(
    async (id: ID, sprintId: ID | null) => {
      const prev = tasksRef.current.find((t) => t.id === id);
      if (!prev || prev.sprintId === sprintId) return false;
      setTasks((cur) => cur.map((t) => (t.id === id ? { ...t, sprintId } : t)));
      try {
        const saved = await taskService.update(id, { sprintId });
        upsertTask(saved);
        const name = sprintId ? (sprintsRef.current.find((s) => s.id === sprintId)?.name ?? "the sprint") : "Unscheduled";
        toast.success(`${prev.key} moved to ${name}`);
        return true;
      } catch (e) {
        setTasks((cur) => cur.map((t) => (t.id === id ? prev : t)));
        toast.error(errorMessage(e));
        return false;
      }
    },
    [toast, upsertTask],
  );

  const value = useMemo<ActionsData>(
    () => ({
      company, tasks, sprints, summaries, loading, error,
      activeSprint: sprints.find((s) => s.status === "active"),
      flash, announcement, reload: loadAll, moveTask, setTaskSprint, upsertTask, removeTask, upsertSprint, refreshSprints, refreshTasks,
    }),
    [company, tasks, sprints, summaries, loading, error, flash, announcement, loadAll, moveTask, setTaskSprint, upsertTask, removeTask, upsertSprint, refreshSprints, refreshTasks],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
