"use client";

import { AppProvider } from "@/providers/AppProvider";
import { RealtimeProvider } from "@/providers/RealtimeProvider";
import { UnreadSync } from "./UnreadSync";
import { ToastProvider } from "@/providers/ToastProvider";
import { AppShell } from "./AppShell";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AppProvider>
        <RealtimeProvider>
          <UnreadSync />
          <AppShell>{children}</AppShell>
        </RealtimeProvider>
      </AppProvider>
    </ToastProvider>
  );
}
