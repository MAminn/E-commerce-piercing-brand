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
 * Back, a `?category=` link on /shop) stays on the same page: nothing to
 * cover. It matters beyond looks — for Back/Forward between two history
 * entries the shop listing pushed itself (see hooks/useListingUrlState.ts),
 * Vike calls this hook and then skips rendering, so onPageTransitionEnd
 * never runs and an overlay set here would stay opaque, blocking the page.
 */
export function isSamePageNavigation(pageContext: Partial<PageContextClient>): boolean {
  const next = pathnameOf(pageContext.urlOriginal);
  const prev = pathnameOf(
    (pageContext as { previousPageContext?: { urlOriginal?: string } | null }).previousPageContext
      ?.urlOriginal,
  );
  return next !== null && next === prev;
}
