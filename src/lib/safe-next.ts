/**
 * Where to go after signing in. Only same-site relative paths are allowed, so a crafted
 * `?next=https://evil.example` or `?next=//evil.example` can never bounce a user off-site.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  if (/[\u0000-\u001f]/.test(value)) return "/";
  if (value === "/signin" || value.startsWith("/signin?") || value.startsWith("/signin/")) return "/";
  if (value.startsWith("/api/")) return "/";
  return value;
}
