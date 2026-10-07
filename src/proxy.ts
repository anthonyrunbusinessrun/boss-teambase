import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, looksSignedIn } from "@/lib/session-token";
import { safeNextPath } from "@/lib/safe-next";

/**
 * Optimistic route protection (per the Next.js auth guide): redirect by looking at the cookie only.
 * It does NOT verify the signature — every API route does that itself via `authed()`, so a forged
 * cookie can open the page shell but never any data.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const signedIn = looksSignedIn(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith("/api/")) {
    if (signedIn || pathname.startsWith("/api/auth/") || pathname === "/api/health") return NextResponse.next();
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  if (pathname === "/signin") {
    return signedIn ? NextResponse.redirect(new URL(safeNextPath(request.nextUrl.searchParams.get("next")), request.url)) : NextResponse.next();
  }

  if (!signedIn) {
    const url = new URL("/signin", request.url);
    const next = safeNextPath(pathname + search);
    if (next !== "/") url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except Next's own assets and the public brand files.
  matcher: ["/((?!_next/static|_next/image|brand/|icon\\.png|favicon\\.ico).*)"],
};
