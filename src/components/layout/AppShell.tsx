"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/navigation/Sidebar";
import { Header } from "@/components/header/Header";
import { AppOverlays } from "./AppOverlays";
import { navForPath } from "@/config/navigation";
import { cx } from "@/lib/utils";
import styles from "./AppShell.module.css";

interface PageSearch {
  query: string;
  setQuery: (q: string) => void;
}
const PageSearchContext = createContext<PageSearch>({ query: "", setQuery: () => undefined });

/** The header search filters the current screen in place (used by World Clocks). */
export const usePageSearch = () => useContext(PageSearchContext);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const nav = navForPath(pathname);
  const [state, setState] = useState({ path: pathname, query: "" });
  // The in-place query belongs to one screen; leaving it resets the filter.
  const query = state.path === pathname ? state.query : "";
  const ctx = useMemo<PageSearch>(() => ({ query, setQuery: (q) => setState({ path: pathname, query: q }) }), [query, pathname]);
  const local = nav.href === "/world-clock" ? { value: query, onChange: ctx.setQuery } : undefined;

  return (
    <PageSearchContext.Provider value={ctx}>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <div className={styles.shell}>
        <Sidebar />
        <div className={styles.main}>
          <Header title={nav.pageTitle} searchPlaceholder={nav.searchPlaceholder} primaryClockLabel={nav.primaryClockLabel} localSearch={local} />
          <main id="main" className={cx(styles.content, nav.glow && styles.glow)}>
            {children}
          </main>
        </div>
      </div>
      <AppOverlays />
    </PageSearchContext.Provider>
  );
}
