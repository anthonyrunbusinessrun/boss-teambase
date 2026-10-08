"use client";

import { useRef } from "react";
import { useApp } from "@/providers/AppProvider";
import { useRealtimeEvents } from "@/providers/RealtimeProvider";

/** Keeps the sidebar's unread badge live, on every page, by re-counting when something that could change it happens. */
export function UnreadSync() {
  const { refreshUnread } = useApp();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useRealtimeEvents((event) => {
    const relevant = event.type === "ready" || event.type === "conversation" || (event.type === "message" && event.change === "created");
    if (!relevant) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void refreshUnread().catch(() => undefined), 250);
  });
  return null;
}
