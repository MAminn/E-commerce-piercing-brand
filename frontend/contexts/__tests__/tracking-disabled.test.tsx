// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor, act } from "@testing-library/react";
import { useEffect } from "react";

/**
 * A1 — with TRACKING_EXCLUDE_INTERNAL the layout passes `disabled` on
 * /dashboard* routes: no pixel adapter is loaded, nothing is sent to
 * /api/track, and trackEvent is a no-op. Switching back on (client navigation
 * to the storefront) restores tracking without a duplicate initial PageView.
 */

const listActive = vi.fn(async () => ({
  success: true,
  result: [
    {
      id: "cfg-meta",
      platform: "meta",
      pixelId: "1234567890",
      enabled: true,
      enableClientSide: true,
      enableServerSide: false,
      consentRequired: false,
      createdAt: new Date(),
    },
  ],
}));
vi.mock("#root/shared/trpc/client", () => ({
  trpc: {
    pixelTracking: {
      config: { listActive: { query: () => listActive() } },
      customEvents: { listActive: { query: async () => ({ success: true, result: [] }) } },
    },
  },
}));

import { TrackingProvider, useTracking } from "../TrackingContext";

let fbq: ReturnType<typeof vi.fn>;
let fetchSpy: ReturnType<typeof vi.fn>;
let track: ReturnType<typeof useTracking>["trackEvent"] = () => {};

function Grab() {
  const { trackEvent } = useTracking();
  useEffect(() => {
    track = trackEvent;
  }, [trackEvent]);
  return null;
}

beforeEach(() => {
  listActive.mockClear();
  fbq = vi.fn();
  (window as unknown as { fbq: unknown }).fbq = fbq;
  fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const tracks = (name?: string) =>
  fbq.mock.calls.filter(([cmd, n]) => cmd === "track" && (name ? n === name : true));

describe("TrackingProvider disabled (dashboard routes)", () => {
  it("loads no pixel, sends no beacon and ignores trackEvent", async () => {
    render(
      <TrackingProvider disabled>
        <Grab />
      </TrackingProvider>,
    );
    act(() => track("product_viewed"));
    await new Promise((r) => setTimeout(r, 400));
    expect(listActive).not.toHaveBeenCalled();
    expect(fbq).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("re-enabled after a dashboard visit: pixels come back, without a second initial PageView", async () => {
    const view = render(
      <TrackingProvider disabled>
        <Grab />
      </TrackingProvider>,
    );
    view.rerender(
      <TrackingProvider disabled={false}>
        <Grab />
      </TrackingProvider>,
    );
    await waitFor(() => expect(fbq.mock.calls.some(([cmd]) => cmd === "init")).toBe(true));
    // +onPageTransitionEnd owns the PageView of a client navigation.
    expect(tracks("PageView")).toHaveLength(0);
    act(() => track("product_viewed"));
    await waitFor(() => expect(tracks("ViewContent")).toHaveLength(1));
  });

  it("enabled → disabled (storefront → dashboard): adapters are torn down, later events go nowhere", async () => {
    const view = render(
      <TrackingProvider>
        <Grab />
      </TrackingProvider>,
    );
    await waitFor(() => expect(tracks("PageView")).toHaveLength(1));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    view.rerender(
      <TrackingProvider disabled>
        <Grab />
      </TrackingProvider>,
    );
    fbq.mockClear();
    fetchSpy.mockClear();
    act(() => track("product_viewed"));
    await new Promise((r) => setTimeout(r, 400));
    expect(fbq).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("GA4 on an internal route: no gtag event, and the already-loaded gtag.js is opted out (ga-disable)", async () => {
    const tag = document.createElement("script");
    tag.setAttribute("data-pixel-platform", "google_ga4");
    tag.setAttribute("data-pixel-id", "G-TESTGA4");
    document.head.appendChild(tag);
    const gtag = vi.fn();
    (window as unknown as { gtag: unknown }).gtag = gtag;
    const metaOnly = listActive.getMockImplementation();
    listActive.mockImplementation(async () => ({
      success: true,
      result: [
        {
          id: "cfg-ga4",
          platform: "google_ga4",
          pixelId: "G-TESTGA4",
          enabled: true,
          enableClientSide: true,
          enableServerSide: true,
          consentRequired: false,
          createdAt: new Date(),
        },
      ],
    }));
    const flag = () => (window as unknown as Record<string, unknown>)["ga-disable-G-TESTGA4"];
    try {
      // Storefront first (gtag.js loaded), then client navigation into the dashboard.
      const view = render(
        <TrackingProvider>
          <Grab />
        </TrackingProvider>,
      );
      await waitFor(() => expect(gtag.mock.calls.filter(([c, n]) => c === "event" && n === "page_view")).toHaveLength(1));
      expect(flag()).toBeUndefined(); // storefront never touches the opt-out
      view.rerender(
        <TrackingProvider disabled>
          <Grab />
        </TrackingProvider>,
      );
      expect(flag()).toBe(true);
      gtag.mockClear();
      act(() => track("product_added_to_cart"));
      await new Promise((r) => setTimeout(r, 300));
      expect(gtag.mock.calls.filter(([c]) => c === "event")).toHaveLength(0);
      // Back to the storefront: GA4 sends again.
      view.rerender(
        <TrackingProvider disabled={false}>
          <Grab />
        </TrackingProvider>,
      );
      expect(flag()).toBe(false);
      act(() => track("product_added_to_cart"));
      await waitFor(() =>
        expect(gtag.mock.calls.filter(([c, n]) => c === "event" && n === "add_to_cart")).toHaveLength(1),
      );
    } finally {
      tag.remove();
      Reflect.deleteProperty(window, "ga-disable-G-TESTGA4");
      Reflect.deleteProperty(window, "gtag");
      if (metaOnly) listActive.mockImplementation(metaOnly);
    }
  });

  it("default (not disabled) behaves exactly as before: PageView on load", async () => {
    render(
      <TrackingProvider>
        <Grab />
      </TrackingProvider>,
    );
    await waitFor(() => expect(tracks("PageView")).toHaveLength(1));
  });
});
