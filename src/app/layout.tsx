import type { Metadata, Viewport } from "next";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Teambase", template: "%s · Teambase" },
  description: "Teambase — a remote-team collaboration workspace (BOSS product family).",
};

export const viewport: Viewport = {
  themeColor: "#05102a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
