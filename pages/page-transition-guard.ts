import type { PageContextClient } from "vike/types";

function pathnameOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return null;
  }
}

/**
 * A navigation that only changes the query string (shop page 3 → page 2 via
 * Back, a `?category=` link on /shop) stays on the same page. It is not a
 * page view: onPageTransitionEnd emits PageView only for a real page change
 * (see hooks/useListingUrlState.ts for the history entries the listing
 * pushes itself).
 */
export function isSamePageNavigation(pageContext: Partial<PageContextClient>): boolean {
  const next = pathnameOf(pageContext.urlOriginal);
  const prev = pathnameOf(
    (pageContext as { previousPageContext?: { urlOriginal?: string } | null }).previousPageContext
      ?.urlOriginal,
  );
  return next !== null && next === prev;
}
