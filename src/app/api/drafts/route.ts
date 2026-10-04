import { getDb, logActivity, newId } from "@/server/db";
import { fail, ok, readJson, str } from "@/server/http";
import type { ReportDraft } from "@/types/models";

export const dynamic = "force-dynamic";

export async function GET() {
  return ok(getDb().drafts);
}

/** POST { templateId, title? } */
export async function POST(req: Request) {
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
  logActivity(db, { text: "created a draft:", object: draft.title, objectHref: `/reports?template=${tpl.id}`, objectTone: "strong" });
  return ok(draft, 201);
}
