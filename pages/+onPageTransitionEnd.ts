import type { PageContextClient } from "vike/types";
import { trackingEventBus } from "#root/shared/utils/tracking-event-bus";
import { TrackingEventName } from "#root/shared/types/pixel-tracking";
import { getSessionId } from "#root/shared/utils/session-id";
import { v7 } from "uuid";
import { isSamePageNavigation } from "./page-transition-guard";
import { sanitizeTrackingUrl } from "#root/shared/utils/tracking-url";
import { isDashboardPath } from "#root/shared/utils/tracking-routes";

/**
 * After a client-side navigation: the PageView event (real page changes
 * only) and the dashboard's forced reload. There is no page-transition
 * overlay — navigation swaps the page in place.
 */
export async function onPageTransitionEnd(
  pageContext: PageContextClient,
): Promise<void> {
  // Force refresh dashboard page when navigating to it
  if (pageContext.urlPathname === "/dashboard") {
    setTimeout(() => {
      window.location.reload();
    }, 20);
  }

  // Emit page_viewed on every SPA navigation to another page. A change of
  // query string only (a listing's page, sort, search or filters) is the
  // same page in a new state, not a page view — with paid campaigns
  // optimising on PageView, those would be fake visits.
  if (isSamePageNavigation(pageContext)) return;
  // TRACKING_EXCLUDE_INTERNAL: dashboard pages are not visits.
  if (
    pageContext.trackingFlags?.excludeDashboard &&
    isDashboardPath(pageContext.urlPathname)
  ) {
    return;
  }
  trackingEventBus.emit({
    eventId: v7(),
    eventName: TrackingEventName.PAGE_VIEWED,
    timestamp: Date.now(),
    pageUrl: sanitizeTrackingUrl(window.location.href),
    referrer: sanitizeTrackingUrl(document.referrer || undefined),
    sessionId: getSessionId(),
  });
}
