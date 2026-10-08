import { taskHref } from "@/server/actions";
import { getDb } from "@/server/db";
import { ok } from "@/server/http";
import type { SearchResult } from "@/types/models";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";

const has = (q: string, ...fields: Array<string | undefined>) => fields.some((f) => f?.toLowerCase().includes(q));

export const GET = authed(async (req: Request) => {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase();
  if (!q) return ok<SearchResult[]>([]);
  const db = await getDb();
  const out: SearchResult[] = [];

  db.members
    .filter((m) => has(q, m.name, m.role, m.department, ...m.skills))
    .slice(0, 4)
    .forEach((m) => out.push({ id: m.id, group: "People", title: m.name, subtitle: `${m.role} · ${m.department}`, href: `/team?member=${m.id}` }));

  db.conversations
    .filter((c) => c.type === "channel" && has(q, c.name, c.description))
    .slice(0, 4)
    .forEach((c) => out.push({ id: c.id, group: "Channels", title: `# ${c.name}`, subtitle: c.description, href: `/channels?c=${c.id}` }));

  db.tasks
    .filter((t) => has(q, t.title, t.key, t.description))
    .slice(0, 4)
    .forEach((t) => out.push({ id: t.id, group: "Actions", title: t.title, subtitle: `#${t.key}`, href: taskHref(db, t) }));

  db.events
    .filter((e) => has(q, e.title, e.location))
    .slice(0, 4)
    .forEach((e) => out.push({ id: e.id, group: "Calendar", title: e.title, subtitle: e.kind === "meeting" ? "Meeting" : "Event", href: `/calendar?event=${e.id}` }));

  db.templates
    .filter((t) => has(q, t.name, t.description))
    .slice(0, 4)
    .forEach((t) => out.push({ id: t.id, group: "Reports", title: t.name, subtitle: t.description, href: `/reports?template=${t.id}` }));

  return ok(out);
});
