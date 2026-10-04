"use client";

import { useMemo, useSyncExternalStore } from "react";

/**
 * One shared 1-second ticker for every clock on screen.
 * Returns `null` on the server / first paint so markup never mismatches during hydration.
 */
let snapshot = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    snapshot = Date.now();
    timer = setInterval(() => {
      snapshot = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

export function useNow(): Date | null {
  const ms = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => 0,
  );
  return useMemo(() => (ms ? new Date(ms) : null), [ms]);
}
