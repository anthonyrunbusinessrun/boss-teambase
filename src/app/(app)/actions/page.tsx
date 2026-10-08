import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEFAULT_COMPANY, isCompanyId } from "@/config/companies";
import { taskHref } from "@/server/actions";
import { getSessionUser } from "@/server/auth";
import { getDb } from "@/server/db";

/**
 * `/actions` has no screen of its own:
 *  - an older link like `/actions?task=t-48` goes to wherever that task lives now (its company's board, or its sprints screen);
 *  - otherwise you land on the board of the company you used last (BOSS the first time).
 */
export default async function ActionsIndex({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  const { task } = await searchParams;
  if (task && (await getSessionUser())) {
    const db = await getDb();
    const found = db.tasks.find((t) => t.id === task);
    if (found) redirect(taskHref(db, found));
  }
  const last = (await cookies()).get("tb_company")?.value;
  redirect(`/actions/${isCompanyId(last) ? last : DEFAULT_COMPANY}/board`);
}
