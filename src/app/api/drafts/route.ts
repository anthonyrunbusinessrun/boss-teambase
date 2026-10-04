import { getDb, logActivity, newId } from "@/server/db";
import { fail, ok, readJson, str } from "@/server/http";
import type { ReportDraft } from "@/types/models";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";

export const GET = authed(async () => {
  return ok(getDb().drafts);
});

/** POST { templateId, title? } */
export const POST = authed(async (req: Request, _ctx, me) => {
  const body = await readJson(req);
  const db = getDb();
  const tpl = db.templates.find((t) => t.id === str(body?.templateId));
  if (!tpl) return fail("Choose a template first", 404);
  const draft: ReportDraft = {
    id: newId("draft"),
    templateId: tpl.id,
    title: str(body?.title) || tpl.documentTitle,
    createdAt: new Date().toISOString(),
  };
  db.drafts.unshift(draft);
  logActivity(db, me, { text: "created a draft:", object: draft.title, objectHref: `/reports?template=${tpl.id}`, objectTone: "strong" });
  return ok(draft, 201);
});
