import { forwardRef } from "react";
import { Search } from "lucide-react";
import { cx } from "@/lib/utils";
import styles from "./forms.module.css";

interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  invalid?: boolean;
  wrapperClassName?: string;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { icon, invalid, wrapperClassName, className, ...rest },
  ref,
) {
  return (
    <span className={cx(styles.control, invalid && styles.invalid, wrapperClassName)}>
      {icon && <span className={styles.controlIcon}>{icon}</span>}
      <input ref={ref} className={cx(styles.input, className)} aria-invalid={invalid || undefined} {...rest} />
    </span>
  );
});

export const SearchInput = forwardRef<HTMLInputElement, Omit<TextInputProps, "icon">>(function SearchInput(props, ref) {
  return <TextInput ref={ref} type="search" icon={<Search size={16} />} autoComplete="off" {...props} />;
});

export const TextArea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cx(styles.textarea, className)} {...rest} />;
});

export function RangeInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className={styles.rangeRow}>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        aria-label={label}
        className={styles.range}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className={styles.rangeValue}>{value}%</span>
    </div>
  );
}
