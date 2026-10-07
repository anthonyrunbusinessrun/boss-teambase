import { getDbVersion } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const version = await getDbVersion();
    return Response.json({ ok: true, database: "connected", version }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, database: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
