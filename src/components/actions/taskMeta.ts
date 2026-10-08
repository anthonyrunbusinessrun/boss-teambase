import type { Priority, TaskStatus } from "@/types/models";

export const STATUS_COLUMNS: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "To Do" },
  { value: "in-progress", label: "In Progress" },
  { value: "review", label: "Review" },
  { value: "done", label: "Done" },
];

export const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export const priorityLabel = (p: Priority) => PRIORITY_OPTIONS.find((o) => o.value === p)?.label ?? p;
export const statusLabel = (s: TaskStatus) => STATUS_COLUMNS.find((o) => o.value === s)?.label ?? s;
