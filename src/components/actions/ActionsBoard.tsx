"use client";

import { useMemo, useState } from "react";
import { Inbox, Pencil, Plus, SearchX, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { Dropdown } from "@/components/forms/Dropdown";
import { SearchInput } from "@/components/forms/Inputs";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";
import { Avatar } from "@/components/shared/Avatar";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/States";
import { Tag } from "@/components/shared/Tag";
import { TaskFormModal } from "./TaskFormModal";
import { PRIORITY_OPTIONS, STATUS_COLUMNS, priorityLabel, statusLabel } from "./taskMeta";
import { useApp } from "@/providers/AppProvider";
import { useToast } from "@/providers/ToastProvider";
import { useParamSelection } from "@/hooks/useParamSelection";
import { useResource } from "@/hooks/useResource";
import { errorMessage, taskService } from "@/services";
import { dateKey, formatKeyShort } from "@/lib/time";
import { cx } from "@/lib/utils";
import type { Task, TaskStatus, TeamMember } from "@/types/models";
import styles from "./Actions.module.css";

export function ActionsBoard() {
  const { members, primaryZone } = useApp();
  const toast = useToast();
  const tasks = useResource(taskService.list);
  const [paramSel, setSel] = useParamSelection("task");

  const [query, setQuery] = useState("");
  const [assignee, setAssignee] = useState("all");
  const [status, setStatus] = useState<"all" | TaskStatus>("all");
  const [priority, setPriority] = useState("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<TaskStatus | null>(null);

  const all = tasks.data ?? [];
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const todayKey = dateKey(new Date(), primaryZone.tz);

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

  /** Optimistic status change with rollback. Used by drag-and-drop and the Status dropdown. */
  const moveTask = async (id: string, next: TaskStatus) => {
    const prev = all.find((t) => t.id === id);
    if (!prev || prev.status === next) return;
    tasks.setData((cur) => cur?.map((t) => (t.id === id ? { ...t, status: next } : t)));
    try {
      await taskService.update(id, { status: next });
      toast.success(`${prev.key} moved to ${statusLabel(next)}`);
    } catch (e) {
      tasks.setData((cur) => cur?.map((t) => (t.id === id ? { ...t, status: prev.status } : t)));
      toast.error(errorMessage(e));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await taskService.remove(deleting.id);
      tasks.setData((cur) => cur?.filter((t) => t.id !== deleting.id));
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
    tasks.setData((cur) => (mode === "created" ? [...(cur ?? []), saved] : cur?.map((t) => (t.id === saved.id ? saved : t))));
    setSel(saved.id);
  };

  if (tasks.loading) return <LoadingState label="Loading tasks…" />;
  if (tasks.error && !tasks.data) return <ErrorState message={tasks.error} onRetry={tasks.reload} />;

  return (
    <div className={styles.page}>
      <div className={styles.filters}>
        <SearchInput className="" wrapperClassName={styles.search} placeholder="Search tickets…" aria-label="Search tickets" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Dropdown
          variant="filter"
          ariaLabel="Filter by assignee"
          value={assignee}
          displayLabel={assignee === "all" ? "Assignee" : undefined}
          onChange={setAssignee}
          options={[
            { value: "all", label: "All assignees" },
            ...members.map((m) => ({ value: m.id, label: m.name })),
            { value: "none", label: "Unassigned" },
          ]}
        />
        <Dropdown
          variant="filter"
          ariaLabel="Filter by status"
          value={status}
          displayLabel={status === "all" ? "Status" : undefined}
          onChange={setStatus}
          options={[{ value: "all", label: "All statuses" }, ...STATUS_COLUMNS]}
        />
        <Dropdown
          variant="filter"
          ariaLabel="Filter by priority"
          value={priority}
          displayLabel={priority === "all" ? "Priority" : undefined}
          onChange={setPriority}
          options={[{ value: "all", label: "All priorities" }, ...PRIORITY_OPTIONS]}
        />
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
            title="No tasks yet"
            description="Create your first task to start tracking work across the board."
            action={
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
                Create Task
              </Button>
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
                      overdue={t.dueDate < todayKey}
                      dragging={dragId === t.id}
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
              onClose={() => setSel(null)}
              onEdit={() => setEditing(selected)}
              onDelete={() => setDeleting(selected)}
              onMove={(s) => void moveTask(selected.id, s)}
              overdue={selected.dueDate < todayKey}
            />
          )}
        </div>
      )}

      <TaskFormModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={onSaved} />
      <TaskFormModal open={!!editing} task={editing ?? undefined} onClose={() => setEditing(null)} onSaved={onSaved} />
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

interface TaskCardProps {
  task: Task;
  assignee?: TeamMember;
  selected: boolean;
  overdue: boolean;
  dragging: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

function TaskCard({ task, assignee, selected, overdue, dragging, onSelect, onDragStart, onDragEnd }: TaskCardProps) {
  return (
    <article
      role="button"
      tabIndex={0}
      draggable
      aria-pressed={selected}
      aria-label={`${task.key} ${task.title}, ${priorityLabel(task.priority)} priority, ${task.progress}% done`}
      className={cx(styles.card, selected && styles.cardSelected, dragging && styles.dragging)}
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
        <span className={styles.ticket}>#{task.key}</span>
        {assignee ? <Avatar initials={assignee.initials} size={24} /> : <span className={styles.ticket}>Unassigned</span>}
      </div>
    </article>
  );
}

interface TaskDetailsProps {
  task: Task;
  assignee?: TeamMember;
  overdue: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (status: TaskStatus) => void;
}

function TaskDetails({ task, assignee, overdue, onClose, onEdit, onDelete, onMove }: TaskDetailsProps) {
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
