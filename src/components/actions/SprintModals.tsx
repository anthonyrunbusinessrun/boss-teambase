"use client";

import { useState } from "react";
import { Button } from "@/components/buttons/Button";
import { Dropdown } from "@/components/forms/Dropdown";
import { Field, FormError } from "@/components/forms/Field";
import { TextArea, TextInput } from "@/components/forms/Inputs";
import formStyles from "@/components/forms/forms.module.css";
import { Modal } from "@/components/modals/Modal";
import { getCompany } from "@/config/companies";
import { useApp } from "@/providers/AppProvider";
import { useToast } from "@/providers/ToastProvider";
import { errorMessage, sprintService } from "@/services";
import { countByStatus, sprintRange } from "@/lib/board";
import { addDaysKey, dateKey } from "@/lib/time";
import type { CompanyId, Sprint, Task } from "@/types/models";
import styles from "./Actions.module.css";

export type SprintFormMode = "create" | "edit" | "start";

interface SprintFormProps {
  open: boolean;
  mode: SprintFormMode;
  companyId: CompanyId;
  /** The sprint being edited or started. */
  sprint?: Sprint;
  /** How many tasks are planned into it (shown when starting). */
  taskCount?: number;
  onClose: () => void;
  onDone: (sprint: Sprint, mode: SprintFormMode) => void;
}

/** Create, edit or start a sprint — the same fields, three purposes (as in Jira). Mounted only while open so state is always fresh. */
export function SprintFormModal(props: SprintFormProps) {
  return props.open ? <SprintForm {...props} /> : null;
}

function SprintForm({ mode, companyId, sprint, taskCount = 0, onClose, onDone }: SprintFormProps) {
  const { primaryZone } = useApp();
  const toast = useToast();
  const today = dateKey(new Date(), primaryZone.tz);
  const [name, setName] = useState(sprint?.name ?? "");
  const [goal, setGoal] = useState(sprint?.goal ?? "");
  const [startDate, setStartDate] = useState(sprint?.startDate ?? today);
  const [endDate, setEndDate] = useState(sprint?.endDate ?? addDaysKey(today, 14));
  const [nameError, setNameError] = useState<string>();
  const [dateError, setDateError] = useState<string>();
  const [serverError, setServerError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const company = getCompany(companyId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nErr = mode !== "create" && !name.trim() ? "Give the sprint a name." : name.trim().length > 60 ? "Keep it under 60 characters." : undefined;
    const dErr = !startDate || !endDate ? "Pick both dates." : endDate < startDate ? "The sprint can't end before it starts." : undefined;
    setNameError(nErr);
    setDateError(dErr);
    if (nErr || dErr) return;
    setSaving(true);
    setServerError(undefined);
    try {
      const fields = { name: name.trim() || undefined, goal, startDate, endDate };
      let saved: Sprint;
      if (mode === "create") saved = await sprintService.create({ companyId, ...fields });
      else if (mode === "edit") saved = await sprintService.update(sprint!.id, { ...fields, name: name.trim() });
      else saved = await sprintService.start(sprint!.id, { ...fields, name: name.trim() });
      toast.success(mode === "create" ? `${saved.name} planned` : mode === "edit" ? "Sprint updated" : `${saved.name} started`);
      onDone(saved, mode);
      onClose();
    } catch (err) {
      setServerError(errorMessage(err));
      setSaving(false);
    }
  };

  const title = mode === "create" ? `New ${company.code} sprint` : mode === "edit" ? `Edit ${sprint?.name}` : `Start ${sprint?.name}`;
  return (
    <Modal
      open
      onClose={onClose}
      locked={saving}
      title={title}
      subtitle={mode === "start" ? `${taskCount} ${taskCount === 1 ? "task goes" : "tasks go"} onto the ${company.code} board.` : company.name}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="sprint-form" disabled={saving}>
            {saving ? "Saving…" : mode === "create" ? "Create sprint" : mode === "edit" ? "Save changes" : "Start sprint"}
          </Button>
        </>
      }
    >
      <form id="sprint-form" className={formStyles.stack} onSubmit={submit} noValidate>
        <FormError message={serverError} />
        <Field label="Sprint name" required={mode !== "create"} error={nameError} hint={mode === "create" ? "Leave empty to number it automatically." : undefined}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} invalid={!!nameError} placeholder="Sprint 3" data-autofocus />
        </Field>
        <Field label="Sprint goal">
          <TextArea value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="What should be true when this sprint ends?" />
        </Field>
        <div className={formStyles.grid2}>
          <Field label="Start date">
            <TextInput type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} invalid={!!dateError} />
          </Field>
          <Field label="End date" error={dateError}>
            <TextInput type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} invalid={!!dateError} />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

interface CompleteProps {
  open: boolean;
  sprint: Sprint;
  /** The tasks currently in this sprint. */
  tasks: Task[];
  /** Planned sprints of the same company that unfinished work can move to. */
  planned: Sprint[];
  onClose: () => void;
  onDone: (result: { sprint: Sprint; movedTasks: number }) => void;
}

export function CompleteSprintModal(props: CompleteProps) {
  return props.open ? <CompleteForm {...props} /> : null;
}

function CompleteForm({ sprint, tasks, planned, onClose, onDone }: CompleteProps) {
  const toast = useToast();
  const counts = countByStatus(tasks);
  const unfinished = counts.total - counts.done;
  const [moveTo, setMoveTo] = useState<string>(planned[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string>();

  const submit = async () => {
    setBusy(true);
    setServerError(undefined);
    try {
      const result = await sprintService.complete(sprint.id, unfinished > 0 && moveTo ? moveTo : null);
      const where = moveTo ? (planned.find((p) => p.id === moveTo)?.name ?? "the next sprint") : "Unscheduled";
      toast.success(unfinished > 0 ? `${sprint.name} completed · ${unfinished} unfinished moved to ${where}` : `${sprint.name} completed`);
      onDone(result);
      onClose();
    } catch (err) {
      setServerError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      locked={busy}
      title={`Complete ${sprint.name}`}
      subtitle={sprintRange(sprint)}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? "Completing…" : "Complete sprint"}
          </Button>
        </>
      }
    >
      <div className={formStyles.stack}>
        <FormError message={serverError} />
        <dl className={styles.completeStats}>
          <div>
            <dt>Done</dt>
            <dd>{counts.done}</dd>
          </div>
          <div>
            <dt>Not done</dt>
            <dd>{unfinished}</dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>{counts.total}</dd>
          </div>
        </dl>
        {unfinished > 0 ? (
          <Field label={`Move the ${unfinished} unfinished ${unfinished === 1 ? "task" : "tasks"} to`} hint="Finished work stays in this sprint as its record.">
            <Dropdown
              ariaLabel="Move unfinished tasks to"
              value={moveTo}
              onChange={setMoveTo}
              options={[...planned.map((p) => ({ value: p.id, label: `${p.name} (planned)` })), { value: "", label: "Unscheduled (not in any sprint)" }]}
            />
          </Field>
        ) : (
          <p className={styles.completeNote}>Everything in this sprint is done. Nice work.</p>
        )}
      </div>
    </Modal>
  );
}
