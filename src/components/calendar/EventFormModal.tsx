"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/buttons/Button";
import { Dropdown } from "@/components/forms/Dropdown";
import { Field, FormError } from "@/components/forms/Field";
import { TextInput } from "@/components/forms/Inputs";
import formStyles from "@/components/forms/forms.module.css";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";
import { Modal } from "@/components/modals/Modal";
import { useApp } from "@/providers/AppProvider";
import { useToast } from "@/providers/ToastProvider";
import { errorMessage, eventService } from "@/services";
import { dateKey, formatUtcOffset, zonedParts, zonedTimeToUtc } from "@/lib/time";
import { zoneAbbr } from "@/lib/zones";
import type { CalendarEvent, EventKind, Importance } from "@/types/models";

export interface EventFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Edit an existing event; omit to create. */
  event?: CalendarEvent;
  /** Kind to create (ignored when editing). */
  kind?: EventKind;
  /** Pre-filled values for a new event. `date` is yyyy-mm-dd, times are "HH:mm" in the primary time zone. */
  initial?: { date?: string; start?: string; end?: string };
  heading?: string;
  submitLabel?: string;
  onSaved?: (event: CalendarEvent, mode: "created" | "updated") => void;
  onDeleted?: (id: string) => void;
}

export function EventFormModal(props: EventFormModalProps) {
  return props.open ? <EventForm {...props} /> : null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (d: Date, tz: string) => {
  const p = zonedParts(d, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
};

function EventForm({ onClose, event, kind = "event", initial, heading, submitLabel, onSaved, onDeleted }: EventFormModalProps) {
  const { primaryZone } = useApp();
  const toast = useToast();
  const tz = primaryZone.tz;
  const editing = !!event;
  const eventKind = event?.kind ?? kind;

  const [title, setTitle] = useState(event?.title ?? "");
  const [date, setDate] = useState(event ? dateKey(new Date(event.start), tz) : (initial?.date ?? dateKey(new Date(), tz)));
  const [start, setStart] = useState(event ? hhmm(new Date(event.start), tz) : (initial?.start ?? "10:00"));
  const [end, setEnd] = useState(event ? hhmm(new Date(event.end), tz) : (initial?.end ?? "11:00"));
  const [location, setLocation] = useState(event?.location ?? "");
  const [importance, setImportance] = useState<Importance>(event?.importance ?? "standard");
  const [errors, setErrors] = useState<{ title?: string; date?: string; time?: string }>({});
  const [serverError, setServerError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const noun = eventKind === "meeting" ? "meeting" : "event";

  const toUtc = (d: string, t: string) => {
    const [y, m, day] = d.split("-").map(Number);
    const [h, mi] = t.split(":").map(Number);
    return zonedTimeToUtc(tz, y, m, day, h, mi);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found: typeof errors = {};
    if (!title.trim()) found.title = `Enter a title for the ${noun}.`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) found.date = "Pick a date.";
    if (!start || !end) found.time = "Set a start and end time.";
    else if (!found.date && toUtc(date, end) <= toUtc(date, start)) found.time = "End time must be after the start time.";
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    setServerError(undefined);
    const payload = {
      title,
      kind: eventKind,
      importance,
      location,
      start: toUtc(date, start).toISOString(),
      end: toUtc(date, end).toISOString(),
    };
    try {
      const saved = event ? await eventService.update(event.id, payload) : await eventService.create(payload);
      toast.success(event ? `${cap(noun)} updated` : eventKind === "meeting" ? "Meeting scheduled" : "Event added");
      onSaved?.(saved, event ? "updated" : "created");
      onClose();
    } catch (err) {
      setServerError(errorMessage(err));
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!event) return;
    setDeleting(true);
    try {
      await eventService.remove(event.id);
      toast.success(`${cap(noun)} deleted`);
      onDeleted?.(event.id);
      setConfirmDelete(false);
      onClose();
    } catch (err) {
      setConfirmDelete(false);
      toast.error(errorMessage(err));
      setDeleting(false);
    }
  };

  const now = new Date();
  return (
    <>
      <Modal
        open
        onClose={onClose}
        locked={saving}
        title={heading ?? (editing ? `Edit ${noun}` : eventKind === "meeting" ? "Schedule meeting" : "Add event")}
        subtitle={`Times are in ${primaryZone.city} (${zoneAbbr(primaryZone, now)}, ${formatUtcOffset(now, tz)}).`}
        footerStart={
          editing ? (
            <Button variant="danger" icon={<Trash2 size={15} />} onClick={() => setConfirmDelete(true)} disabled={saving}>
              Delete {noun}
            </Button>
          ) : undefined
        }
        footer={
          <>
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="event-form" disabled={saving}>
              {saving ? "Saving…" : (submitLabel ?? (editing ? "Save changes" : eventKind === "meeting" ? "Schedule meeting" : "Add event"))}
            </Button>
          </>
        }
      >
        <form id="event-form" className={formStyles.stack} onSubmit={submit} noValidate>
          <FormError message={serverError} />
          <Field label="Title" required error={errors.title}>
            <TextInput value={title} onChange={(e) => setTitle(e.target.value)} invalid={!!errors.title} placeholder={eventKind === "meeting" ? "e.g. Sprint planning" : "e.g. API sync workshop"} data-autofocus />
          </Field>
          <Field label="Date" error={errors.date}>
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} invalid={!!errors.date} />
          </Field>
          <div className={formStyles.grid2}>
            <Field label="Starts" error={errors.time}>
              <TextInput type="time" value={start} onChange={(e) => setStart(e.target.value)} invalid={!!errors.time} />
            </Field>
            <Field label="Ends">
              <TextInput type="time" value={end} onChange={(e) => setEnd(e.target.value)} invalid={!!errors.time} />
            </Field>
          </div>
          <div className={formStyles.grid2}>
            <Field label="Location">
              <TextInput value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Room, link or app" />
            </Field>
            <Field label="Importance">
              <Dropdown
                ariaLabel="Importance"
                value={importance}
                onChange={setImportance}
                options={[
                  { value: "standard", label: "Standard" },
                  { value: "high", label: "High importance" },
                ]}
              />
            </Field>
          </div>
        </form>
      </Modal>
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${noun}?`}
        message={
          <>
            “{event?.title}” will be removed from the calendar. This can&apos;t be undone.
          </>
        }
        confirmLabel={`Delete ${noun}`}
        busy={deleting}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
