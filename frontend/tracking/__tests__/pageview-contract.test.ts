// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { trackingEventBus } from "#root/shared/utils/tracking-event-bus";
import { PixelPlatform, TrackingEventName, type TrackingEvent } from "#root/shared/types/pixel-tracking";
import { PixelAdapterRegistry } from "#root/frontend/pixel-adapters/registry";
import { MetaPixelAdapter } from "#root/frontend/pixel-adapters/meta-pixel-adapter";
import { GoogleGA4Adapter } from "#root/frontend/pixel-adapters/google-ga4-adapter";
import { TikTokPixelAdapter } from "#root/frontend/pixel-adapters/tiktok-pixel-adapter";
import { onPageTransitionEnd } from "#root/pages/+onPageTransitionEnd";

let headContext: Record<string, unknown> = {};
vi.mock("vike-react/usePageContext", () => ({ usePageContext: () => headContext }));
import HeadDefault from "#root/pages/+Head";

/**
 * Cross-platform contract for page views and funnel events, run through the
 * real adapters and the real tracking bus (vendor globals are stubs):
 *
 *                              Meta PageView  GA4 page_view  TikTok (our calls)
 *   query-only listing change        0              0              0
 *   real navigation                  1              1              0 *
 *   first load                       1              1              1 (ttq.page at init)
 *
 *   * TikTok's own SDK sends SPA page views from its history listener when
 *     its pixel-side "dynamic_web_pageview" setting is on; our adapter never
 *     adds a second one.
 *
 * Ecommerce events (ViewContent/view_item, AddToCart/add_to_cart,
 * InitiateCheckout/begin_checkout) come only from the real action that emits
 * them — never from a URL change.
 */

type Win = Record<string, unknown>;
const ctx = (to: string, from: string) =>
  ({ urlOriginal: to, urlPathname: new URL(to, "http://x").pathname, previousPageContext: { urlOriginal: from } }) as never;

let fbq: ReturnType<typeof vi.fn>;
let gtag: ReturnType<typeof vi.fn>;
let ttq: { load: ReturnType<typeof vi.fn>; page: ReturnType<typeof vi.fn>; track: ReturnType<typeof vi.fn>; identify: ReturnType<typeof vi.fn> };
let registry: PixelAdapterRegistry;
let unsubscribe: () => void;

const pageViews = () => ({
  meta: fbq.mock.calls.filter((c) => c[0] === "track" && c[1] === "PageView").length,
  ga4: gtag.mock.calls.filter((c) => c[0] === "event" && c[1] === "page_view").length,
  tiktok: ttq.page.mock.calls.length + ttq.track.mock.calls.filter((c) => c[0] === "Pageview").length,
});
const allCalls = () => fbq.mock.calls.length + gtag.mock.calls.length + ttq.page.mock.calls.length + ttq.track.mock.calls.length;
const clearAll = () => {
  fbq.mockClear();
  gtag.mockClear();
  ttq.page.mockClear();
  ttq.track.mockClear();
};
const emit = (eventName: TrackingEventName) =>
  trackingEventBus.emit({ eventId: `id-${eventName}`, eventName, timestamp: 0, pageUrl: "", sessionId: "s" } as TrackingEvent);

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: true, media: q })) as never; // no fade wait
  fbq = vi.fn();
  (window as unknown as Win).fbq = Object.assign(fbq, { queue: [] });
  gtag = vi.fn();
  (window as unknown as Win).gtag = gtag;
  ttq = { load: vi.fn(), page: vi.fn(), track: vi.fn(), identify: vi.fn() };
  (window as unknown as Win).ttq = ttq;

  registry = new PixelAdapterRegistry();
  const configs = [
    [new MetaPixelAdapter(), PixelPlatform.META, "1234567890123456"],
    [new GoogleGA4Adapter(), PixelPlatform.GOOGLE_GA4, "G-TEST000000"],
    [new TikTokPixelAdapter(), PixelPlatform.TIKTOK, "CTEST0000000000000000"],
  ] as const;
  for (const [adapter, platform, pixelId] of configs) {
    adapter.initialize({ platform, pixelId, enabled: true } as never);
    registry.register(adapter);
  }
  unsubscribe = trackingEventBus.subscribe((e) => registry.broadcastEvent(e));
});
afterEach(() => {
  unsubscribe();
  registry.destroyAll();
});

describe("page views across Meta, GA4 and TikTok", () => {
  it("first load: TikTok's init page() is its one page view", () => {
    expect(ttq.page).toHaveBeenCalledTimes(1);
    // Meta's automatic history PageViews are off before init.
    expect((window as unknown as { fbq: { disablePushState?: boolean } }).fbq.disablePushState).toBe(true);
  });

  it.each([
    ["pagination", "/shop?page=2", "/shop"],
    ["apply filter", "/shop?inStock=1", "/shop?page=2"],
    ["remove filter", "/shop", "/shop?category=nose-piercings"],
    ["sort change", "/shop?sort=price-asc", "/shop"],
    ["search change", "/shop?q=hoop", "/shop"],
    ["same-page Back", "/shop?page=2", "/shop?page=3"],
    ["same-page Forward", "/shop?page=3", "/shop?page=2"],
    ["category pagination", "/categories/ear-piercings?page=2", "/categories/ear-piercings"],
    ["category filter", "/categories/ear-piercings?onSale=1", "/categories/ear-piercings"],
  ])("query-only (%s): no page view and no event on any platform", async (_label, to, from) => {
    clearAll();
    await onPageTransitionEnd(ctx(to, from));
    expect(allCalls()).toBe(0);
  });

  it.each([
    ["listing → product", "/shop/crystal-hoop", "/shop?page=3"],
    ["product → listing (Back)", "/shop?page=3", "/shop/crystal-hoop"],
    ["shop → category", "/categories/ear-piercings", "/shop?inStock=1"],
    ["cart → checkout", "/checkout", "/cart"],
  ])("real navigation (%s): exactly one Meta and one GA4 page view", async (_label, to, from) => {
    clearAll();
    await onPageTransitionEnd(ctx(to, from));
    expect(pageViews()).toEqual({ meta: 1, ga4: 1, tiktok: 0 });
    // …and nothing else rides along.
    expect(allCalls()).toBe(2);
  });

  it("funnel events fire once per real action, on every platform", () => {
    clearAll();
    emit(TrackingEventName.PRODUCT_VIEWED);
    emit(TrackingEventName.PRODUCT_ADDED_TO_CART);
    emit(TrackingEventName.CHECKOUT_STARTED);
    expect(fbq.mock.calls.map((c) => c[1])).toEqual(["ViewContent", "AddToCart", "InitiateCheckout"]);
    expect(gtag.mock.calls.map((c) => c[1])).toEqual(["view_item", "add_to_cart", "begin_checkout"]);
    expect(ttq.track.mock.calls.map((c) => c[0])).toEqual(["ViewContent", "AddToCart", "InitiateCheckout"]);
    expect(pageViews()).toEqual({ meta: 0, ga4: 0, tiktok: 0 });
  });
});

describe("GA4 never sends its own automatic page_view", () => {
  it("server-rendered tag configures send_page_view:false", () => {
    headContext = { activeGA4PixelId: "G-TEST000000", urlPathname: "/shop" };
    const html = renderToStaticMarkup(createElement(HeadDefault));
    expect(html).toContain('gtag("config","G-TEST000000",{send_page_view:false})');
  });

  it("the adapter's own bootstrap (no SSR tag) configures send_page_view:false too", () => {
    // biome-ignore lint/performance/noDelete: test reset of a global
    delete (window as unknown as Win).gtag;
    (window as unknown as Win).dataLayer = [];
    new GoogleGA4Adapter().initialize({ platform: PixelPlatform.GOOGLE_GA4, pixelId: "G-OTHER00000", enabled: true } as never);
    const configCalls = ((window as unknown as { dataLayer: IArguments[] }).dataLayer)
      .map((args) => Array.from(args))
      .filter((args) => args[0] === "config");
    expect(configCalls).toEqual([["config", "G-OTHER00000", { send_page_view: false }]]);
  });
});
