import type { PageContextClient } from "vike/types";

/**
 * Phase 3 — CSS-overlay page transition (start).
 *
 * Sets `data-page-transition="out"` on <html>, which makes the
 * `.page-transition-overlay` fade to opacity 1 via CSS.
 * The returned promise resolves after the transition delay so Vike
 * knows when to swap the page content underneath the overlay.
 *
 * Respects `prefers-reduced-motion`: if reduced, the attribute is
 * still set (CSS handles instant transition) but we return immediately.
 */

function prefersReducedMotion(): boolean {
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true
  );
}

export async function onPageTransitionStart(
  pageContext: Partial<PageContextClient>,
): Promise<void> {
  document.documentElement.dataset.pageTransition = "out";

  // Force a reflow so the CSS transition always triggers reliably
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  document.body?.offsetHeight;

  if (prefersReducedMotion()) return;

  // Shorter delay for backward navigations (browser back/forward)
  const delayMs = pageContext.isBackwardNavigation ? 120 : 180;
  await new Promise<void>((r) => setTimeout(r, delayMs));
}
