// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trackingEventBus } from "#root/shared/utils/tracking-event-bus";
import { TrackingEventName, type TrackingEvent } from "#root/shared/types/pixel-tracking";
import { onPageTransitionEnd } from "../+onPageTransitionEnd";

/**
 * A PageView is a new page, not a new state of the same page. The shop
 * listing writes page / sort / search / filters to the query string; with
 * Percé's paid campaigns optimising on PageView, each of those must not
 * count as a visit — while every real navigation still does, once.
 */

const ctx = (to: string, from: string) =>
  ({ urlOriginal: to, urlPathname: new URL(to, "http://x").pathname, previousPageContext: { urlOriginal: from } }) as never;

let seen: TrackingEvent[] = [];
let unsubscribe: () => void;
beforeEach(() => {
  seen = [];
  unsubscribe = trackingEventBus.subscribe((e) => seen.push(e));
  // Reduced motion: the hook skips its 220ms fade wait.
  window.matchMedia = ((q: string) => ({ matches: true, media: q })) as never;
});
afterEach(() => unsubscribe());

const pageViews = () => seen.filter((e) => e.eventName === TrackingEventName.PAGE_VIEWED);

describe("page_viewed on client navigation", () => {
  it.each([
    ["page change", "/shop?page=2", "/shop?page=3"],
    ["filter applied", "/shop?inStock=1", "/shop"],
    ["filter removed", "/shop", "/shop?category=nose-piercings"],
    ["sort change", "/shop?sort=price-asc", "/shop"],
    ["search change", "/shop?q=hoop", "/shop"],
    ["category page state", "/categories/ear-piercings?page=2", "/categories/ear-piercings"],
  ])("is not emitted for a query-only change (%s)", async (_label, to, from) => {
    await onPageTransitionEnd(ctx(to, from));
    expect(pageViews()).toHaveLength(0);
  });

  it.each([
    ["listing → product", "/shop/crystal-hoop", "/shop?page=3"],
    ["product → listing (Back)", "/shop?page=3", "/shop/crystal-hoop"],
    ["shop → category", "/categories/ear-piercings", "/shop"],
    ["home → shop", "/shop", "/"],
  ])("is emitted once, with an event id, for a real navigation (%s)", async (_label, to, from) => {
    await onPageTransitionEnd(ctx(to, from));
    expect(pageViews()).toHaveLength(1);
    expect(pageViews()[0]?.eventId).toBeTruthy();
  });
});

describe("Meta Pixel automatic history PageViews", () => {
  beforeEach(() => {
    vi.resetModules();
    // biome-ignore lint/performance/noDelete: test reset of a global
    delete (window as { fbq?: unknown }).fbq;
  });

  it("are switched off before init, and explicit PageViews are allowed through", async () => {
    const { MetaPixelAdapter } = await import("#root/frontend/pixel-adapters/meta-pixel-adapter");
    const calls: { args: unknown[]; disablePushState?: boolean; allowDuplicatePageViews?: boolean }[] = [];
    const fbq = Object.assign(
      (...args: unknown[]) =>
        calls.push({
          args,
          disablePushState: (window.fbq as { disablePushState?: boolean }).disablePushState,
          allowDuplicatePageViews: (window.fbq as { allowDuplicatePageViews?: boolean }).allowDuplicatePageViews,
        }),
      { queue: [] },
    );
    (window as { fbq?: unknown }).fbq = fbq;

    const adapter = new MetaPixelAdapter();
    adapter.initialize({ platform: "meta", pixelId: "1234567890123456", enabled: true } as never);

    // fbevents.js reads both flags from the fbq object when `init` runs.
    expect(calls[0]).toEqual({
      args: ["init", "1234567890123456"],
      disablePushState: true,
      allowDuplicatePageViews: true,
    });
  });

  it("leave the funnel events untouched", async () => {
    const { MetaPixelAdapter } = await import("#root/frontend/pixel-adapters/meta-pixel-adapter");
    const fbq = Object.assign(vi.fn(), { queue: [] });
    (window as { fbq?: unknown }).fbq = fbq;
    const adapter = new MetaPixelAdapter();
    adapter.initialize({ platform: "meta", pixelId: "1", enabled: true } as never);
    fbq.mockClear();

    const event = (eventName: TrackingEventName, extra: Partial<TrackingEvent> = {}) =>
      ({ eventId: `id-${eventName}`, eventName, timestamp: 0, pageUrl: "", sessionId: "s", ...extra }) as TrackingEvent;
    adapter.trackEvent(event(TrackingEventName.PAGE_VIEWED));
    adapter.trackEvent(event(TrackingEventName.PRODUCT_VIEWED));
    adapter.trackEvent(event(TrackingEventName.PRODUCT_ADDED_TO_CART));
    adapter.trackEvent(event(TrackingEventName.CHECKOUT_STARTED));

    expect(fbq.mock.calls.map((c) => [c[0], c[1], (c[3] as { eventID: string }).eventID])).toEqual([
      ["track", "PageView", "id-page_viewed"],
      ["track", "ViewContent", `id-${TrackingEventName.PRODUCT_VIEWED}`],
      ["track", "AddToCart", `id-${TrackingEventName.PRODUCT_ADDED_TO_CART}`],
      ["track", "InitiateCheckout", `id-${TrackingEventName.CHECKOUT_STARTED}`],
    ]);
  });
});
