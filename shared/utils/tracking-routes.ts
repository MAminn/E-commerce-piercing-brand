/** Internal (staff) route roots — never a storefront page. */
const INTERNAL_ROOTS = ["/dashboard", "/admin"] as const;

/**
 * Whether a URL or path is an internal staff route: `/dashboard`, `/admin`,
 * or anything under them. (`/admin` has no page of its own today — it renders
 * the error page — but staff type it, and it must not count as a visit.)
 * Accepts absolute URLs (an event's pageUrl, Hono's c.req.url) and plain
 * paths with or without a query string.
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
  return INTERNAL_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}
