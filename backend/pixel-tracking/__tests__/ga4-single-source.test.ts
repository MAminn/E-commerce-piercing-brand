// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { processTrackingBeacon } from "#root/backend/pixel-tracking/delivery-pipeline";
import {
  GA4_EVENT_OWNER,
  ga4OwnerOf,
  readGa4MpMode,
  shouldServerSendToGa4,
} from "#root/backend/pixel-tracking/ga4-ownership";
import { GoogleGA4Adapter } from "#root/frontend/pixel-adapters/google-ga4-adapter";
import { pixelConfig, trackingEvent, trackingEventDelivery } from "#root/shared/database/drizzle/schema";
import {
  PLATFORM_EVENT_MAP,
  PixelPlatform,
  TrackingEventName,
  type PixelConfig,
  type TrackingEvent,
} from "#root/shared/types/pixel-tracking";
import type { ServerContext } from "#root/server/routes/track";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";

/**
 * G1 — each logical GA4 event reaches GA4 exactly once.
 *
 * Production (f29538c) sent every storefront event to GA4 twice: once from
 * the browser gtag and once mirrored by the server through the Measurement
 * Protocol (GA4 row: server-side ON + API secret). These tests drive both
 * paths for the same logical events and count what reaches GA4.
 */

const ORDER_ID = "0193a6c1-0000-7000-8000-00000000abcd";
const MEASUREMENT_ID = "G-TZZRFSD70Q";

const storefrontEvents = (): TrackingEvent[] => {
  const base = { timestamp: Date.now(), sessionId: "sess-1" };
  const item = { itemId: "p-1", itemName: "Seamless Ring 8mm", price: 110, quantity: 2 };
  return [
    { ...base, eventId: "e-pv", eventName: TrackingEventName.PAGE_VIEWED, pageUrl: "https://shop.test/" },
    {
      ...base,
      eventId: "e-vi",
      eventName: TrackingEventName.PRODUCT_VIEWED,
      pageUrl: "https://shop.test/shop/seamless-ring-8mm",
      ecommerce: { currency: "EGP", value: 110, items: [{ ...item, quantity: 1 }] },
    },
    {
      ...base,
      eventId: "e-atc",
      eventName: TrackingEventName.PRODUCT_ADDED_TO_CART,
      pageUrl: "https://shop.test/shop/seamless-ring-8mm",
      ecommerce: { currency: "EGP", value: 220, items: [item] },
    },
    {
      ...base,
      eventId: "e-bc",
      eventName: TrackingEventName.CHECKOUT_STARTED,
      pageUrl: "https://shop.test/checkout",
      ecommerce: { currency: "EGP", value: 220, items: [item] },
    },
    {
      ...base,
      eventId: `purchase-${ORDER_ID}`,
      eventName: TrackingEventName.CHECKOUT_COMPLETED,
      pageUrl: "https://shop.test/order-confirmation",
      ecommerce: { currency: "EGP", value: 290, transactionId: ORDER_ID, items: [item] },
    },
    {
      ...base,
      eventId: "e-scroll",
      eventName: "scroll_depth",
      pageUrl: "https://shop.test/",
      customProperties: { depth: 50 },
    },
  ];
};

const serverContext: ServerContext = {
  ip: "10.0.0.1",
  ipHash: "h",
  userAgent: "Mozilla/5.0",
  fbp: "fb.1.1700000000000.123",
  ga: "GA1.1.123456789.1700000000",
};

const cfg = (platform: PixelPlatform, pixelId: string, accessToken: string): PixelConfig =>
  ({
    id: `cfg-${platform}`,
    platform,
    pixelId,
    accessToken,
    enabled: true,
    enableClientSide: true,
    enableServerSide: true,
    consentRequired: false,
    consentCategory: null,
    settings: null,
    createdAt: new Date(),
    updatedAt: null,
  }) as PixelConfig;

/** Production's server-side rows: Meta CAPI + GA4 with an API secret. */
const PROD_CONFIGS = [
  cfg(PixelPlatform.META, "1234567890", "meta-token"),
  cfg(PixelPlatform.GOOGLE_GA4, MEASUREMENT_ID, "ga4-api-secret"),
];

/** Minimal drizzle stand-in for the three queries the pipeline makes. */
function fakeDb(configs: PixelConfig[]) {
  const deliveries: Array<{ platform: string; trackingEventId: string; sent: boolean }> = [];
  const db = {
    insert(table: unknown) {
      return {
        values(v: unknown) {
          if (table === trackingEventDelivery) {
            deliveries.push(v as (typeof deliveries)[number]);
            return Promise.resolve();
          }
          if (table !== trackingEvent) throw new Error("unexpected insert");
          const rows = v as Array<{ id: string; eventId: string }>;
          return {
            onConflictDoNothing: () => ({
              returning: async () => rows.map((r) => ({ id: r.id, eventId: r.eventId })),
            }),
          };
        },
      };
    },
    select() {
      return {
        from(table: unknown) {
          if (table !== pixelConfig) throw new Error("unexpected select");
          return { where: () => ({ execute: async () => configs }) };
        },
      };
    },
  };
  return { db: db as unknown as DatabaseClient, deliveries };
}

let fetchSpy: ReturnType<typeof vi.fn>;
const prevMode = process.env.GA4_MP_MODE;

beforeEach(() => {
  fetchSpy = vi.fn(async () => new Response(JSON.stringify({ events_received: 1 }), { status: 200 }));
  vi.stubGlobal("fetch", fetchSpy);
  Reflect.deleteProperty(process.env, "GA4_MP_MODE");
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (prevMode === undefined) Reflect.deleteProperty(process.env, "GA4_MP_MODE");
  else process.env.GA4_MP_MODE = prevMode;
});

const urls = () => fetchSpy.mock.calls.map(([u]) => String(u));
const ga4ServerCalls = () => urls().filter((u) => u.includes("google-analytics.com"));
const metaCalls = () => fetchSpy.mock.calls.filter(([u]) => String(u).includes("graph.facebook.com"));

/** The browser half: the real GA4 adapter with a gtag spy. Returns gtag "event" calls. */
function sendFromBrowser(events: TrackingEvent[]) {
  const gtag = vi.fn();
  (window as unknown as { gtag: unknown }).gtag = gtag;
  const adapter = new GoogleGA4Adapter();
  adapter.initialize(cfg(PixelPlatform.GOOGLE_GA4, MEASUREMENT_ID, ""));
  for (const e of events) adapter.trackEvent(e);
  adapter.destroy();
  return gtag.mock.calls.filter(([cmd]) => cmd === "event") as Array<[string, string, Record<string, unknown>]>;
}

describe("G1 — GA4 ownership is explicit", () => {
  it("GA4_MP_MODE defaults to off; only legacy_all re-enables the server mirror", () => {
    expect(readGa4MpMode({})).toBe("off");
    expect(readGa4MpMode({ GA4_MP_MODE: "purchase_only" })).toBe("off");
    expect(readGa4MpMode({ GA4_MP_MODE: "garbage" })).toBe("off");
    expect(readGa4MpMode({ GA4_MP_MODE: " LEGACY_ALL " })).toBe("legacy_all");
    expect(shouldServerSendToGa4("off")).toBe(false);
    expect(shouldServerSendToGa4("legacy_all")).toBe(true);
  });

  it("every GA4-mapped event — purchase included — is browser-owned, and so are custom events", () => {
    const mapped = Object.keys(PLATFORM_EVENT_MAP[PixelPlatform.GOOGLE_GA4]);
    expect(Object.keys(GA4_EVENT_OWNER).sort()).toEqual(mapped.sort());
    for (const name of mapped) expect(ga4OwnerOf(name)).toBe("browser");
    expect(ga4OwnerOf(TrackingEventName.CHECKOUT_COMPLETED)).toBe("browser");
    expect(ga4OwnerOf("scroll_depth")).toBe("browser");
  });
});

describe("G1 — one logical event, one GA4 measurement (production config: GA4 server-side ON + secret)", () => {
  it("server pipeline sends nothing to GA4 and logs no GA4 delivery", async () => {
    const { db, deliveries } = fakeDb(PROD_CONFIGS);
    await processTrackingBeacon(storefrontEvents(), serverContext, db);
    expect(ga4ServerCalls()).toHaveLength(0);
    expect(deliveries.filter((d) => d.platform === "google_ga4")).toHaveLength(0);
  });

  it("browser + server together: page_view, view_item, add_to_cart, begin_checkout, purchase, scroll_depth each reach GA4 once", async () => {
    const events = storefrontEvents();
    const browserHits = sendFromBrowser(events);
    const { db } = fakeDb(PROD_CONFIGS);
    await processTrackingBeacon(events, serverContext, db);

    const counts = new Map<string, number>();
    for (const [, name] of browserHits) counts.set(name, (counts.get(name) ?? 0) + 1);
    expect(ga4ServerCalls()).toHaveLength(0);
    expect(Object.fromEntries(counts)).toEqual({
      page_view: 1,
      view_item: 1,
      add_to_cart: 1,
      begin_checkout: 1,
      purchase: 1,
      scroll_depth: 1,
    });
  });

  it("purchase keeps transaction_id, value, currency and items on its single (browser) hit", () => {
    const hits = sendFromBrowser(storefrontEvents());
    const purchases = hits.filter(([, name]) => name === "purchase");
    expect(purchases).toHaveLength(1);
    expect(purchases[0]?.[2]).toEqual({
      transaction_id: ORDER_ID,
      value: 290,
      currency: "EGP",
      items: [{ item_id: "p-1", item_name: "Seamless Ring 8mm", price: 110, quantity: 2 }],
    });
    const atc = hits.find(([, name]) => name === "add_to_cart");
    expect(atc?.[2]).toMatchObject({ value: 220, currency: "EGP", items: [{ item_id: "p-1", quantity: 2 }] });
  });

  it("a purchase beacon re-sent (retry / second tab) still produces no server GA4 purchase", async () => {
    const purchase = storefrontEvents().filter((e) => e.eventName === TrackingEventName.CHECKOUT_COMPLETED);
    const { db } = fakeDb(PROD_CONFIGS);
    await processTrackingBeacon(purchase, serverContext, db);
    await processTrackingBeacon(purchase, serverContext, db);
    expect(ga4ServerCalls()).toHaveLength(0);
  });

  it("GA4_MP_MODE=legacy_all brings the old mirror back (the rollback switch really is the only path)", async () => {
    process.env.GA4_MP_MODE = "legacy_all";
    const { db } = fakeDb(PROD_CONFIGS);
    await processTrackingBeacon(storefrontEvents(), serverContext, db);
    expect(ga4ServerCalls()).toHaveLength(1);
  });
});

describe("G1 — Meta CAPI is unaffected", () => {
  it("every storefront event still reaches Meta CAPI once, with the browser's event_id for dedup", async () => {
    const { db, deliveries } = fakeDb(PROD_CONFIGS);
    const events = storefrontEvents();
    await processTrackingBeacon(events, serverContext, db);

    expect(metaCalls()).toHaveLength(1);
    const body = JSON.parse(String((metaCalls()[0]?.[1] as RequestInit).body)) as {
      data: Array<{ event_name: string; event_id: string; custom_data?: Record<string, unknown> }>;
    };
    expect(body.data.map((d) => d.event_id)).toEqual(events.map((e) => e.eventId));
    expect(body.data.map((d) => d.event_name)).toEqual([
      "PageView",
      "ViewContent",
      "AddToCart",
      "InitiateCheckout",
      "Purchase",
      "scroll_depth",
    ]);
    const purchase = body.data.find((d) => d.event_name === "Purchase");
    expect(purchase?.event_id).toBe(`purchase-${ORDER_ID}`);
    expect(purchase?.custom_data).toMatchObject({ value: 290, currency: "EGP" });
    expect(deliveries.filter((d) => d.platform === "meta" && d.sent)).toHaveLength(events.length);
  });

  it("Meta output is identical with GA4 server-side on or off", async () => {
    const a = fakeDb(PROD_CONFIGS);
    await processTrackingBeacon(storefrontEvents(), serverContext, a.db);
    const withGa4 = String((metaCalls()[0]?.[1] as RequestInit).body);
    fetchSpy.mockClear();
    const b = fakeDb([PROD_CONFIGS[0] as PixelConfig]);
    await processTrackingBeacon(storefrontEvents(), serverContext, b.db);
    const withoutGa4 = String((metaCalls()[0]?.[1] as RequestInit).body);
    const strip = (s: string) => JSON.parse(s, (k, v) => (k === "event_time" ? 0 : v));
    expect(strip(withGa4)).toEqual(strip(withoutGa4));
  });
});
