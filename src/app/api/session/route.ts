import { authed, emailFor } from "@/server/auth";
import { ok } from "@/server/http";
import type { Session } from "@/types/models";

export const dynamic = "force-dynamic";

/** Who is signed in. 401 when nobody is (the client then sends them to /signin). */
export const GET = authed(async (_req, _ctx, user) => {
  const session: Session = { userId: user.id, email: emailFor(user.id) };
  return ok(session);
});
