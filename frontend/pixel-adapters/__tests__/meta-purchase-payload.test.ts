import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MetaPixelAdapter, toMetaValue } from "#root/frontend/pixel-adapters/meta-pixel-adapter";
import { PixelPlatform, TrackingEventName, type TrackingEvent } from "#root/shared/types/pixel-tracking";
import { buildPurchaseEcommerce, purchaseEventId } from "#root/frontend/tracking/purchase-event";

/**
 * The LITERAL arguments the Meta Pixel receives for Purchase:
 *   fbq("track", "Purchase", { value: <number>, currency: "EGP", … }, { eventID })
 *
 * Production Meta rejected the Purchase with "Parameter 'currency' is invalid
 * for event 'Purchase'": the currency was passed through verbatim from the
 * event, which took it from a build-time env value (VITE_CURRENCY / CURRENCY).
 */
const ORDER = "0f1e2d3c-4b5a-4968-8778-6a5b4c3d2e1f";

let fbq: ReturnType<typeof vi.fn>;
let adapter: MetaPixelAdapter;

beforeEach(() => {
  fbq = vi.fn();
  (globalThis as unknown as Record<string, unknown>).window = globalThis;
  (window as unknown as Record<string, unknown>).fbq = fbq;
  adapter = new MetaPixelAdapter();
  adapter.initialize({
    id: "cfg",
    platform: PixelPlatform.META,
    pixelId: "1234567890",
    enabled: true,
    enableClientSide: true,
    enableServerSide: false,
    consentRequired: false,
    createdAt: new Date(),
  });
  fbq.mockClear();
});
afterEach(() => adapter.destroy());

const event = (eventName: string, ecommerce?: TrackingEvent["ecommerce"], eventId = purchaseEventId(ORDER)): TrackingEvent => ({
  eventId,
  eventName,
  timestamp: Date.now(),
  pageUrl: "https://shop.test/order-confirmation",
  sessionId: "s",
  ecommerce,
});
const purchaseCalls = () => fbq.mock.calls.filter(([cmd, name]) => name === "Purchase" || (cmd === "trackCustom" && /purchase/i.test(String(name))));

describe("Meta Purchase — literal fbq payload", () => {
  it("normal order: track/Purchase, numeric persisted total, currency 'EGP', ids, quantities, event id", () => {
    const ecommerce = buildPurchaseEcommerce({
      orderId: ORDER,
      total: "370.00",
      items: [
        { itemId: "p1", itemName: "Stud", quantity: 2, price: 120 },
        { itemId: "p2", itemName: "Hoop", quantity: 1, price: 60 },
      ],
    })!;
    adapter.trackEvent(event(TrackingEventName.CHECKOUT_COMPLETED, ecommerce));

    expect(fbq.mock.calls).toEqual([
      [
        "track",
        "Purchase",
        {
          value: 370,
          currency: "EGP",
          content_ids: ["p1", "p2"],
          contents: [
            { id: "p1", quantity: 2 },
            { id: "p2", quantity: 1 },
          ],
          content_type: "product",
          content_name: "Stud",
          num_items: 3,
          order_id: ORDER,
        },
        { eventID: `purchase-${ORDER}` },
      ],
    ]);
    const [, , params] = fbq.mock.calls[0]!;
    expect(typeof params.value).toBe("number");
    expect(params.currency).toBe("EGP");
  });

  it.each([
    ["lowercase env value", "egp"],
    ["display label with amount", "EGP 370"],
    ["trailing space", "EGP "],
    ["Arabic symbol", "ج.م"],
    ["Arabic word", "جنيه"],
    ["LE", "LE"],
    ["another code", "USD"],
    ["missing", undefined],
  ])("currency is exactly 'EGP' whatever the event carried (%s)", (_label, currency) => {
    adapter.trackEvent(event(TrackingEventName.CHECKOUT_COMPLETED, { value: 370, currency, transactionId: ORDER }));
    const [cmd, name, params, options] = fbq.mock.calls[0]!;
    expect([cmd, name]).toEqual(["track", "Purchase"]);
    expect(params.currency).toBe("EGP");
    expect(params.value).toBe(370);
    expect(options).toEqual({ eventID: `purchase-${ORDER}` });
  });

  it("a numeric string total becomes a number; decimals are kept to the piaster", () => {
    adapter.trackEvent(event(TrackingEventName.CHECKOUT_COMPLETED, { value: "828.75" as never, transactionId: ORDER }));
    expect(fbq.mock.calls[0]![2].value).toBe(828.75);
    expect(toMetaValue(913.749999)).toBe(913.75);
  });

  it("a formatted money string is never sent as the value — no invalid Purchase at all", () => {
    for (const bad of ["EGP 370", "370 ج.م.", "EGP 370", "", "abc", Number.NaN, -5, null]) {
      adapter.trackEvent(event(TrackingEventName.CHECKOUT_COMPLETED, { value: bad as never, currency: "EGP" }));
    }
    expect(purchaseCalls()).toHaveLength(0);
  });

  it("a custom event named 'Purchase' cannot add a second, unvalidated Purchase", () => {
    adapter.trackEvent(event("Purchase", undefined, "custom-1"));
    adapter.trackEvent(event(" purchase ", undefined, "custom-2"));
    expect(purchaseCalls()).toHaveLength(0);
    // Other custom events are untouched.
    adapter.trackEvent(event("my_custom_event", undefined, "custom-3"));
    expect(fbq).toHaveBeenCalledWith("trackCustom", "my_custom_event", {}, { eventID: "custom-3" });
  });

  it("other events are unchanged (InitiateCheckout still passes its own fields through)", () => {
    adapter.trackEvent(event(TrackingEventName.CHECKOUT_STARTED, { value: 370, currency: "EGP" }, "evt-ic"));
    expect(fbq).toHaveBeenCalledWith("track", "InitiateCheckout", { value: 370, currency: "EGP" }, { eventID: "evt-ic" });
  });
});

describe("Purchase currency does not depend on the build environment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("with VITE_CURRENCY set to a display label, the Purchase still says 'EGP'", async () => {
    vi.stubEnv("VITE_CURRENCY", "egp");
    vi.resetModules();
    const branding = await import("#root/shared/config/branding");
    const purchase = await import("#root/frontend/tracking/purchase-event");
    expect(branding.STORE_CURRENCY).toBe("egp"); // the configurable constant…
    expect(purchase.buildPurchaseEcommerce({ orderId: ORDER, total: "370.00" })?.currency).toBe("EGP"); // …is not used
  });
});
