"use client";

import { useState } from "react";
import { Button } from "@/components/buttons/Button";
import { Dropdown } from "@/components/forms/Dropdown";
import { Field, FormError } from "@/components/forms/Field";
import { RangeInput, TextArea, TextInput } from "@/components/forms/Inputs";
import formStyles from "@/components/forms/forms.module.css";
import { Modal } from "@/components/modals/Modal";
import { useApp } from "@/providers/AppProvider";
import { useToast } from "@/providers/ToastProvider";
import { errorMessage, taskService } from "@/services";
import { addDaysKey, dateKey } from "@/lib/time";
import { PRIORITY_OPTIONS, STATUS_COLUMNS } from "./taskMeta";
import type { Priority, Task, TaskStatus } from "@/types/models";

interface TaskFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Edit an existing task; omit to create. */
  task?: Task;
  defaultStatus?: TaskStatus;
  onSaved?: (task: Task, mode: "created" | "updated") => void;
}

export function TaskFormModal(props: TaskFormModalProps) {
  // Mount the form only while open so its state is fresh every time.
  return props.open ? <TaskForm {...props} /> : null;
}

function TaskForm({ onClose, task, defaultStatus = "todo", onSaved }: TaskFormModalProps) {
  const { members, me, primaryZone } = useApp();
  const toast = useToast();
  const editing = !!task;
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? defaultStatus);
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "medium");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? addDaysKey(dateKey(new Date(), primaryZone.tz), 7));
  const [assigneeId, setAssigneeId] = useState<string>(task ? (task.assigneeId ?? "") : me.id);
  const [progress, setProgress] = useState(task?.progress ?? 0);
  const [titleError, setTitleError] = useState<string>();
  const [dateError, setDateError] = useState<string>();
  const [serverError, setServerError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const tErr = title.trim() ? undefined : "Enter a title for the task.";
    const dErr = /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? undefined : "Pick a due date.";
    setTitleError(tErr);
    setDateError(dErr);
    if (tErr || dErr) return;
    setSaving(true);
    setServerError(undefined);
    const payload = { title, description, status, priority, dueDate, progress, assigneeId: assigneeId || null };
    try {
      const saved = task ? await taskService.update(task.id, payload) : await taskService.create(payload);
      toast.success(task ? "Task updated" : "Task created");
      onSaved?.(saved, task ? "updated" : "created");
      onClose();
    } catch (err) {
      setServerError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      locked={saving}
      title={editing ? `Edit ${task.key}` : "Create task"}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="task-form" disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Create task"}
          </Button>
        </>
      }
    >
      <form id="task-form" className={formStyles.stack} onSubmit={submit} noValidate>
        <FormError message={serverError} />
        <Field label="Title" required error={titleError}>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} invalid={!!titleError} placeholder="What needs to be done?" data-autofocus />
        </Field>
        <Field label="Description">
          <TextArea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add context, links or acceptance criteria" />
        </Field>
        <div className={formStyles.grid2}>
          <Field label="Status">
            <Dropdown ariaLabel="Status" value={status} onChange={setStatus} options={STATUS_COLUMNS} />
          </Field>
          <Field label="Priority">
            <Dropdown ariaLabel="Priority" value={priority} onChange={setPriority} options={PRIORITY_OPTIONS} />
          </Field>
        </div>
        <div className={formStyles.grid2}>
          <Field label="Assignee">
            <Dropdown
              ariaLabel="Assignee"
              value={assigneeId}
              onChange={setAssigneeId}
              options={[{ value: "", label: "Unassigned" }, ...members.map((m) => ({ value: m.id, label: m.name }))]}
            />
          </Field>
          <Field label="Due date" error={dateError}>
            <TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} invalid={!!dateError} />
          </Field>
        </div>
        <Field label="Progress">
          <RangeInput value={progress} onChange={setProgress} label="Progress" />
        </Field>
      </form>
    </Modal>
  );
}
