import { getDb } from "@/server/db";
import { ok } from "@/server/http";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";

export const GET = authed(async () => {
  return ok(getDb().activity.slice(0, 6));
});
