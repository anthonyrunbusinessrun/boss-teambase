"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { sessionService } from "@/services";
import type { ID, RealtimeEvent } from "@/types/models";

type Listener = (event: RealtimeEvent) => void;

interface RealtimeValue {
  /** People who are online right now (only ever registered members). */
  online: ReadonlySet<ID>;
  /** True once the live connection has told us who is online. Until then, show the server's snapshot instead. */
  ready: boolean;
  connected: boolean;
  isOnline: (memberId: ID) => boolean;
  subscribe: (listener: Listener) => () => void;
}

const RealtimeContext = createContext<RealtimeValue | null>(null);

/**
 * The app's single live connection (Server-Sent Events). Keeping it open is what makes you "online", so it lives here —
 * above every page — and not inside the Channels screen. Browsers reconnect on their own; each `ready` event after the
 * first lets screens re-sync anything they missed while disconnected.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState<ReadonlySet<ID>>(() => new Set());
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const listeners = useRef(new Set<Listener>());

  useEffect(() => {
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let attempt = 0;

    const open = () => {
      source = new EventSource("/api/channels/events");
      source.onmessage = (message) => {
        let event: RealtimeEvent;
        try {
          event = JSON.parse(message.data) as RealtimeEvent;
        } catch {
          return;
        }
        if (event.type === "ready") {
          attempt = 0;
          setOnline(new Set(event.online));
          setReady(true);
          setConnected(true);
        } else if (event.type === "presence") {
          setOnline((prev) => {
            const next = new Set(prev);
            if (event.online) next.add(event.memberId);
            else next.delete(event.memberId);
            return next;
          });
        }
        listeners.current.forEach((fn) => fn(event));
      };
      source.onerror = () => {
        setConnected(false);
        // The browser retries by itself while CONNECTING. If it gave up (CLOSED — e.g. our session ended), check the
        // session (a 401 redirects to sign-in) and try again with a growing delay.
        if (source?.readyState === EventSource.CLOSED && !stopped) {
          source.close();
          void sessionService.get().catch(() => undefined);
          timer = setTimeout(open, Math.min(30_000, 2_000 * 2 ** attempt++));
        }
      };
    };

    open();
    return () => {
      stopped = true;
      clearTimeout(timer);
      source?.close();
    };
  }, []);

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => void listeners.current.delete(listener);
  }, []);

  const value = useMemo<RealtimeValue>(
    () => ({ online, ready, connected, isOnline: (id) => online.has(id), subscribe }),
    [online, ready, connected, subscribe],
  );
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useRealtime must be used inside <RealtimeProvider>");
  return ctx;
}

/** Subscribe to live events for as long as the component is mounted. The handler may change on every render. */
export function useRealtimeEvents(handler: Listener): void {
  const { subscribe } = useRealtime();
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => subscribe((event) => latest.current(event)), [subscribe]);
}
