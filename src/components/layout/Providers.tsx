"use client";

import { AppProvider } from "@/providers/AppProvider";
import { ToastProvider } from "@/providers/ToastProvider";
import { AppShell } from "./AppShell";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AppProvider>
        <AppShell>{children}</AppShell>
      </AppProvider>
    </ToastProvider>
  );
}
