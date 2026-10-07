import { compare } from "bcryptjs";
import { createSessionToken, isSameOrigin, isSecureRequest, setSessionCookie } from "@/server/auth";
import { getDb } from "@/server/db";
import { fail, ok, readJson, str } from "@/server/http";

export const dynamic = "force-dynamic";

/** POST { email, password } — signs in a verified account. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return fail("Cross-origin request blocked", 403);
  const body = await readJson(req);
  const email = str(body?.email).toLowerCase();
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email) return fail("Enter your work email.");
  if (email.length > 254) return fail("Enter a valid email address.");
  if (!password) return fail("Enter your password.");

  const db = await getDb();
  const account = db.accounts.find((a) => a.email === email);
  const member = account ? db.members.find((m) => m.id === account.memberId) : undefined;
  if (!account || !member || !account.passwordHash || !(await compare(password, account.passwordHash))) {
    return fail("Email or password is incorrect.", 401);
  }
  if (!account.emailVerifiedAt) return fail("Verify your email before signing in.", 403);

  const res = ok({ userId: member.id, email: account.email });
  setSessionCookie(res, createSessionToken(member.id), isSecureRequest(req));
  return res;
}
