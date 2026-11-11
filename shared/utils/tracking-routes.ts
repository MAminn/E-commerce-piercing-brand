/**
 * Whether a URL or path is an admin dashboard route (`/dashboard` or
 * anything under `/dashboard/`). Accepts absolute URLs (an event's pageUrl,
 * Hono's c.req.url) and plain paths with or without a query string.
 */
export function isDashboardPath(urlOrPath: string | null | undefined): boolean {
  if (!urlOrPath) return false;
  let pathname: string;
  try {
    pathname = new URL(urlOrPath, "http://relative.invalid").pathname;
  } catch {
    return false;
  }
  pathname = pathname.toLowerCase();
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}
