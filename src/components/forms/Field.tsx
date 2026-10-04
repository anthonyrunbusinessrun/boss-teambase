import { cx } from "@/lib/utils";
import styles from "./forms.module.css";

interface FieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

/** Label wraps the control, so clicking the label focuses it and screen readers announce it. */
export function Field({ label, required, hint, error, className, children }: FieldProps) {
  return (
    <label className={cx(styles.field, className)}>
      <span className={styles.label}>
        {label}
        {required && <span className={styles.required} aria-hidden="true">*</span>}
      </span>
      {children}
      {error ? <span className={styles.error} role="alert">{error}</span> : hint ? <span className={styles.hint}>{hint}</span> : null}
    </label>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className={styles.formError} role="alert">
      {message}
    </div>
  );
}
