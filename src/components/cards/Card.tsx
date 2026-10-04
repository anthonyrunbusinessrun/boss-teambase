import { cx } from "@/lib/utils";
import styles from "./Card.module.css";

export type CardVariant = "bento" | "royal" | "neutral" | "panel";

interface CardProps extends React.HTMLAttributes<HTMLElement> {
  variant?: CardVariant;
  as?: "div" | "section" | "article" | "aside";
  /** Remove the default 20–24px inner padding (for cards that manage their own layout). */
  flush?: boolean;
  interactive?: boolean;
  selected?: boolean;
}

/** The four card surfaces from design system §6.7. */
export function Card({ variant = "neutral", as: Tag = "div", flush, interactive, selected, className, children, ...rest }: CardProps) {
  return (
    <Tag
      className={cx(styles.card, styles[variant], !flush && styles.padded, interactive && styles.interactive, selected && styles.selected, className)}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function CardTitle({ children, className, id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <h2 id={id} className={cx(styles.title, className)}>
      {children}
    </h2>
  );
}
