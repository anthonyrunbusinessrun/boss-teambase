export interface NavItemConfig {
  href: string;
  /** Sidebar label (order is fixed by the design system). */
  label: string;
  /** Shown in the sidebar. Emoji render in full colour, which is what makes the rail stand out. */
  emoji: string;
  /** Title shown in the header for this screen. */
  pageTitle: string;
  /** Soft blue glow under the header (design §2.5: every screen except Home and World Clocks). */
  glow: boolean;
  /** Which meter the sidebar footer shows on this screen. */
  meter: "api" | "latency";
  /** Header search placeholder (global search is contextual on World Clocks). */
  searchPlaceholder: string;
  /** Header label for the primary clock (World Clocks says "MANILA TIME"). */
  primaryClockLabel?: string;
  /** Screens not yet designed render a "Coming soon" placeholder. */
  placeholder?: boolean;
  showBadge?: boolean;
}

export const NAV_ITEMS: NavItemConfig[] = [
  { href: "/", label: "Home", emoji: "🏠", pageTitle: "Dashboard", glow: false, meter: "api", searchPlaceholder: "Search anything…" },
  { href: "/channels", label: "Channels", emoji: "💬", pageTitle: "Channels", glow: true, meter: "api", searchPlaceholder: "Search anything…", showBadge: true },
  { href: "/actions", label: "Actions", emoji: "✅", pageTitle: "Actions", glow: true, meter: "api", searchPlaceholder: "Search anything…" },
  { href: "/calendar", label: "Calendar", emoji: "📅", pageTitle: "Calendar", glow: true, meter: "api", searchPlaceholder: "Search anything…" },
  // Screen 05 — not designed yet
  { href: "/projects", label: "Projects", emoji: "📁", pageTitle: "Projects", glow: false, meter: "api", searchPlaceholder: "Search anything…", placeholder: true },
  // Screen 06 — not designed yet
  { href: "/ai-command", label: "AI Command", emoji: "🤖", pageTitle: "AI Command", glow: false, meter: "api", searchPlaceholder: "Search anything…", placeholder: true },
  { href: "/team", label: "Team", emoji: "👥", pageTitle: "Team Directory", glow: true, meter: "api", searchPlaceholder: "Search anything…" },
  { href: "/reports", label: "Reports", emoji: "📊", pageTitle: "Document Center", glow: true, meter: "api", searchPlaceholder: "Search anything…" },
  { href: "/world-clock", label: "World Clock", emoji: "🌍", pageTitle: "World Clocks", glow: false, meter: "latency", searchPlaceholder: "Search timezones…", primaryClockLabel: "MANILA TIME" },
];

export function navForPath(pathname: string): NavItemConfig {
  if (pathname === "/") return NAV_ITEMS[0];
  return NAV_ITEMS.find((i) => i.href !== "/" && (pathname === i.href || pathname.startsWith(i.href + "/"))) ?? NAV_ITEMS[0];
}
