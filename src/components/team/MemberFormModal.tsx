"use client";

import { useState } from "react";
import { Button } from "@/components/buttons/Button";
import { FormError } from "@/components/forms/Field";
import { Modal } from "@/components/modals/Modal";
import { MemberFields, parseSkills, validateMemberForm, type MemberForm } from "@/components/profile/ProfileModal";
import { useApp } from "@/providers/AppProvider";
import { useToast } from "@/providers/ToastProvider";
import { errorMessage, memberService } from "@/services";
import type { TeamMember } from "@/types/models";

interface MemberFormModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (member: TeamMember) => void;
}

export function MemberFormModal(props: MemberFormModalProps) {
  return props.open ? <AddMemberForm {...props} /> : null;
}

function AddMemberForm({ onClose, onCreated }: MemberFormModalProps) {
  const { members, refreshMembers } = useApp();
  const toast = useToast();
  // New people report to whoever is at the top of the chart unless you choose otherwise.
  const top = members.find((m) => !m.managerId);
  const [form, setForm] = useState<MemberForm>({ name: "", role: "", department: "", initials: "", status: "active", managerId: top?.id ?? "", skills: "" });
  const [errors, setErrors] = useState<ReturnType<typeof validateMemberForm>>({});
  const [serverError, setServerError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = validateMemberForm(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setServerError(undefined);
    try {
      const created = await memberService.create({
        name: form.name,
        role: form.role,
        department: form.department,
        initials: form.initials || undefined,
        status: form.status,
        managerId: form.managerId || null,
        skills: parseSkills(form.skills),
      });
      await refreshMembers();
      toast.success(`${created.name} added to the team`);
      onCreated?.(created);
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
      title="Add member"
      subtitle="They'll appear in the directory and on the org chart."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="add-member-form" disabled={saving}>
            {saving ? "Adding…" : "Add member"}
          </Button>
        </>
      }
    >
      <form id="add-member-form" onSubmit={submit} noValidate>
        <FormError message={serverError} />
        {serverError && <div style={{ height: 12 }} />}
        <MemberFields form={form} setForm={setForm} errors={errors} members={members} excludeIds={new Set()} autoFocus />
      </form>
    </Modal>
  );
}
