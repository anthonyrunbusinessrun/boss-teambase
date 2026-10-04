import { getDb, logActivity, newId } from "@/server/db";
import { fail, ok, readJson, str } from "@/server/http";
import type { ReportTemplate } from "@/types/models";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";

export const GET = authed(async () => {
  return ok(getDb().templates);
});

/** POST { name, description?, fileName? } — "Upload Report" adds a custom template. */
export const POST = authed(async (req: Request, _ctx, me) => {
  const body = await readJson(req);
  if (!body) return fail("Invalid request body");
  const name = str(body.name);
  if (!name) return fail("Give the report a name");
  const db = getDb();
  const tpl: ReportTemplate = {
    id: newId("tpl"),
    name,
    description: str(body.description) || "Uploaded report.",
    updatedAt: new Date().toISOString().slice(0, 10),
    kind: "custom",
    version: "v1.0",
    documentTitle: name,
    fileName: str(body.fileName) || undefined,
    sections: [
      { heading: "Summary", body: str(body.description) || "Add a short summary of this report." },
      ...(str(body.fileName) ? [{ heading: "Attached File", body: str(body.fileName) }] : []),
    ],
  };
  db.templates.unshift(tpl);
  logActivity(db, me, { text: "uploaded a report:", object: name, objectHref: `/reports?template=${tpl.id}`, objectTone: "strong" });
  return ok(tpl, 201);
});
