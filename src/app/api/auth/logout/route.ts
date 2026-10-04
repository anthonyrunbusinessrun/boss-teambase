import { clearSessionCookie, isSameOrigin, isSecureRequest } from "@/server/auth";
import { fail, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/** POST — ends the session. Works even if the cookie is already invalid. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return fail("Cross-origin request blocked", 403);
  const res = ok({ ok: true });
  clearSessionCookie(res, isSecureRequest(req));
  return res;
}
