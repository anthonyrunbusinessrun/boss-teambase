"use client";

import { Button } from "@/components/buttons/Button";
import { Modal } from "./Modal";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation for destructive actions (delete). The confirm button names the action. */
export function ConfirmDialog({ open, title, message, confirmLabel = "Delete", cancelLabel = "Cancel", busy, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      locked={busy}
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant="dangerSolid" onClick={onConfirm} disabled={busy} data-autofocus>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </>
      }
    >
      <p style={{ fontSize: 14, color: "var(--text-body)", lineHeight: 1.55 }}>{message}</p>
    </Modal>
  );
}
