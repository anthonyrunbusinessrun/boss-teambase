/**
 * Session cookie constants + a dependency-free payload decoder.
 * Safe to import from `proxy.ts` (which should not rely on Node globals or shared state).
 * Decoding here is NOT verification — the signature is only checked on the server, next to the data (server/auth.ts).
 */
export const SESSION_COOKIE = "teambase_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

export interface SessionPayload {
  /** Team member id */
  uid: string;
  /** issued-at / expiry, seconds since epoch */
  iat: number;
  exp: number;
}

export function decodeSessionPayload(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const body = token.split(".")[0];
  if (!body) return null;
  try {
    const b64 = body.replace(/-/g, "+").replace(/_/g, "/");
    const parsed = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "=")));
    if (typeof parsed?.uid === "string" && typeof parsed.exp === "number" && typeof parsed.iat === "number") return parsed;
  } catch {
    /* malformed token */
  }
  return null;
}

/** Optimistic "does this look like a live session" check, used for redirects only. */
export function looksSignedIn(token: string | undefined, nowMs: number = Date.now()): boolean {
  const p = decodeSessionPayload(token);
  return !!p && p.exp * 1000 > nowMs;
}
