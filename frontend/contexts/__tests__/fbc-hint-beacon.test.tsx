// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";

/**
 * META_FBC_FALLBACK in the browser: a landing ?fbclid= is kept in
 * localStorage and every /api/track event carries it as `fbcHint` — also on
 * later pages without the click in the URL and after the _fbc cookie is
 * gone. The browser pixels never see the hint. Flag off → nothing stored,
 * nothing sent.
 */
vi.mock("#root/shared/trpc/client", () => ({
  trpc: {
    pixelTracking: {
      config: {
        listActive: {
          query: async () => ({
            success: true,
            result: [
              {
                id: "cfg-meta",
                platform: "meta",
                pixelId: "1234567890",
                enabled: true,
                enableClientSide: true,
                enableServerSide: true,
                consentRequired: false,
                createdAt: new Date(),
              },
            ],
          }),
        },
      },
      customEvents: { listActive: { query: async () => ({ success: true, result: [] }) } },
    },
  },
}));
vi.mock("vike-react/usePageContext", () => ({ usePageContext: () => ({}) }));

import { TrackingProvider } from "../TrackingContext";
import { trackingEventBus } from "#root/shared/utils/tracking-event-bus";
import { FBC_STORAGE_KEY } from "#root/frontend/tracking/fbc-hint";
import type { TrackingEvent } from "#root/shared/types/pixel-tracking";

let fetchSpy: ReturnType<typeof vi.fn>;
const beaconEvents = () =>
  fetchSpy.mock.calls.flatMap(([, init]) => (JSON.parse(String((init as RequestInit).body)) as { events: Array<Record<string, unknown>> }).events);

beforeEach(() => {
  localStorage.clear();
  document.cookie = "_fbc=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  (window as unknown as { fbq: unknown }).fbq = vi.fn();
  fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("fbcHint on the beacon", () => {
  it("flag on: landing click kept; every beacon event carries the hint; the bus (pixels) never does", async () => {
    window.history.replaceState(null, "", "/shop/ring?utm_source=fb&fbclid=IwAR_land-1");
    const bus: TrackingEvent[] = [];
    const unsubscribe = trackingEventBus.subscribe((e) => bus.push(e));
    const { unmount } = render(<TrackingProvider metaFbcFallback>{null}</TrackingProvider>);
    await waitFor(() => expect(beaconEvents().length).toBeGreaterThan(0));
    unmount();
    unsubscribe();

    const stored = JSON.parse(localStorage.getItem(FBC_STORAGE_KEY)!) as { fbclid: string; firstSeenMs: number };
    expect(stored.fbclid).toBe("IwAR_land-1");
    const hint = `fb.1.${stored.firstSeenMs}.IwAR_land-1`;
    expect(beaconEvents().every((e) => e.fbcHint === hint)).toBe(true);
    expect(bus.length).toBeGreaterThan(0);
    expect(bus.every((e) => !("fbcHint" in e))).toBe(true);
  });

  it("flag on: a later page without fbclid and without the _fbc cookie still sends the kept click", async () => {
    localStorage.setItem(FBC_STORAGE_KEY, JSON.stringify({ fbclid: "IwAR_earlier", firstSeenMs: Date.now() - 3600_000 }));
    window.history.replaceState(null, "", "/order-confirmation?id=x");
    render(<TrackingProvider metaFbcFallback>{null}</TrackingProvider>);
    await waitFor(() => expect(beaconEvents().length).toBeGreaterThan(0));
    expect(beaconEvents().every((e) => String(e.fbcHint).endsWith(".IwAR_earlier"))).toBe(true);
  });

  it("flag off: nothing stored, no hint on any beacon event", async () => {
    window.history.replaceState(null, "", "/shop/ring?fbclid=IwAR_land-2");
    render(<TrackingProvider metaFbcFallback={false}>{null}</TrackingProvider>);
    await waitFor(() => expect(beaconEvents().length).toBeGreaterThan(0));
    expect(localStorage.getItem(FBC_STORAGE_KEY)).toBeNull();
    expect(beaconEvents().every((e) => !("fbcHint" in e))).toBe(true);
  });
});
