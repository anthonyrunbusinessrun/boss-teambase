import { createSessionToken, isSameOrigin, isSecureRequest, setSessionCookie } from "@/server/auth";
import { getDb } from "@/server/db";
import { fail, ok, readJson, str } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * POST { email } — signs in as the team member with that work email. There is deliberately no password and no
 * sign-up: this is an internal prototype where "signing in" selects who you are, it does not prove it.
 * To add real authentication, verify a password / SSO assertion here — the session cookie, `authed()` and the
 * proxy that protect everything else stay exactly as they are.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return fail("Cross-origin request blocked", 403);
  const body = await readJson(req);
  const email = str(body?.email).toLowerCase();
  if (!email) return fail("Enter your work email.");
  if (email.length > 254) return fail("Enter a valid email address.");

  const db = getDb();
  const account = db.accounts.find((a) => a.email === email);
  const member = account ? db.members.find((m) => m.id === account.memberId) : undefined;
  if (!account || !member) return fail("We couldn't find an account for that email. Ask your workspace administrator for access.", 401);

  const res = ok({ userId: member.id, email: account.email });
  setSessionCookie(res, createSessionToken(member.id), isSecureRequest(req));
  return res;
}
