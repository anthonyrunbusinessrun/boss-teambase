import { Card } from "@/components/cards/Card";
import styles from "./ComingSoon.module.css";

interface ComingSoonProps {
  screen: string;
  title: string;
  icon: React.ReactNode;
}

/** Placeholder for screens with no finalized design. Intentionally minimal. */
export function ComingSoon({ screen, title, icon }: ComingSoonProps) {
  return (
    <div className={styles.wrap}>
      <Card variant="bento" as="section" flush className={styles.card} aria-labelledby="coming-soon-title">
        <span className="micro-label">{screen}</span>
        <div className={styles.icon}>{icon}</div>
        <h2 id="coming-soon-title" className={styles.title}>
          {title}
        </h2>
        <span className={styles.pill}>Coming Soon</span>
        <p className={styles.text}>Not yet designed. This screen will appear here once its design is finalized.</p>
      </Card>
    </div>
  );
}
