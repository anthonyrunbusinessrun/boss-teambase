"use client";

import { useState } from "react";
import { Pencil, Settings, Trash2 } from "lucide-react";
import { Button } from "@/components/buttons/Button";
import { Dropdown } from "@/components/forms/Dropdown";
import { Field, FormError } from "@/components/forms/Field";
import { TextInput } from "@/components/forms/Inputs";
import formStyles from "@/components/forms/forms.module.css";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";
import { Modal } from "@/components/modals/Modal";
import { Avatar } from "@/components/shared/Avatar";
import { Tag } from "@/components/shared/Tag";
import { useApp } from "@/providers/AppProvider";
import { useToast } from "@/providers/ToastProvider";
import { errorMessage, memberService } from "@/services";
import { getDescendantIds } from "@/lib/org";
import { makeInitials } from "@/lib/utils";
import type { TeamMember } from "@/types/models";
import styles from "./ProfileModal.module.css";

export interface MemberForm {
  name: string;
  role: string;
  department: string;
  initials: string;
  status: TeamMember["status"];
  managerId: string;
  skills: string;
}

export const toMemberForm = (m: TeamMember): MemberForm => ({
  name: m.name,
  role: m.role,
  department: m.department,
  initials: m.initials,
  status: m.status,
  managerId: m.managerId ?? "",
  skills: m.skills.join(", "),
});

export const parseSkills = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

type FormErrors = Partial<Record<"name" | "role" | "department" | "initials", string>>;

export function validateMemberForm(f: MemberForm): FormErrors {
  const e: FormErrors = {};
  if (!f.name.trim()) e.name = "Enter a name.";
  if (!f.role.trim()) e.role = "Enter a job title.";
  if (!f.department.trim()) e.department = "Enter a department.";
  if (f.initials.trim().length > 3) e.initials = "Use up to 3 letters.";
  return e;
}

/** Shared by "Edit profile" and "Add Member". */
export function MemberFields({
  form,
  setForm,
  errors,
  members,
  excludeIds,
  autoFocus,
}: {
  form: MemberForm;
  setForm: (f: MemberForm) => void;
  errors: FormErrors;
  members: TeamMember[];
  excludeIds: Set<string>;
  autoFocus?: boolean;
}) {
  const set = <K extends keyof MemberForm>(key: K, value: MemberForm[K]) => setForm({ ...form, [key]: value });
  const departments = Array.from(new Set(members.map((m) => m.department))).sort();
  const roles = Array.from(new Set(members.map((m) => m.role))).sort();
  const managerOptions = [
    { value: "", label: "No one (top of chart)" },
    ...members.filter((m) => !excludeIds.has(m.id)).map((m) => ({ value: m.id, label: `${m.name} — ${m.role}` })),
  ];
  const preview = form.initials.trim() || makeInitials(form.name || "?");

  return (
    <div className={formStyles.stack}>
      <div className={styles.editHero}>
        <Avatar initials={preview.toUpperCase().slice(0, 3)} size={64} />
        <p className={styles.editHeroNote}>
          Avatars use initials. Leave the initials blank to generate them from the name.
        </p>
      </div>
      <Field label="Full name" required error={errors.name}>
        <TextInput value={form.name} onChange={(e) => set("name", e.target.value)} invalid={!!errors.name} data-autofocus={autoFocus || undefined} />
      </Field>
      <div className={formStyles.grid2}>
        <Field label="Job title" required error={errors.role}>
          <TextInput value={form.role} onChange={(e) => set("role", e.target.value)} invalid={!!errors.role} list="role-options" />
        </Field>
        <Field label="Department" required error={errors.department}>
          <TextInput value={form.department} onChange={(e) => set("department", e.target.value)} invalid={!!errors.department} list="department-options" />
        </Field>
      </div>
      <datalist id="role-options">{roles.map((r) => <option key={r} value={r} />)}</datalist>
      <datalist id="department-options">{departments.map((d) => <option key={d} value={d} />)}</datalist>
      <div className={formStyles.grid2}>
        <Field label="Reports to">
          <Dropdown ariaLabel="Reports to" value={form.managerId} onChange={(v) => set("managerId", v)} options={managerOptions} />
        </Field>
        <Field label="Status">
          <Dropdown
            ariaLabel="Status"
            value={form.status}
            onChange={(v) => set("status", v)}
            options={[
              { value: "active", label: "Active" },
              { value: "offline", label: "Offline" },
            ]}
          />
        </Field>
      </div>
      <div className={formStyles.grid2}>
        <Field label="Avatar initials" error={errors.initials} hint="2–3 letters">
          <TextInput value={form.initials} maxLength={3} onChange={(e) => set("initials", e.target.value.toUpperCase())} invalid={!!errors.initials} />
        </Field>
        <Field label="Skills" hint="Separate with commas">
          <TextInput value={form.skills} onChange={(e) => set("skills", e.target.value)} placeholder="e.g. Figma, Prototyping" />
        </Field>
      </div>
    </div>
  );
}

export function ProfileModal() {
  const { profileId, members, closeProfile } = useApp();
  const member = profileId ? members.find((m) => m.id === profileId) : undefined;
  // `key` resets edit state whenever a different profile opens.
  return member ? <ProfileBody key={member.id} member={member} onClose={closeProfile} /> : null;
}

function ProfileBody({ member, onClose }: { member: TeamMember; onClose: () => void }) {
  const { me, members, refreshMembers, openSettings } = useApp();
  const toast = useToast();
  const isMe = member.id === me.id;
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<MemberForm>(() => toMemberForm(member));
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const manager = members.find((m) => m.id === member.managerId);
  const reports = members.filter((m) => m.managerId === member.id);

  const startEdit = () => {
    setForm(toMemberForm(member));
    setErrors({});
    setServerError(undefined);
    setMode("edit");
  };

  const cancelEdit = () => {
    setMode("view");
    setErrors({});
    setServerError(undefined);
    toast.info("Changes discarded");
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = validateMemberForm(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setServerError(undefined);
    try {
      await memberService.update(member.id, {
        name: form.name,
        role: form.role,
        department: form.department,
        initials: form.initials,
        status: form.status,
        managerId: form.managerId || null,
        skills: parseSkills(form.skills),
      });
      await refreshMembers();
      toast.success(isMe ? "Profile saved" : `${form.name.trim()} updated`);
      setMode("view");
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await memberService.remove(member.id);
      await refreshMembers();
      toast.success(`${member.name} removed from the team`);
      setConfirmDelete(false);
      onClose();
    } catch (err) {
      setConfirmDelete(false);
      toast.error(errorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  const excluded = new Set([member.id, ...getDescendantIds(members, member.id)]);

  return (
    <>
      <Modal
        open
        onClose={onClose}
        locked={saving}
        title={mode === "edit" ? (isMe ? "Edit profile" : `Edit ${member.name}`) : isMe ? "My profile" : "Profile"}
        footerStart={
          mode === "view" && !isMe ? (
            <Button variant="danger" icon={<Trash2 size={15} />} onClick={() => setConfirmDelete(true)}>
              Delete member
            </Button>
          ) : undefined
        }
        footer={
          mode === "edit" ? (
            <>
              {/* Explicit keys: without them React recycles the "Edit" button's DOM node as "Save changes"
                  (type="submit") mid-click, and the very click that opens edit mode also submits the form. */}
              <Button key="cancel" variant="outline" onClick={cancelEdit} disabled={saving}>
                Cancel
              </Button>
              <Button key="save" variant="primary" type="submit" form="profile-form" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </>
          ) : (
            <>
              {isMe && (
                <Button
                  key="settings"
                  variant="outline"
                  icon={<Settings size={15} />}
                  onClick={() => {
                    onClose();
                    openSettings();
                  }}
                >
                  Settings
                </Button>
              )}
              <Button key="edit" variant="outline" icon={<Pencil size={15} />} onClick={startEdit}>
                {isMe ? "Edit profile" : "Edit member"}
              </Button>
            </>
          )
        }
      >
        {mode === "view" ? (
          <>
            <div className={styles.hero}>
              <Avatar initials={member.initials} size={72} />
              <div className={styles.heroText}>
                <h3 className={styles.name}>{member.name}</h3>
                <p className={styles.role}>{member.role}</p>
                <div className={styles.heroTags}>
                  <Tag tone={member.status === "active" ? "active" : "offline"}>{member.status === "active" ? "Active" : "Offline"}</Tag>
                  <Tag tone={member.availability === "free" ? "free" : "in-meeting"}>{member.availability === "free" ? "Free" : "In Meeting"}</Tag>
                </div>
              </div>
            </div>
            <dl className={styles.details}>
              <dt>Department</dt>
              <dd>{member.department}</dd>
              <dt>Reports to</dt>
              <dd>{manager ? `${manager.name} · ${manager.role}` : <span className={styles.muted}>No one — top of the chart</span>}</dd>
              <dt>Direct reports</dt>
              <dd>{reports.length ? reports.map((r) => r.name).join(", ") : <span className={styles.muted}>None</span>}</dd>
              <dt>Skills</dt>
              <dd>
                {member.skills.length ? (
                  <span className={styles.chips}>
                    {member.skills.map((s) => (
                      <span key={s} className={styles.chip}>
                        {s}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className={styles.muted}>None listed</span>
                )}
              </dd>
            </dl>
          </>
        ) : (
          <form id="profile-form" onSubmit={save} noValidate>
            <FormError message={serverError} />
            <div style={{ height: serverError ? 12 : 0 }} />
            <MemberFields form={form} setForm={setForm} errors={errors} members={members} excludeIds={excluded} autoFocus />
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${member.name}?`}
        message={
          <>
            This removes {member.name} from the directory and the org chart.
            {reports.length > 0 && " Their direct reports will move up to their manager."} This can&apos;t be undone.
          </>
        }
        confirmLabel="Delete member"
        busy={deleting}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
