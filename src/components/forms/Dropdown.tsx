"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cx } from "@/lib/utils";
import styles from "./forms.module.css";

export interface DropdownOption<T extends string = string> {
  value: T;
  label: string;
}

interface DropdownProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: DropdownOption<T>[];
  ariaLabel: string;
  placeholder?: string;
  /** Overrides the trigger text (e.g. a filter that reads "Assignee" while set to "all"). */
  displayLabel?: string;
  /** "filter" = compact toolbar dropdown · "field" = full-width form control */
  variant?: "filter" | "field";
  className?: string;
  disabled?: boolean;
}

interface MenuPos {
  top: number;
  left: number;
  minWidth: number;
  maxHeight: number;
}

/**
 * Accessible listbox dropdown. The menu is portaled and fixed-positioned, so it works inside
 * scrolling modals without being clipped. Keyboard: ↑ ↓ Home End Enter Space Esc Tab.
 */
export function Dropdown<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  placeholder,
  displayLabel,
  variant = "field",
  className,
  disabled,
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const close = useCallback(() => setOpen(false), []);

  const openMenu = useCallback(() => {
    const el = buttonRef.current;
    if (!el || disabled) return;
    const r = el.getBoundingClientRect();
    const menuH = Math.min(280, options.length * 34 + 8);
    const below = window.innerHeight - r.bottom - 12;
    const up = below < menuH && r.top > below;
    setPos({
      left: r.left,
      minWidth: r.width,
      top: up ? Math.max(8, r.top - menuH - 6) : r.bottom + 6,
      maxHeight: Math.max(120, Math.min(280, up ? r.top - 16 : below)),
    });
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }, [disabled, options.length, selectedIndex]);

  // Close on outside press / Escape / resize / scroll elsewhere
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      close();
    };
    // The menu is fixed-positioned, so it must close if the page scrolls the trigger away. But scroll events
    // that don't move the trigger (e.g. a dialog settling as it opens) must not dismiss it.
    const anchor = buttonRef.current?.getBoundingClientRect();
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      const now = buttonRef.current?.getBoundingClientRect();
      if (anchor && now && Math.abs(now.top - anchor.top) < 2 && Math.abs(now.left - anchor.left) < 2) return;
      close();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, close]);

  // Keep the active option in view
  useLayoutEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const choose = (i: number) => {
    const opt = options[i];
    if (opt) onChange(opt.value);
    close();
    buttonRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(options.length - 1, i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(activeIndex);
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
      case "Tab":
        close();
        break;
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
        disabled={disabled}
        className={cx(styles.dropdown, variant === "filter" && styles.filter, className)}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span className={cx(styles.dropdownLabel, !selected && !displayLabel && styles.placeholder)}>{displayLabel ?? selected?.label ?? placeholder ?? "Select…"}</span>
        <ChevronDown size={16} className={styles.chevron} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            className={styles.menu}
            style={{ top: pos.top, left: pos.left, minWidth: pos.minWidth, maxHeight: pos.maxHeight }}
          >
            {options.map((o, i) => (
              <div
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                data-index={i}
                aria-selected={o.value === value}
                className={cx(styles.option, i === activeIndex && styles.optionActive, o.value === value && styles.optionSelected)}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
              >
                <span>{o.label}</span>
                {o.value === value && <Check size={14} className={styles.optionCheck} />}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
