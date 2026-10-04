/**
 * Single place where the UI talks to the backend.
 * Everything under /services goes through `request`, so pointing the app at a real
 * backend later means changing API_BASE (or this file) — not the components.
 */
import { safeNextPath } from "@/lib/safe-next";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api";

let redirecting = false;

/** The session ended (expired, signed out elsewhere, account removed): go to sign-in and come back afterwards. */
function sendToSignIn() {
  if (typeof window === "undefined" || redirecting) return;
  if (window.location.pathname.startsWith("/signin")) return;
  redirecting = true;
  const url = new URL("/signin", window.location.origin);
  url.searchParams.set("reason", "expired");
  const next = safeNextPath(window.location.pathname + window.location.search);
  if (next !== "/") url.searchParams.set("next", next);
  window.location.assign(url.toString());
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function request<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      cache: "no-store",
      ...rest,
      headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  }
  if (res.status === 401 && !path.startsWith("/auth/")) sendToSignIn();
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as T;
}

export const get = <T>(path: string) => request<T>(path);
export const post = <T>(path: string, json?: unknown) => request<T>(path, { method: "POST", json: json ?? {} });
export const patch = <T>(path: string, json: unknown) => request<T>(path, { method: "PATCH", json });
export const del = <T>(path: string) => request<T>(path, { method: "DELETE" });

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong. Please try again.";
}
