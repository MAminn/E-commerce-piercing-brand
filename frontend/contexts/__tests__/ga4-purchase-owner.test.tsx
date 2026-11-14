// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { useEffect, useRef } from "react";

/**
 * GA4_PURCHASE_OWNER across all three modes, through the real chain:
 * effective owner → readClientTrackingFlags (what SSR passes to the page) →
 * TrackingProvider → adapter registry → real GoogleGA4Adapter and
 * MetaPixelAdapter. Only gtag / fbq themselves and the network are stubbed.
 *
 *   browser / shadow — gtag sends `purchase` exactly as before
 *   server           — gtag skips `purchase` ONLY; page_view and every
 *                      other GA4 event still go out
 *   all modes        — the Meta pixel Purchase (params + eventID) and the
 *                      /api/track beacon that feeds Meta CAPI are identical
 */
vi.mock("#root/shared/trpc/client", () => ({
  trpc: {
    pixelTracking: {
      config: {
        listActive: {
          query: async () => ({
            success: true,
            result: [
              { id: "m", platform: "meta", pixelId: "1234567890", enabled: true, enableClientSide: true, enableServerSide: true, consentRequired: false, createdAt: new Date() },
              { id: "g", platform: "google_ga4", pixelId: "G-TEST1234", enabled: true, enableClientSide: true, enableServerSide: false, consentRequired: false, createdAt: new Date() },
            ],
          }),
        },
      },
      customEvents: { listActive: { query: async () => ({ success: true, result: [] }) } },
    },
  },
}));

import { TrackingProvider, useTracking } from "../TrackingContext";
import { trackPurchaseOnce } from "#root/frontend/tracking/purchase-event";
import { TrackingEventName } from "#root/shared/types/pixel-tracking";
import { readClientTrackingFlags } from "#root/shared/config/tracking-flags";
import { setEffectiveGa4PurchaseOwner, type Ga4PurchaseOwner } from "#root/shared/config/ga4-purchase-owner";

const ORDER = "0f1e2d3c-4b5a-4968-8778-6a5b4c3d2e1f";

function ConfirmedOrderThenAddToCart() {
  const { trackEvent } = useTracking();
  const fired = useRef(false);
  useEffect(() => {
    // trackEvent's identity changes once the session id is set; emit once.
    if (fired.current) return;
    fired.current = true;
    trackPurchaseOnce({ orderId: ORDER, total: "913.75", trackEvent, local: localStorage, session: sessionStorage });
    trackEvent(TrackingEventName.PRODUCT_ADDED_TO_CART, {
      ecommerce: { currency: "EGP", value: 150, items: [{ itemId: "p1", itemName: "A", quantity: 1, price: 150 }] },
    });
  }, [trackEvent]);
  return null;
}

let fbq: ReturnType<typeof vi.fn>;
let gtag: ReturnType<typeof vi.fn>;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  fbq = vi.fn();
  gtag = vi.fn();
  (window as unknown as { fbq: unknown }).fbq = fbq;
  (window as unknown as { gtag: unknown }).gtag = gtag;
  fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setEffectiveGa4PurchaseOwner("browser");
});

const gtagEvents = (name: string) => gtag.mock.calls.filter(([cmd, event]) => cmd === "event" && event === name);
const fbqTracks = (name: string) => fbq.mock.calls.filter(([cmd, event]) => cmd === "track" && event === name);

async function runMode(mode: Ga4PurchaseOwner) {
  setEffectiveGa4PurchaseOwner(mode);
  const flags = readClientTrackingFlags({});
  render(
    <TrackingProvider ga4BrowserPurchase={flags.ga4BrowserPurchase !== false}>
      <ConfirmedOrderThenAddToCart />
    </TrackingProvider>,
  );
  await waitFor(() => expect(fbqTracks("Purchase")).toHaveLength(1));
  await waitFor(() => expect(gtagEvents("add_to_cart")).toHaveLength(1));
  await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  return flags;
}

function expectMetaUnchanged() {
  const [, , params, options] = fbqTracks("Purchase")[0]!;
  expect(params).toMatchObject({ value: 913.75, currency: "EGP", order_id: ORDER });
  expect(options).toEqual({ eventID: `purchase-${ORDER}` });
  const beacon = fetchSpy.mock.calls.map(([, init]) => String((init as RequestInit).body)).join("");
  expect(beacon).toContain(`"eventName":"checkout_completed"`);
  expect(beacon).toContain(`"eventId":"purchase-${ORDER}"`);
}

describe("GA4 purchase ownership in the browser", () => {
  it("browser mode (default): gtag sends purchase once, as in production today", async () => {
    const flags = await runMode("browser");
    expect(flags.ga4BrowserPurchase).toBe(true);
    expect(gtagEvents("purchase")).toHaveLength(1);
    expect(gtagEvents("purchase")[0]![2]).toEqual({ currency: "EGP", value: 913.75, transaction_id: ORDER });
    expect(gtagEvents("page_view")).toHaveLength(1);
    expectMetaUnchanged();
  });

  it("shadow mode: identical to browser mode — the browser still sends purchase", async () => {
    const flags = await runMode("shadow");
    expect(flags.ga4BrowserPurchase).toBe(true);
    expect(gtagEvents("purchase")).toHaveLength(1);
    expectMetaUnchanged();
  });

  it("server mode: gtag skips purchase only; page_view, add_to_cart, Meta and the CAPI beacon are unchanged", async () => {
    const flags = await runMode("server");
    expect(flags.ga4BrowserPurchase).toBe(false);
    expect(gtagEvents("purchase")).toHaveLength(0);
    expect(gtagEvents("page_view")).toHaveLength(1);
    expect(gtagEvents("add_to_cart")).toHaveLength(1);
    expectMetaUnchanged();
  });

  it("a missing flag (older server build) keeps the browser sending purchase", async () => {
    render(
      <TrackingProvider>
        <ConfirmedOrderThenAddToCart />
      </TrackingProvider>,
    );
    await waitFor(() => expect(gtagEvents("purchase")).toHaveLength(1));
  });
});
