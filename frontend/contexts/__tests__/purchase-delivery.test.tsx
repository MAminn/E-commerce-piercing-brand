// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { useEffect } from "react";

/**
 * The browser side of Purchase delivery, through the real TrackingProvider,
 * event bus, adapter registry and Meta Pixel adapter (only `fbq` itself and
 * the network are stubbed).
 *
 * Regression: the pixel adapters register only after their configs are
 * fetched. /order-confirmation emits its Purchase as soon as the order
 * verifies; on a full page load (the return from a payment gateway, a
 * reload) that could happen before the configs arrived — the event reached
 * an empty registry, Meta never saw it, and the page had already marked the
 * order as tracked.
 */
let resolveConfigs: (value: unknown) => void = () => {};
vi.mock("#root/shared/trpc/client", () => ({
  trpc: {
    pixelTracking: {
      config: {
        listActive: {
          query: () =>
            new Promise((resolve) => {
              resolveConfigs = resolve;
            }),
        },
      },
      customEvents: { listActive: { query: async () => ({ success: true, result: [] }) } },
    },
  },
}));

import { TrackingProvider, useTracking } from "../TrackingContext";
import { trackPurchaseOnce } from "#root/frontend/tracking/purchase-event";

const ORDER = "0f1e2d3c-4b5a-4968-8778-6a5b4c3d2e1f";
const metaConfig = {
  id: "cfg-meta",
  platform: "meta",
  pixelId: "1234567890",
  enabled: true,
  enableClientSide: true,
  enableServerSide: false,
  consentRequired: false,
  createdAt: new Date(),
};

function ConfirmedOrder() {
  const { trackEvent } = useTracking();
  useEffect(() => {
    trackPurchaseOnce({ orderId: ORDER, total: "913.75", trackEvent, local: localStorage, session: sessionStorage });
  }, [trackEvent]);
  return null;
}

let fbq: ReturnType<typeof vi.fn>;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  fbq = vi.fn();
  // An existing fbq makes the adapter skip injecting fbevents.js.
  (window as unknown as { fbq: unknown }).fbq = fbq;
  fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const fbqTracks = (name: string) => fbq.mock.calls.filter(([cmd, event]) => cmd === "track" && event === name);

describe("Purchase reaches the Meta pixel", () => {
  it("an order confirmed BEFORE the pixel configs load is delivered once they do — exactly once", async () => {
    sessionStorage.setItem(
      `checkout_items:${ORDER}`,
      JSON.stringify([
        { itemId: "p1", itemName: "A", quantity: 2, price: 150 },
        { itemId: "p2", itemName: "B", quantity: 4, price: 200 },
      ]),
    );
    render(
      <TrackingProvider>
        <ConfirmedOrder />
      </TrackingProvider>,
    );
    expect(fbqTracks("Purchase")).toHaveLength(0);

    resolveConfigs({ success: true, result: [metaConfig] });
    await waitFor(() => expect(fbqTracks("Purchase")).toHaveLength(1));

    const [, , params, options] = fbqTracks("Purchase")[0]!;
    expect(params).toMatchObject({
      value: 913.75,
      currency: "EGP",
      content_ids: ["p1", "p2"],
      contents: [
        { id: "p1", quantity: 2 },
        { id: "p2", quantity: 4 },
      ],
      content_type: "product",
      num_items: 6,
    });
    expect(options).toEqual({ eventID: `purchase-${ORDER}` });

    // PageView still leads, and nothing is delivered twice.
    const order = fbq.mock.calls.filter(([cmd]) => cmd === "track").map(([, name]) => name);
    expect(order).toEqual(["PageView", "Purchase"]);

    // The same deterministic id goes to the server relay (Conversions API),
    // so Meta dedupes the browser and server copies.
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const bodies = fetchSpy.mock.calls.map(([, init]) => String((init as RequestInit).body));
    expect(bodies.join("")).toContain(`"eventId":"purchase-${ORDER}"`);
  });

  it("a remount (refresh) after delivery does not send it again", async () => {
    const first = render(
      <TrackingProvider>
        <ConfirmedOrder />
      </TrackingProvider>,
    );
    resolveConfigs({ success: true, result: [metaConfig] });
    await waitFor(() => expect(fbqTracks("Purchase")).toHaveLength(1));
    first.unmount();

    render(
      <TrackingProvider>
        <ConfirmedOrder />
      </TrackingProvider>,
    );
    resolveConfigs({ success: true, result: [metaConfig] });
    await waitFor(() => expect(fbqTracks("PageView")).toHaveLength(2));
    expect(fbqTracks("Purchase")).toHaveLength(1);
  });
});
