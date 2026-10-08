"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronDown, ChevronRight, Flag, GripVertical, KanbanSquare, Pencil, Plus, Rocket, Target, Trash2 } from "lucide-react";
import { Button, buttonClass } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { Dropdown } from "@/components/forms/Dropdown";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";
import { Avatar } from "@/components/shared/Avatar";
import { Tag } from "@/components/shared/Tag";
import { getCompany } from "@/config/companies";
import { useApp } from "@/providers/AppProvider";
import { useToast } from "@/providers/ToastProvider";
import { useParamSelection } from "@/hooks/useParamSelection";
import { errorMessage, sprintService } from "@/services";
import { STATUS_TEXT, countByStatus, daysLeftText, sprintRange } from "@/lib/board";
import { dateKey, formatKeyMonthDay, formatKeyShort } from "@/lib/time";
import { cx } from "@/lib/utils";
import type { ID, Sprint, Task, TaskStatus, TeamMember } from "@/types/models";
import { useActions } from "./ActionsData";
import { CompleteSprintModal, SprintFormModal, type SprintFormMode } from "./SprintModals";
import { TaskFormModal } from "./TaskFormModal";
import { priorityLabel } from "./taskMeta";
import styles from "./Actions.module.css";

const UNSCHEDULED = "unscheduled";

/**
 * The planning side of the workflow. Work is organised into sprints (time periods); the Board then shows the active one.
 * Drag a task onto a sprint (or use "Move to") to plan it. Work that isn't in a sprint yet is "Unscheduled" — not a status.
 */
export function SprintsView() {
  const { company, tasks, sprints, activeSprint, flash, setTaskSprint, upsertTask, removeTask, upsertSprint, refreshSprints, refreshTasks } = useActions();
  const { members, primaryZone } = useApp();
  const toast = useToast();
  const co = getCompany(company);
  const [paramSel] = useParamSelection("task");

  const [form, setForm] = useState<{ mode: SprintFormMode; sprint?: Sprint } | null>(null);
  const [completing, setCompleting] = useState<Sprint | null>(null);
  const [deleting, setDeleting] = useState<Sprint | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [creatingIn, setCreatingIn] = useState<{ sprintId: ID | null } | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [dragId, setDragId] = useState<ID | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const todayKey = dateKey(new Date(), primaryZone.tz);

  const active = sprints.filter((s) => s.status === "active");
  const planned = sprints.filter((s) => s.status === "planned").sort((a, b) => a.number - b.number);
  const completed = sprints.filter((s) => s.status === "completed").sort((a, b) => b.number - a.number);
  const tasksIn = (sprintId: ID | null) => tasks.filter((t) => t.sprintId === sprintId);
  const unscheduled = tasksIn(null);

  // Where a task can be moved: any sprint that isn't finished, or back to unscheduled.
  const moveTargets = [{ value: "", label: "Unscheduled" }, ...[...active, ...planned].map((s) => ({ value: s.id, label: `${s.name}${s.status === "active" ? " (active)" : ""}` }))];

  // Arriving from search or a notification: scroll to that task and open its sprint.
  const focus = paramSel ? tasks.find((t) => t.id === paramSel) : undefined;
  const focusId = focus?.id;
  useEffect(() => {
    if (focusId) document.querySelector(`[data-task-id="${CSS.escape(focusId)}"]`)?.scrollIntoView({ block: "center" });
  }, [focusId]);

  const drop = (target: ID | null) => {
    const id = dragId;
    setDragId(null);
    setOverKey(null);
    if (id) void setTaskSprint(id, target);
  };

  const onTaskSaved = (saved: Task) => {
    if (saved.companyId !== company) {
      removeTask(saved.id);
      toast.success(`${saved.key} is now in ${getCompany(saved.companyId).code}`);
    } else upsertTask(saved);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const r = await sprintService.remove(deleting.id);
      toast.success(`${deleting.name} deleted${r.movedTasks ? ` · ${r.movedTasks} ${r.movedTasks === 1 ? "task" : "tasks"} moved to Unscheduled` : ""}`);
      setDeleting(null);
      await Promise.all([refreshSprints(), refreshTasks()]);
    } catch (e) {
      setDeleting(null);
      toast.error(errorMessage(e));
    } finally {
      setDeleteBusy(false);
    }
  };

  const section = (sprint: Sprint | undefined, list: Task[]) => (
    <SprintSection
      key={sprint?.id ?? UNSCHEDULED}
      sprint={sprint}
      tasks={list}
      byId={byId}
      todayKey={todayKey}
      tz={primaryZone.tz}
      flash={flash}
      focusId={focusId}
      moveTargets={moveTargets}
      companyId={company}
      startBlockedBy={activeSprint && sprint?.status === "planned" ? activeSprint.name : undefined}
      dragId={dragId}
      isOver={overKey === (sprint?.id ?? UNSCHEDULED)}
      onDragStartTask={setDragId}
      onDragEndTask={() => {
        setDragId(null);
        setOverKey(null);
      }}
      onOver={(on) => setOverKey(on ? (sprint?.id ?? UNSCHEDULED) : null)}
      onDrop={() => drop(sprint?.id ?? null)}
      onMove={(id, to) => void setTaskSprint(id, to)}
      onOpenTask={setEditingTask}
      onCreateTask={() => setCreatingIn({ sprintId: sprint?.id ?? null })}
      onStart={() => sprint && setForm({ mode: "start", sprint })}
      onEdit={() => sprint && setForm({ mode: "edit", sprint })}
      onDelete={() => sprint && setDeleting(sprint)}
      onComplete={() => sprint && setCompleting(sprint)}
    />
  );

  return (
    <div className={styles.page}>
      <div className={styles.sprintsHead}>
        <div>
          <h2 className={styles.sprintsTitle}>{co.code} sprints</h2>
          <p className={styles.sprintsHint}>Plan work into time-boxed sprints. The board shows the active one. Drag tasks between sprints, or use “Move to”.</p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setForm({ mode: "create" })}>
          Create sprint
        </Button>
      </div>

      {sprints.length === 0 && (
        <Card variant="neutral" className={styles.firstSprint}>
          <Rocket size={20} aria-hidden="true" />
          <p>
            <strong>No sprints for {co.code} yet.</strong> Create one, plan some work into it, then start it — it will appear on the board.
          </p>
        </Card>
      )}

      {active.map((s) => section(s, tasksIn(s.id)))}
      {planned.map((s) => section(s, tasksIn(s.id)))}
      {section(undefined, unscheduled)}

      {completed.length > 0 && (
        <div className={styles.completedGroup}>
          <h3 className={styles.completedTitle}>
            <CheckCircle2 size={16} aria-hidden="true" /> Completed sprints <span>{completed.length}</span>
          </h3>
          {completed.map((s) => section(s, tasksIn(s.id)))}
        </div>
      )}

      <SprintFormModal
        open={!!form}
        mode={form?.mode ?? "create"}
        companyId={company}
        sprint={form?.sprint}
        taskCount={form?.sprint ? tasksIn(form.sprint.id).length : 0}
        onClose={() => setForm(null)}
        onDone={(s) => {
          upsertSprint(s);
          void refreshSprints();
        }}
      />
      {completing && (
        <CompleteSprintModal
          open
          sprint={completing}
          tasks={tasksIn(completing.id)}
          planned={planned}
          onClose={() => setCompleting(null)}
          onDone={() => {
            void refreshSprints();
            void refreshTasks();
          }}
        />
      )}
      <TaskFormModal open={!!creatingIn} companyId={company} sprintId={creatingIn?.sprintId ?? null} onClose={() => setCreatingIn(null)} onSaved={onTaskSaved} />
      <TaskFormModal open={!!editingTask} task={editingTask ?? undefined} onClose={() => setEditingTask(null)} onSaved={onTaskSaved} />
      <ConfirmDialog
        open={!!deleting}
        title="Delete sprint?"
        message={
          deleting && (
            <>
              {deleting.name} will be deleted. {tasksIn(deleting.id).length > 0 ? `Its ${tasksIn(deleting.id).length} ${tasksIn(deleting.id).length === 1 ? "task moves" : "tasks move"} to Unscheduled.` : "It has no tasks."}
            </>
          )
        }
        confirmLabel="Delete sprint"
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface SectionProps {
  /** `undefined` = the Unscheduled pool. */
  sprint?: Sprint;
  tasks: Task[];
  byId: Map<string, TeamMember>;
  todayKey: string;
  tz: string;
  flash: ReadonlySet<ID>;
  focusId?: ID;
  moveTargets: { value: string; label: string }[];
  companyId: string;
  /** Name of the sprint that is already running, which stops this one from being started. */
  startBlockedBy?: string;
  dragId: ID | null;
  isOver: boolean;
  onDragStartTask: (id: ID) => void;
  onDragEndTask: () => void;
  onOver: (on: boolean) => void;
  onDrop: () => void;
  onMove: (id: ID, to: ID | null) => void;
  onOpenTask: (task: Task) => void;
  onCreateTask: () => void;
  onStart: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onComplete: () => void;
}

function SprintSection(p: SectionProps) {
  const { sprint, tasks } = p;
  const completed = sprint?.status === "completed";
  const [openState, setOpen] = useState(!completed);
  const bodyId = useId();
  const hasFocus = !!p.focusId && tasks.some((t) => t.id === p.focusId);
  const open = openState || hasFocus;
  const counts = countByStatus(tasks);
  const droppable = !completed;
  const title = sprint?.name ?? "Unscheduled";

  return (
    <Card
      variant="neutral"
      flush
      as="section"
      aria-label={title}
      data-sprint={sprint?.id ?? UNSCHEDULED}
      data-status={sprint?.status ?? "unscheduled"}
      className={cx(styles.sprint, sprint?.status === "active" && styles.sprintActive, completed && styles.sprintDone, p.isOver && styles.sprintOver, p.dragId && droppable && styles.sprintTarget)}
      onDragOver={(e: React.DragEvent) => {
        if (!p.dragId || !droppable) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        p.onOver(true);
      }}
      onDragLeave={(e: React.DragEvent) => {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) p.onOver(false);
      }}
      onDrop={(e: React.DragEvent) => {
        if (!p.dragId || !droppable) return;
        e.preventDefault();
        p.onDrop();
      }}
    >
      <header className={styles.sprintHead}>
        <button type="button" className={styles.sprintToggle} aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!openState)}>
          {open ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
          <h3>{title}</h3>
        </button>
        {sprint && <Tag tone={sprint.status === "active" ? "active" : sprint.status === "planned" ? "free" : "offline"}>{sprint.status === "active" ? "Active" : sprint.status === "planned" ? "Planned" : "Completed"}</Tag>}
        {sprint && (
          <span className={styles.sprintWhen}>
            <CalendarDays size={14} aria-hidden="true" /> {sprintRange(sprint)}
            {sprint.status === "active" && <> · <strong>{daysLeftText(sprint, p.todayKey)}</strong></>}
          </span>
        )}
        <span className={styles.sprintCounts} aria-label={`${counts.total} tasks`}>
          <span title="To Do">{counts.todo} to do</span>
          <span title="In Progress">{counts["in-progress"]} in progress</span>
          <span title="Review">{counts.review} in review</span>
          <span title="Done">{counts.done} done</span>
        </span>
        <span className={styles.sprintActions}>
          {sprint?.status === "active" && (
            <>
              <Link href={`/actions/${p.companyId}/board`} className={buttonClass({ variant: "outline", size: "sm" })}>
                <KanbanSquare size={14} /> Board
              </Link>
              <Button variant="outline" size="sm" icon={<Pencil size={14} />} onClick={p.onEdit} aria-label={`Edit ${title}`}>
                Edit
              </Button>
              <Button variant="primary" size="sm" icon={<Flag size={14} />} onClick={p.onComplete}>
                Complete sprint
              </Button>
            </>
          )}
          {sprint?.status === "planned" && (
            <>
              <Button variant="primary" size="sm" icon={<Rocket size={14} />} onClick={p.onStart} disabled={!!p.startBlockedBy} title={p.startBlockedBy ? `${p.startBlockedBy} is still active — complete it first.` : undefined}>
                Start sprint
              </Button>
              <Button variant="outline" size="sm" icon={<Pencil size={14} />} onClick={p.onEdit} aria-label={`Edit ${title}`}>
                Edit
              </Button>
              <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={p.onDelete} aria-label={`Delete ${title}`}>
                Delete
              </Button>
            </>
          )}
        </span>
      </header>

      {sprint?.goal && (
        <p className={styles.sprintGoalLine}>
          <Target size={14} aria-hidden="true" /> {sprint.goal}
        </p>
      )}
      {completed && sprint?.summary && (
        <p className={styles.sprintRecord}>
          Completed {sprint.completedAt ? formatKeyMonthDay(dateKey(new Date(sprint.completedAt), p.tz)) : ""} · {sprint.summary.done} of {sprint.summary.total} done
          {sprint.summary.moved ? ` · ${sprint.summary.moved} moved on` : ""}
        </p>
      )}
      {!sprint && <p className={styles.sprintGoalLine}>Work that isn&apos;t in a sprint yet. This isn&apos;t a status — drag it into a sprint to plan it.</p>}

      {open && (
        <div id={bodyId} className={styles.sprintBody}>
          {tasks.length === 0 ? (
            <p className={styles.sprintEmpty}>{completed ? "No tasks were in this sprint." : p.dragId ? "Drop here" : sprint ? "No tasks planned. Drag work here, or create a task." : "Nothing unscheduled."}</p>
          ) : (
            <ul className={styles.rows} aria-label={`${title} tasks`}>
              {tasks.map((t) => (
                <TaskRow key={t.id} task={t} locked={completed} assignee={t.assigneeId ? p.byId.get(t.assigneeId) : undefined} todayKey={p.todayKey} flashing={p.flash.has(t.id)} focused={t.id === p.focusId} moveTargets={p.moveTargets} onDragStart={() => p.onDragStartTask(t.id)} onDragEnd={p.onDragEndTask} onMove={(to) => p.onMove(t.id, to)} onOpen={() => p.onOpenTask(t)} />
              ))}
            </ul>
          )}
          {!completed && (
            <Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={p.onCreateTask} className={styles.addInSprint}>
              Create task{sprint ? ` in ${sprint.name}` : ""}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

const STATUS_TONE: Record<TaskStatus, string> = { todo: "pillTodo", "in-progress": "pillProgress", review: "pillReview", done: "pillDone" };

interface RowProps {
  task: Task;
  locked: boolean;
  assignee?: TeamMember;
  todayKey: string;
  flashing: boolean;
  focused: boolean;
  moveTargets: { value: string; label: string }[];
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (to: ID | null) => void;
  onOpen: () => void;
}

function TaskRow({ task, locked, assignee, todayKey, flashing, focused, moveTargets, onDragStart, onDragEnd, onMove, onOpen }: RowProps) {
  const overdue = task.dueDate < todayKey && task.status !== "done";
  return (
    <li
      className={cx(styles.row, flashing && styles.cardFlash, focused && styles.rowFocus, task.status === "done" && styles.rowDone)}
      data-task-id={task.id}
      draggable={!locked}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      {!locked && <GripVertical size={16} className={styles.grip} aria-hidden="true" />}
      <span className={styles.rowKey}>{task.key}</span>
      <button type="button" className={styles.rowTitle} onClick={onOpen} title="Open task">
        {task.title}
      </button>
      <Tag tone={task.priority}>{priorityLabel(task.priority)}</Tag>
      <span className={cx(styles.pill, styles[STATUS_TONE[task.status]])}>{STATUS_TEXT[task.status]}</span>
      <span className={cx(styles.rowDue, overdue && styles.overdue)}>{formatKeyShort(task.dueDate)}</span>
      {assignee ? <Avatar initials={assignee.initials} size={24} /> : <span className={styles.rowNobody} aria-label="Unassigned" />}
      {!locked && <Dropdown variant="filter" ariaLabel={`Move ${task.key} to a sprint`} value={task.sprintId ?? ""} displayLabel="Move to…" onChange={(v) => onMove(v || null)} options={moveTargets} />}
    </li>
  );
}
