/* Run with: npx tsx src/lib/auth.test.ts */
import assert from "node:assert/strict";
import { safeNextPath } from "./safe-next";
import { decodeSessionPayload, looksSignedIn } from "./session-token";

// ---- safeNextPath: only same-site relative paths survive ----
for (const ok of ["/", "/team", "/team?x=1", "/actions?task=t-46", "/calendar?event=e-retro"]) assert.equal(safeNextPath(ok), ok, ok);
for (const bad of [
  null, undefined, "", "team", "https://evil.example", "http://evil.example/x", "//evil.example", "///evil.example", "/\\evil.example",
  "\\\\evil.example", "javascript:alert(1)", "/signin", "/signin?next=/x", "/api/members", "/ok\nSet-Cookie: a=b", "/ok\u0000",
]) assert.equal(safeNextPath(bad as string | null), "/", String(bad));

// ---- session token decoding is not verification, but must be strict about shape and expiry ----
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Date.now();
const good = `${b64({ uid: "m-1", iat: now / 1000, exp: now / 1000 + 60 })}.sig`;
assert.equal(decodeSessionPayload(good)?.uid, "m-1");
assert.equal(looksSignedIn(good, now), true);
assert.equal(looksSignedIn(good, now + 61_000), false, "expired");
for (const bad of [undefined, "", "garbage", ".", "a.b", `${b64({ uid: 1, iat: 1, exp: 9e12 })}.x`, `${b64({ uid: "m", exp: 9e12 })}.x`, `${b64("str")}.x`, "%%%.x"]) {
  assert.equal(decodeSessionPayload(bad as string | undefined), null, String(bad));
  assert.equal(looksSignedIn(bad as string | undefined, now), false, String(bad));
}

console.log("auth helpers: all assertions passed");
