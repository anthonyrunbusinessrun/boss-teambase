import Link from "next/link";
import { forwardRef } from "react";
import { cx } from "@/lib/utils";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "blue" | "outline" | "ghost" | "compact" | "tint" | "danger" | "dangerSolid";
export type ButtonSize = "sm" | "md" | "lg";

interface StyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  icon?: React.ReactNode;
  className?: string;
}

export function buttonClass({ variant = "outline", size = "md", block, className }: StyleProps) {
  return cx(styles.btn, styles[variant], size !== "md" && styles[size], block && styles.block, className);
}

type ButtonProps = StyleProps & React.ButtonHTMLAttributes<HTMLButtonElement>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, block, icon, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass({ variant, size, block, className })} {...rest}>
      {icon}
      {children}
    </button>
  );
});

type ButtonLinkProps = StyleProps & { href: string; children: React.ReactNode };

export function ButtonLink({ href, variant, size, block, icon, className, children }: ButtonLinkProps) {
  return (
    <Link href={href} className={buttonClass({ variant, size, block, className })}>
      {icon}
      {children}
    </Link>
  );
}

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  round?: boolean;
  active?: boolean;
}

/** 36px icon button. `round` = the royal bell-style button. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, round, active, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cx(styles.icon, round && styles.iconRound, active && styles.iconActive, className)}
      {...rest}
    >
      {children}
    </button>
  );
});
