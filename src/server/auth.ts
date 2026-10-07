/**
 * Sessions and request authentication.
 *
 * - Stateless session: an HMAC-SHA256-signed token in an HttpOnly, SameSite=Lax cookie.
 * - Every API route is wrapped in `authed()`, which verifies the signature and looks the user up — the proxy only does
 *   optimistic redirects, so no data is ever exposed by relying on it alone.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, decodeSessionPayload, type SessionPayload } from "@/lib/session-token";
import { getDb } from "./db";
import { fail } from "./http";
import type { ID, TeamMember } from "@/types/models";

/* ------------------------------ signing ------------------------------ */

const g = globalThis as unknown as { __teambaseSecret?: Buffer };

/**
 * SESSION_SECRET signs the cookies. If it isn't set, a random one is generated for this server process —
 * which is safe, just means everyone is signed out whenever the server restarts (the mock database resets then too).
 */
function secret(): Buffer {
  return (g.__teambaseSecret ??= process.env.SESSION_SECRET ? Buffer.from(process.env.SESSION_SECRET) : randomBytes(32));
}

const sign = (body: string) => createHmac("sha256", secret()).update(body).digest();

export function createSessionToken(userId: ID, nowMs: number = Date.now()): string {
  const iat = Math.floor(nowMs / 1000);
  const payload: SessionPayload = { uid: userId, iat, exp: iat + SESSION_TTL_SECONDS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body).toString("base64url")}`;
}

/** Returns the payload only if the signature is valid and the token hasn't expired. */
export function verifySessionToken(token: string | undefined, nowMs: number = Date.now()): SessionPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = sign(parts[0]);
  const given = Buffer.from(parts[1], "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const payload = decodeSessionPayload(token);
  return payload && payload.exp * 1000 > nowMs ? payload : null;
}

/* ------------------------------ cookies ------------------------------ */

/** `Secure` only over HTTPS, so plain-http local/LAN use still works. */
export function isSecureRequest(req: Request): boolean {
  return new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
}

const cookieBase = (secure: boolean) => ({ httpOnly: true, sameSite: "lax" as const, secure, path: "/" });

export function setSessionCookie(res: NextResponse, token: string, secure: boolean) {
  res.cookies.set({ name: SESSION_COOKIE, value: token, maxAge: SESSION_TTL_SECONDS, ...cookieBase(secure) });
}

export function clearSessionCookie(res: NextResponse, secure: boolean) {
  res.cookies.set({ name: SESSION_COOKIE, value: "", maxAge: 0, ...cookieBase(secure) });
}

/* ------------------------------ current user ------------------------------ */

export const emailFor = async (memberId: ID): Promise<string> =>
  (await getDb()).accounts.find((a) => a.memberId === memberId)?.email ?? "";

/** The signed-in team member, or null. Verifies the signature and that the account still exists. */
export async function getSessionUser(): Promise<TeamMember | null> {
  const payload = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!payload) return null;
  const db = await getDb();
  if (!db.accounts.some((a) => a.memberId === payload.uid)) return null;
  return db.members.find((m) => m.id === payload.uid) ?? null;
}

/** Blocks cross-site state-changing requests (defence in depth on top of SameSite=Lax). */
export function isSameOrigin(req: Request): boolean {
  if (req.method === "GET" || req.method === "HEAD") return true;
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Wraps an API route handler so it only runs for a signed-in user, and receives that user. */
export function authed<Ctx = unknown>(handler: (req: Request, ctx: Ctx, user: TeamMember) => Promise<Response> | Response) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    if (!isSameOrigin(req)) return fail("Cross-origin request blocked", 403);
    const user = await getSessionUser();
    if (!user) {
      const res = fail("Sign in to continue", 401);
      // A leftover/invalid cookie would make the proxy think we're signed in and bounce us between pages — drop it.
      clearSessionCookie(res, isSecureRequest(req));
      return res;
    }
    return handler(req, ctx, user);
  };
}
