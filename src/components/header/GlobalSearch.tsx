"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { searchService } from "@/services";
import { useDismiss } from "@/hooks/useClickOutside";
import { cx } from "@/lib/utils";
import type { SearchResult } from "@/types/models";
import styles from "./Header.module.css";

interface GlobalSearchProps {
  placeholder: string;
  /** When provided the input filters the current screen in place (World Clocks) instead of searching everything. */
  local?: { value: string; onChange: (value: string) => void };
}

export function GlobalSearch({ placeholder, local }: GlobalSearchProps) {
  const router = useRouter();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [found, setFound] = useState<{ q: string; items: SearchResult[] } | null>(null);
  const reqId = useRef(0);

  const value = local ? local.value : text;
  const query = value.trim();
  useDismiss(rootRef, open, () => setOpen(false));

  useEffect(() => {
    if (local || !query) return;
    const id = ++reqId.current;
    const timer = setTimeout(() => {
      searchService
        .query(query)
        .then((items) => {
          if (id === reqId.current) {
            setFound({ q: query, items });
            setActive(0);
          }
        })
        .catch(() => {
          if (id === reqId.current) setFound({ q: query, items: [] });
        });
    }, 180);
    return () => clearTimeout(timer);
  }, [query, local]);

  const items = !local && found && found.q === query ? found.items : [];
  const settled = !local && !!query && found?.q === query;

  const set = (v: string) => {
    if (local) local.onChange(v);
    else {
      setText(v);
      setOpen(true);
    }
  };

  const go = (r: SearchResult) => {
    setText("");
    setOpen(false);
    router.push(r.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (local) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && open && items[active]) {
      e.preventDefault();
      go(items[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showPanel = !local && open && !!query && (settled || items.length > 0);
  let lastGroup = "";

  return (
    <div className={styles.searchWrap} ref={rootRef}>
      <div className={styles.search} role={local ? "search" : undefined}>
        <Search size={16} aria-hidden="true" />
        <input
          className={styles.searchInput}
          type="text"
          value={value}
          placeholder={placeholder}
          aria-label={placeholder.replace("…", "")}
          autoComplete="off"
          {...(local
            ? {}
            : {
                role: "combobox",
                "aria-expanded": showPanel,
                "aria-controls": showPanel ? listId : undefined,
                "aria-activedescendant": showPanel && items[active] ? `${listId}-${active}` : undefined,
              })}
          onChange={(e) => set(e.target.value)}
          onFocus={() => !local && setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {value && (
          <button type="button" className={styles.searchClear} aria-label="Clear search" onClick={() => set("")}>
            <X size={12} />
          </button>
        )}
      </div>

      {showPanel && (
        <div className={cx(styles.popover, styles.results)} id={listId} role="listbox" aria-label="Search results">
          {items.length === 0 ? (
            <p className={styles.resultsEmpty}>No results for “{query}”.</p>
          ) : (
            items.map((r, i) => {
              const heading = r.group !== lastGroup ? r.group : null;
              lastGroup = r.group;
              return (
                <div key={`${r.group}-${r.id}`}>
                  {heading && <div className={cx("section-label", styles.resultGroup)}>{heading}</div>}
                  <button
                    type="button"
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    className={cx(styles.result, i === active && styles.resultActive)}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(r)}
                  >
                    <span className={styles.resultTitle}>{r.title}</span>
                    {r.subtitle && <span className={styles.resultSub}>{r.subtitle}</span>}
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
