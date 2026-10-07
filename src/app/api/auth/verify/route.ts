import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { mutateDb } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const provided = createHash("sha256").update(token).digest();
  const verified = token.length >= 32 && await mutateDb((db) => {
    const now = Date.now();
    const account = db.accounts.find((candidate) => {
      if (!candidate.verificationTokenHash || !candidate.verificationExpiresAt) return false;
      const expected = Buffer.from(candidate.verificationTokenHash, "hex");
      return expected.length === provided.length && timingSafeEqual(expected, provided) && Date.parse(candidate.verificationExpiresAt) > now;
    });
    if (!account) return false;
    account.emailVerifiedAt = new Date().toISOString();
    delete account.verificationTokenHash;
    delete account.verificationExpiresAt;
    return true;
  });
  const redirect = new URL("/signin", url.origin);
  redirect.searchParams.set(verified ? "verified" : "verification-error", "1");
  return NextResponse.redirect(redirect);
}
