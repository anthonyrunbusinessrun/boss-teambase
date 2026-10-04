"use client";

import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { Button } from "@/components/buttons/Button";
import { Field, FormError } from "@/components/forms/Field";
import { TextArea, TextInput } from "@/components/forms/Inputs";
import formStyles from "@/components/forms/forms.module.css";
import { Modal } from "@/components/modals/Modal";
import { useToast } from "@/providers/ToastProvider";
import { errorMessage, reportService } from "@/services";
import { formatBytes } from "@/lib/utils";
import type { ReportTemplate } from "@/types/models";
import styles from "./reports.module.css";

interface UploadReportModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: (tpl: ReportTemplate) => void;
}

export function UploadReportModal(props: UploadReportModalProps) {
  return props.open ? <UploadForm {...props} /> : null;
}

/**
 * "Upload Report" adds a custom template to the Document Center. Only the file's name is kept —
 * binary upload/storage arrives with the real backend.
 */
function UploadForm({ onClose, onSaved }: UploadReportModalProps) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [nameError, setNameError] = useState<string>();
  const [serverError, setServerError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const pick = (f: File | null) => {
    setFile(f);
    if (f && !name.trim()) setName(f.name.replace(/\.[^.]+$/, ""));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setNameError("Give the report a name.");
      return;
    }
    setNameError(undefined);
    setSaving(true);
    try {
      const tpl = await reportService.upload({ name, description, fileName: file?.name });
      toast.success("Report uploaded");
      onSaved?.(tpl);
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
      title="Upload report"
      subtitle="Adds a custom report to the Document Center."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="upload-form" disabled={saving}>
            {saving ? "Uploading…" : "Upload report"}
          </Button>
        </>
      }
    >
      <form id="upload-form" className={formStyles.stack} onSubmit={submit} noValidate>
        <FormError message={serverError} />
        <div>
          <input ref={fileRef} type="file" hidden onChange={(e) => pick(e.target.files?.[0] ?? null)} aria-label="Choose a report file" />
          <button type="button" className={styles.dropzone} onClick={() => fileRef.current?.click()}>
            <UploadCloud size={22} />
            {file ? (
              <span>
                <strong>{file.name}</strong>
                <span className={styles.dropMeta}> · {formatBytes(file.size)} — click to replace</span>
              </span>
            ) : (
              <span>
                <strong>Choose a file</strong>
                <span className={styles.dropMeta}> · optional</span>
              </span>
            )}
          </button>
        </div>
        <Field label="Report name" required error={nameError}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} invalid={!!nameError} placeholder="e.g. Quarterly review" data-autofocus />
        </Field>
        <Field label="Description">
          <TextArea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this report cover?" />
        </Field>
      </form>
    </Modal>
  );
}
