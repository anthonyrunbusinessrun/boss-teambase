import { CURRENT_USER_ID } from "@/server/db";
import { ok } from "@/server/http";

export const dynamic = "force-dynamic";

/** Stand-in for real authentication: the signed-in user is fixed (Stad Osuyos). */
export async function GET() {
  return ok({ userId: CURRENT_USER_ID });
}
