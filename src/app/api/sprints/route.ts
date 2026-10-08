import { getDb, logActivity, mutateDb } from "@/server/db";
import { fail, ok, readJson } from "@/server/http";
import { createSprint, parseSprintFields, sprintsOf } from "@/server/actions";
import { publishSprint } from "@/server/actions-events";
import { isCompanyId } from "@/config/companies";
import { dateKey } from "@/lib/time";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";

/** GET ?company=boss — that company's sprints (omit `company` for all). */
export const GET = authed(async (req: Request) => {
  const company = new URL(req.url).searchParams.get("company");
  if (company && !isCompanyId(company)) return fail("Unknown company", 400);
  const db = await getDb();
  return ok(company && isCompanyId(company) ? sprintsOf(db, company) : db.sprints);
});

/** POST { companyId, name?, goal?, startDate?, endDate? } — plan a new sprint (it starts as "planned"). */
export const POST = authed(async (req: Request, _ctx, me) => {
  const body = await readJson(req);
  if (!body) return fail("Invalid request body");
  if (!isCompanyId(body.companyId)) return fail("Choose a company: BOSS, RLI or LL.");
  const companyId = body.companyId;
  const parsed = parseSprintFields(body);
  if (!parsed.ok) return fail(parsed.error, parsed.status);
  const sprint = await mutateDb((db) => {
    const created = createSprint(db, companyId, parsed.fields, dateKey(new Date(), "Asia/Manila"));
    if (created.endDate < created.startDate) return null;
    logActivity(db, me, { text: "planned", object: `${created.name}`, objectHref: `/actions/${companyId}/sprints`, objectTone: "link" });
    return created;
  });
  if (!sprint) return fail("The sprint can't end before it starts.");
  publishSprint(companyId, "created", sprint.id, me);
  return ok(sprint, 201);
});
