import { getDb } from "@/server/db";
import { ok } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return ok(getDb().activity.slice(0, 6));
}
