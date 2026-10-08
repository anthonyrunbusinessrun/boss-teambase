"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, Check, Flag, Inbox, ListTodo, Pencil, Plus, Rocket, SearchX, Target, Trash2, XCircle } from "lucide-react";
import { Button, buttonClass } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { Dropdown } from "@/components/forms/Dropdown";
import { SearchInput } from "@/components/forms/Inputs";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";
import { Avatar } from "@/components/shared/Avatar";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { EmptyState } from "@/components/shared/States";
import { Tag } from "@/components/shared/Tag";
import { getCompany } from "@/config/companies";
import { useApp } from "@/providers/AppProvider";
import { useToast } from "@/providers/ToastProvider";
import { useParamSelection } from "@/hooks/useParamSelection";
import { errorMessage, taskService } from "@/services";
import { countByStatus, daysLeftText, percentDone, sprintRange } from "@/lib/board";
import { dateKey, formatKeyShort } from "@/lib/time";
import { cx } from "@/lib/utils";
import type { Sprint, Task, TaskStatus, TeamMember } from "@/types/models";
import { useActions } from "./ActionsData";
import { CompleteSprintModal, SprintFormModal } from "./SprintModals";
import { TaskFormModal } from "./TaskFormModal";
import { PRIORITY_OPTIONS, STATUS_COLUMNS, priorityLabel } from "./taskMeta";
import styles from "./Actions.module.css";

/** The company's board: the active sprint's work in four columns (To Do · In Progress · Review · Done). */
export function BoardView() {
  const { company, tasks, sprints, activeSprint, flash, moveTask, setTaskSprint, upsertTask, removeTask, upsertSprint, refreshSprints, refreshTasks } = useActions();
  const { members, primaryZone } = useApp();
  const toast = useToast();
  const co = getCompany(company);
  const [paramSel, setSel] = useParamSelection("task");

  const [query, setQuery] = useState("");
  const [assignee, setAssignee] = useState("all");
  const [status, setStatus] = useState<"all" | TaskStatus>("all");
  const [priority, setPriority] = useState("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [sprintForm, setSprintForm] = useState<"start" | "create" | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<TaskStatus | null>(null);

  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const todayKey = dateKey(new Date(), primaryZone.tz);

  // The board holds the active sprint's work — nothing else.
  const all = useMemo(() => (activeSprint ? tasks.filter((t) => t.sprintId === activeSprint.id) : []), [tasks, activeSprint]);
  const planned = sprints.filter((s) => s.status === "planned");

  const q = query.trim().toLowerCase();
  const visible = all.filter(
    (t) =>
      (!q || t.title.toLowerCase().includes(q) || t.key.toLowerCase().includes(q)) &&
      (assignee === "all" || (assignee === "none" ? !t.assigneeId : t.assigneeId === assignee)) &&
      (status === "all" || t.status === status) &&
      (priority === "all" || t.priority === priority),
  );
  const columns = STATUS_COLUMNS.filter((c) => status === "all" || c.value === status);
  const filtersActive = !!q || assignee !== "all" || status !== "all" || priority !== "all";

  // Default selection mirrors the design: the card that is in progress.
  const defaultId = (all.find((t) => t.status === "in-progress") ?? all[0])?.id ?? null;
  const selectedId = paramSel !== undefined ? paramSel : defaultId;
  const selected = all.find((t) => t.id === selectedId) ?? null;
  const panelOpen = paramSel !== null && !!selected;

  const clearFilters = () => {
    setQuery("");
    setAssignee("all");
    setStatus("all");
    setPriority("all");
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await taskService.remove(deleting.id);
      removeTask(deleting.id);
      toast.success("Task deleted");
      setDeleting(null);
    } catch (e) {
      setDeleting(null);
      toast.error(errorMessage(e));
    } finally {
      setDeleteBusy(false);
    }
  };

  const onSaved = (saved: Task, mode: "created" | "updated") => {
    if (saved.companyId !== company) {
      removeTask(saved.id); // it now belongs to another company's board
      return toast.success(`${saved.key} is now in ${getCompany(saved.companyId).code}`);
    }
    upsertTask(saved);
    if (saved.sprintId === activeSprint?.id) setSel(saved.id);
    else {
      if (selectedId === saved.id) setSel(null);
      if (mode === "created") toast.success(`${saved.key} was added outside the active sprint — find it under Sprints.`);
    }
  };

  if (!activeSprint) {
    return (
      <>
        <Card variant="neutral">
          <EmptyState
            icon={<Rocket size={22} />}
            title={`No active sprint for ${co.code}`}
            description={planned.length ? `Start ${planned[0].name} to put its work on the ${co.code} board.` : `Plan a sprint to organise ${co.code}'s work into a time period. The board shows whatever is in the active sprint.`}
            action={
              <div className={styles.emptyActions}>
                {planned.length ? (
                  <Button variant="primary" icon={<Rocket size={16} />} onClick={() => setSprintForm("start")}>
                    Start {planned[0].name}
                  </Button>
                ) : (
                  <Button variant="primary" icon={<Plus size={16} />} onClick={() => setSprintForm("create")}>
                    Create sprint
                  </Button>
                )}
                <Link href={`/actions/${company}/sprints`} className={buttonClass({ variant: "outline" })}>
                  <ListTodo size={16} /> Open sprints
                </Link>
              </div>
            }
          />
        </Card>
        <SprintFormModal
          open={sprintForm !== null}
          mode={sprintForm === "create" ? "create" : "start"}
          companyId={company}
          sprint={sprintForm === "start" ? planned[0] : undefined}
          taskCount={planned[0] ? tasks.filter((t) => t.sprintId === planned[0].id).length : 0}
          onClose={() => setSprintForm(null)}
          onDone={(s) => {
            upsertSprint(s);
            void refreshSprints();
          }}
        />
      </>
    );
  }

  const counts = countByStatus(all);

  return (
    <div className={styles.page}>
      <SprintBar sprint={activeSprint} counts={counts} todayKey={todayKey} companyId={company} onComplete={() => setCompleteOpen(true)} />

      <div className={styles.filters}>
        <SearchInput className="" wrapperClassName={styles.search} placeholder="Search tickets…" aria-label="Search tickets" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Dropdown
          variant="filter"
          ariaLabel="Filter by assignee"
          value={assignee}
          displayLabel={assignee === "all" ? "Assignee" : undefined}
          onChange={setAssignee}
          options={[{ value: "all", label: "All assignees" }, ...members.map((m) => ({ value: m.id, label: m.name })), { value: "none", label: "Unassigned" }]}
        />
        <Dropdown variant="filter" ariaLabel="Filter by status" value={status} displayLabel={status === "all" ? "Status" : undefined} onChange={setStatus} options={[{ value: "all", label: "All statuses" }, ...STATUS_COLUMNS]} />
        <Dropdown variant="filter" ariaLabel="Filter by priority" value={priority} displayLabel={priority === "all" ? "Priority" : undefined} onChange={setPriority} options={[{ value: "all", label: "All priorities" }, ...PRIORITY_OPTIONS]} />
        {filtersActive && (
          <Button variant="ghost" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
        <span className={styles.spacer} />
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
          Create Task
        </Button>
      </div>

      {all.length === 0 ? (
        <Card variant="neutral">
          <EmptyState
            icon={<Inbox size={22} />}
            title={`${activeSprint.name} is empty`}
            description="Create a task here, or plan existing work into this sprint from the Sprints screen."
            action={
              <div className={styles.emptyActions}>
                <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
                  Create Task
                </Button>
                <Link href={`/actions/${company}/sprints`} className={buttonClass({ variant: "outline" })}>
                  <ListTodo size={16} /> Plan from Sprints
                </Link>
              </div>
            }
          />
        </Card>
      ) : visible.length === 0 ? (
        <Card variant="neutral">
          <EmptyState
            icon={<SearchX size={22} />}
            title="No tasks match these filters"
            description="Try a different search or clear the filters."
            action={
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        </Card>
      ) : (
        <div className={cx(styles.board, !panelOpen && styles.boardClosed)} style={{ ["--cols" as string]: columns.length }}>
          {columns.map((col) => {
            const items = visible.filter((t) => t.status === col.value);
            return (
              <section
                key={col.value}
                className={cx(styles.column, overColumn === col.value && styles.columnOver)}
                aria-label={`${col.label}, ${items.length} tasks`}
                data-status={col.value}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setOverColumn(col.value);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverColumn(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setOverColumn(null);
                  const id = e.dataTransfer.getData("text/plain") || dragId;
                  setDragId(null);
                  if (id) void moveTask(id, col.value);
                }}
              >
                <header className={styles.columnHead}>
                  <h2 style={{ font: "inherit", margin: 0 }}>{col.label}</h2>
                  <span className={styles.count}>{items.length}</span>
                </header>
                <div className={styles.cards}>
                  {items.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      assignee={t.assigneeId ? byId.get(t.assigneeId) : undefined}
                      selected={t.id === selectedId && panelOpen}
                      overdue={t.dueDate < todayKey && t.status !== "done"}
                      dragging={dragId === t.id}
                      flashing={flash.has(t.id)}
                      onSelect={() => setSel(t.id)}
                      onDragStart={() => setDragId(t.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverColumn(null);
                      }}
                    />
                  ))}
                  {items.length === 0 && <p className={styles.columnEmpty}>No tasks</p>}
                </div>
              </section>
            );
          })}

          {panelOpen && selected && (
            <TaskDetails
              task={selected}
              assignee={selected.assigneeId ? byId.get(selected.assigneeId) : undefined}
              sprints={sprints.filter((s) => s.status !== "completed")}
              onClose={() => setSel(null)}
              onEdit={() => setEditing(selected)}
              onDelete={() => setDeleting(selected)}
              onMove={(s) => void moveTask(selected.id, s)}
              onSprint={async (sprintId) => {
                if ((await setTaskSprint(selected.id, sprintId)) && sprintId !== activeSprint.id) setSel(null); // it left this board
              }}
              overdue={selected.dueDate < todayKey && selected.status !== "done"}
            />
          )}
        </div>
      )}

      <TaskFormModal open={createOpen} companyId={company} sprintId={activeSprint.id} onClose={() => setCreateOpen(false)} onSaved={onSaved} />
      <TaskFormModal open={!!editing} task={editing ?? undefined} onClose={() => setEditing(null)} onSaved={onSaved} />
      <CompleteSprintModal
        open={completeOpen}
        sprint={activeSprint}
        tasks={all}
        planned={planned}
        onClose={() => setCompleteOpen(false)}
        onDone={() => {
          void refreshSprints();
          void refreshTasks();
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        title="Delete task?"
        message={
          <>
            {deleting && (
              <>
                #{deleting.key}: “{deleting.title}” will be permanently removed from the board.{" "}
              </>
            )}
            This can&apos;t be undone.
          </>
        }
        confirmLabel="Delete task"
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SprintBar({ sprint, counts, todayKey, companyId, onComplete }: { sprint: Sprint; counts: ReturnType<typeof countByStatus>; todayKey: string; companyId: string; onComplete: () => void }) {
  const pct = percentDone(counts);
  return (
    <Card variant="royal" className={styles.sprintBar} aria-label="Active sprint">
      <div className={styles.sprintBarTop}>
        <div className={styles.sprintBarTitle}>
          <h2 className={styles.sprintName}>{sprint.name}</h2>
          <Tag tone="active">Active</Tag>
          <span className={styles.sprintDates}>
            <CalendarDays size={14} aria-hidden="true" /> {sprintRange(sprint)} · <strong>{daysLeftText(sprint, todayKey)}</strong>
          </span>
        </div>
        <div className={styles.sprintBarActions}>
          <Link href={`/actions/${companyId}/sprints`} className={buttonClass({ variant: "outline", size: "sm" })}>
            <ListTodo size={15} /> Sprints
          </Link>
          <Button variant="primary" size="sm" icon={<Flag size={15} />} onClick={onComplete}>
            Complete sprint
          </Button>
        </div>
      </div>
      {sprint.goal && (
        <p className={styles.sprintGoal}>
          <Target size={14} aria-hidden="true" /> {sprint.goal}
        </p>
      )}
      <div className={styles.sprintProgress}>
        <ProgressBar value={pct} label={`${sprint.name} progress`} />
        <span>
          {counts.done} of {counts.total} done · {counts["in-progress"]} in progress · {counts.review} in review · {counts.todo} to do
        </span>
      </div>
    </Card>
  );
}

interface TaskCardProps {
  task: Task;
  assignee?: TeamMember;
  selected: boolean;
  overdue: boolean;
  dragging: boolean;
  flashing: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

function TaskCard({ task, assignee, selected, overdue, dragging, flashing, onSelect, onDragStart, onDragEnd }: TaskCardProps) {
  const done = task.status === "done";
  return (
    <article
      role="button"
      tabIndex={0}
      draggable
      aria-pressed={selected}
      aria-label={`${task.key} ${task.title}, ${priorityLabel(task.priority)} priority, ${task.progress}% done`}
      data-task-id={task.id}
      className={cx(styles.card, selected && styles.cardSelected, dragging && styles.dragging, flashing && styles.cardFlash, done && styles.cardDone)}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <h3 className={styles.cardTitle}>{task.title}</h3>
      <div className={styles.cardMeta}>
        <Tag tone={task.priority}>{priorityLabel(task.priority)}</Tag>
        <span className={cx(styles.due, overdue && styles.overdue)}>{formatKeyShort(task.dueDate)}</span>
      </div>
      <div>
        <div className={styles.progressRow}>
          <span>Progress</span>
          <span className={styles.progressPct}>{task.progress}%</span>
        </div>
        <ProgressBar value={task.progress} label={`${task.key} progress`} />
      </div>
      <div className={styles.cardFoot}>
        <span className={styles.ticket}>
          {done && <Check size={12} aria-label="Done" className={styles.doneCheck} />}#{task.key}
        </span>
        {assignee ? <Avatar initials={assignee.initials} size={24} /> : <span className={styles.ticket}>Unassigned</span>}
      </div>
    </article>
  );
}

interface TaskDetailsProps {
  task: Task;
  assignee?: TeamMember;
  overdue: boolean;
  /** Sprints this task can be planned into (not completed ones). */
  sprints: Sprint[];
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (status: TaskStatus) => void;
  onSprint: (sprintId: string | null) => void | Promise<void>;
}

function TaskDetails({ task, assignee, overdue, sprints, onClose, onEdit, onDelete, onMove, onSprint }: TaskDetailsProps) {
  return (
    <Card variant="royal" as="aside" className={styles.panel} aria-label="Task details">
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Task Details</h2>
        <button type="button" className={styles.panelClose} onClick={onClose} aria-label="Close task details">
          <XCircle size={20} />
        </button>
      </div>

      <div>
        <p className={cx("section-label", styles.fieldLabel)}>Active selection</p>
        <p className={styles.selection}>
          #{task.key}: {task.title}
        </p>
      </div>

      <div>
        <p className={cx("section-label", styles.fieldLabel)}>Description</p>
        <p className={cx(styles.description, !task.description && styles.muted)}>{task.description || "No description yet."}</p>
      </div>

      <div>
        <p className={cx("section-label", styles.fieldLabel)}>Assignee</p>
        {assignee ? (
          <div className={styles.assignee}>
            <Avatar initials={assignee.initials} size={20} />
            {assignee.name}
          </div>
        ) : (
          <p className={cx(styles.description, styles.muted)}>Unassigned</p>
        )}
      </div>

      <div>
        <p className={cx("section-label", styles.fieldLabel)}>Status</p>
        <Dropdown ariaLabel="Move task to status" value={task.status} onChange={onMove} options={STATUS_COLUMNS} />
      </div>

      <div>
        <p className={cx("section-label", styles.fieldLabel)}>Sprint</p>
        <Dropdown
          ariaLabel="Move task to sprint"
          value={task.sprintId ?? ""}
          onChange={(v) => void onSprint(v || null)}
          options={[{ value: "", label: "Unscheduled (leave the board)" }, ...sprints.map((s) => ({ value: s.id, label: `${s.name}${s.status === "active" ? " (active)" : ""}` }))]}
        />
      </div>

      <div className={styles.metaRow}>
        <Tag tone={task.priority}>{priorityLabel(task.priority)}</Tag>
        <span className={cx(overdue && styles.overdue)}>Due {formatKeyShort(task.dueDate)}</span>
        <span>{task.progress}% done</span>
      </div>

      <div className={styles.panelActions}>
        <Button variant="outline" icon={<Pencil size={15} />} onClick={onEdit}>
          Edit
        </Button>
        <Button variant="danger" icon={<Trash2 size={15} />} onClick={onDelete}>
          Delete
        </Button>
      </div>
    </Card>
  );
}
