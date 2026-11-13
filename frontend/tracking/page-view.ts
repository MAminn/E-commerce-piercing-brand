import { v7 } from "uuid";
import { TrackingEventName } from "#root/shared/types/pixel-tracking";
import { trackingEventBus } from "#root/shared/utils/tracking-event-bus";
import { getSessionId } from "#root/shared/utils/session-id";
import { sanitizeTrackingUrl } from "#root/shared/utils/tracking-url";

/**
 * The client-navigation PageView path.
 *
 * +onPageTransitionEnd runs outside React, so it cannot call useTracking().
 * TrackingProvider registers its canonical trackEvent here; a client
 * navigation's PageView then takes exactly the route every other storefront
 * event takes: ONE event (one event id) → the event bus (browser pixels:
 * Meta PageView, GA4 page_view, …) AND the /api/track beacon buffer
 * (tracking_event row + Meta CAPI PageView with the same event_id).
 *
 * Before this, the hook emitted straight onto the event bus, so SPA
 * PageViews reached the browser pixels only — no CAPI copy, no visit row.
 */

type PageViewSink = () => void;

let sink: PageViewSink | null = null;

/** Called by TrackingProvider while mounted. Returns the unregister function. */
export function registerPageViewSink(fn: PageViewSink): () => void {
  sink = fn;
  return () => {
    if (sink === fn) sink = null;
  };
}

/**
 * One PageView for the page just navigated to. Without a mounted
 * TrackingProvider (no storefront layout) the event goes to the bus only,
 * exactly as before.
 */
export function trackClientNavigationPageView(): void {
  if (sink) {
    sink();
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
