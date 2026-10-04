import { AlertTriangle, Loader2 } from "lucide-react";
import { cx } from "@/lib/utils";
import { Button } from "@/components/buttons/Button";
import styles from "./shared.module.css";

export function LoadingState({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div className={cx(styles.state, className)} role="status">
      <Loader2 className={styles.spin} size={22} />
      <span>{label}</span>
    </div>
  );
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/** An empty screen is an invitation to act. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cx(styles.state, className)}>
      {icon && <div className={styles.stateIcon}>{icon}</div>}
      <p className={styles.stateTitle}>{title}</p>
      {description && <p className={styles.stateText}>{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div className={cx(styles.state, className)} role="alert">
      <div className={cx(styles.stateIcon, styles.stateIconError)}>
        <AlertTriangle size={22} />
      </div>
      <p className={styles.stateTitle}>Something went wrong</p>
      <p className={styles.stateText}>{message}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
