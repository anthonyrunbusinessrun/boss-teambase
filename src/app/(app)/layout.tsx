import { Providers } from "@/components/layout/Providers";

/** Everything behind sign-in: sidebar + header shell, session bootstrap and toasts. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
