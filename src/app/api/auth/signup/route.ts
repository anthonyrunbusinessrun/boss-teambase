import { createHash, randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { isSameOrigin } from "@/server/auth";
import { makeInitials, mutateDb, newId } from "@/server/db";
import { sendVerificationEmail } from "@/server/email";
import { fail, ok, readJson, str } from "@/server/http";
import type { TeamMember } from "@/types/models";

export const dynamic = "force-dynamic";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return fail("Cross-origin request blocked", 403);
  const body = await readJson(req);
  if (!body) return fail("Invalid request body");
  const name = str(body.name);
  const email = str(body.email).toLowerCase();
  const role = str(body.role);
  const department = str(body.department);
  const password = typeof body.password === "string" ? body.password : "";
  if (!name || name.length > 100) return fail("Enter your full name.");
  if (!EMAIL_PATTERN.test(email) || email.length > 254) return fail("Enter a valid work email.");
  if (!role || !department) return fail("Enter your job title and department.");
  if (password.length < 10 || password.length > 128) return fail("Use a password between 10 and 128 characters.");

  const passwordHash = await hash(password, 12);
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const result = await mutateDb((db) => {
    const existing = db.accounts.find((account) => account.email === email);
    if (existing?.emailVerifiedAt) return { error: "An account already exists for that email." } as const;

    let member = existing ? db.members.find((candidate) => candidate.id === existing.memberId) : undefined;
    if (!member) {
      member = {
        id: newId("m"), name, role, department, initials: makeInitials(name), status: "active",
        availability: "free", managerId: null, skills: [],
      } satisfies TeamMember;
      db.members.push(member);
    } else {
      Object.assign(member, { name, role, department, initials: makeInitials(name), status: "active" });
    }

    const now = new Date().toISOString();
    if (existing) Object.assign(existing, { passwordHash, verificationTokenHash: tokenHash, verificationExpiresAt: expiresAt, createdAt: existing.createdAt ?? now });
    else db.accounts.push({ memberId: member.id, email, passwordHash, verificationTokenHash: tokenHash, verificationExpiresAt: expiresAt, createdAt: now });
    return { memberId: member.id } as const;
  });
  if ("error" in result && result.error) return fail(result.error, 409);

  const origin = process.env.APP_URL?.replace(/\/$/, "") || new URL(req.url).origin;
  try {
    await sendVerificationEmail(email, name, `${origin}/api/auth/verify?token=${encodeURIComponent(token)}`);
  } catch (error) {
    console.error("Failed to send verification email", error);
    return fail("Your profile was created, but we couldn't send the verification email. Please try again shortly.", 502);
  }
  return ok({ message: "Check your email to verify your account." }, 201);
}
