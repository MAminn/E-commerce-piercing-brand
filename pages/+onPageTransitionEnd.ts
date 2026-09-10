import type { PageContextClient } from "vike/types";
import { trackingEventBus } from "#root/shared/utils/tracking-event-bus";
import { TrackingEventName } from "#root/shared/types/pixel-tracking";
import { getSessionId } from "#root/shared/utils/session-id";
import { v7 } from "uuid";

/**
 * Phase 3 — CSS-overlay page transition (end).
 *
 * Flips `data-page-transition` to `"in"`, causing the overlay to
 * fade back to opacity 0 via CSS.  After the animation completes
 * the dataset attribute is removed entirely so the overlay is fully
 * inert until the next navigation.
 *
 * Respects `prefers-reduced-motion`: removes the attribute immediately.
 */

function prefersReducedMotion(): boolean {
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true
  );
}

export async function onPageTransitionEnd(
  pageContext: PageContextClient,
): Promise<void> {
  // --- Phase 3: fade overlay out ---
  document.documentElement.dataset.pageTransition = "in";

  if (prefersReducedMotion()) {
    delete document.documentElement.dataset.pageTransition;
  } else {
    await new Promise<void>((r) => setTimeout(r, 220));
    delete document.documentElement.dataset.pageTransition;
  }

  // --- Existing behaviour preserved below ---

  // Force refresh dashboard page when navigating to it
  if (pageContext.urlPathname === "/dashboard") {
    setTimeout(() => {
      window.location.reload();
    }, 20);
  }

  // Emit page_viewed on every SPA navigation
  trackingEventBus.emit({
    eventId: v7(),
    eventName: TrackingEventName.PAGE_VIEWED,
    timestamp: Date.now(),
    pageUrl: window.location.href,
    referrer: document.referrer || undefined,
    sessionId: getSessionId(),
  });
}
