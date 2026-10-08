import { getDb } from "@/server/db";
import { ok } from "@/server/http";
import { summarize } from "@/server/actions";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";

/** The three companies with their active sprint and live counts — what the folder cards show. */
export const GET = authed(async () => ok(summarize(await getDb())));
