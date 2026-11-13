import type { PageContextClient } from "vike/types";
import { isSamePageNavigation } from "./page-transition-guard";
import { isDashboardPath } from "#root/shared/utils/tracking-routes";
import { trackClientNavigationPageView } from "#root/frontend/tracking/page-view";

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
  // The canonical tracking path (TrackingProvider.trackEvent): one event id
  // to the browser pixels AND the /api/track beacon (tracking_event row +
  // Meta CAPI PageView) — see frontend/tracking/page-view.ts.
  trackClientNavigationPageView();
}
