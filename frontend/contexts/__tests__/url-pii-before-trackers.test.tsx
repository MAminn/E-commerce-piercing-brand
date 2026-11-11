// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * P1 — the customer email must never reach a pixel or the /api/track beacon
 * through the page URL. Proven on a legacy confirmation link that still has
 * `?email=`: the <head> script cleans the address bar first, the Meta pixel
 * then sees a clean `location.href` at the moment it is called, and every
 * event object (bus → pixels, buffer → beacon) carries a clean pageUrl.
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
                enableServerSide: false,
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

let pageContext: Record<string, unknown> = {};
vi.mock("vike-react/usePageContext", () => ({ usePageContext: () => pageContext }));

import { TrackingProvider, useTracking } from "../TrackingContext";
import { trackPurchaseOnce } from "#root/frontend/tracking/purchase-event";
import { trackingEventBus } from "#root/shared/utils/tracking-event-bus";
import { STRIP_URL_PII_SCRIPT } from "#root/shared/utils/strip-url-pii-script";
import type { TrackingEvent } from "#root/shared/types/pixel-tracking";
import HeadDefault from "#root/pages/+Head";

const ORDER = "0f1e2d3c-4b5a-4968-8778-6a5b4c3d2e1f";
const EMAIL = "shopper@example.test";
const LEGACY_URL = `/order-confirmation?id=${ORDER}&total=385.00&email=${encodeURIComponent(EMAIL)}`;

let fbqHrefs: string[];
let fbq: ReturnType<typeof vi.fn>;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", LEGACY_URL);
  fbqHrefs = [];
  // fbevents.js reads document.location itself — record it at call time.
  fbq = vi.fn(() => fbqHrefs.push(window.location.href));
  (window as unknown as { fbq: unknown }).fbq = fbq;
  fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

function Confirmed() {
  const { trackEvent } = useTracking();
  useEffect(() => {
    trackPurchaseOnce({ orderId: ORDER, total: "385.00", trackEvent, local: localStorage, session: sessionStorage });
  }, [trackEvent]);
  return null;
}

describe("PII in the URL never reaches a pixel or the beacon", () => {
  it("the strip script is the first inline script in <head>, ahead of the GA4 config snippet", () => {
    pageContext = { activeGA4PixelId: "G-TEST000001", urlPathname: "/order-confirmation" };
    const html = renderToStaticMarkup(createElement(HeadDefault));
    // React 19 hoists the async gtag.js <script src> to the top of the head.
    // That loader sends nothing by itself: no GA4 hit (which is when GA4 reads
    // document.location) can happen before the inline `gtag("config", …,
    // {send_page_view:false})` command and our own events after hydration —
    // and the strip script runs before that inline command. Meta and Clarity
    // are injected only after hydration.
    const strip = html.indexOf("data-strip-url-pii");
    const gtagConfig = html.indexOf('gtag("config"');
    expect(strip).toBeGreaterThan(-1);
    expect(gtagConfig).toBeGreaterThan(-1);
    expect(strip).toBeLessThan(gtagConfig);
    const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)];
    expect(inlineScripts[0]?.[0]).toContain("data-strip-url-pii");
  });

  it("legacy ?email= link: address bar cleaned before trackers; pixels and beacon see no email", async () => {
    // What the browser runs first, from <head>.
    new Function("window", STRIP_URL_PII_SCRIPT)(window);
    expect(window.location.search).not.toContain("email");
    expect(sessionStorage.getItem(`order_email:${ORDER}`)).toBe(EMAIL);

    const busEvents: TrackingEvent[] = [];
    const unsubscribe = trackingEventBus.subscribe((e) => busEvents.push(e));

    render(
      <TrackingProvider>
        <Confirmed />
      </TrackingProvider>,
    );

    await waitFor(() =>
      expect(fbq.mock.calls.some(([cmd, name]) => cmd === "track" && name === "Purchase")).toBe(true),
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    unsubscribe();

    expect(fbqHrefs.length).toBeGreaterThan(0);
    for (const href of fbqHrefs) expect(href).not.toMatch(/email|%40|@/);
    for (const e of busEvents) expect(e.pageUrl).not.toMatch(/email|%40|@/);
    const bodies = fetchSpy.mock.calls.map(([, init]) => String((init as RequestInit).body)).join("");
    expect(bodies).toContain(`purchase-${ORDER}`);
    expect(bodies).not.toMatch(/email|%40|example\.test/);
  });

  it("even if the address bar still had ?email=, the event objects are sanitised", async () => {
    const busEvents: TrackingEvent[] = [];
    const unsubscribe = trackingEventBus.subscribe((e) => busEvents.push(e));
    render(
      <TrackingProvider>
        <Confirmed />
      </TrackingProvider>,
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    unsubscribe();
    expect(busEvents.length).toBeGreaterThan(0);
    for (const e of busEvents) {
      expect(e.pageUrl).toContain(`id=${ORDER}`);
      expect(e.pageUrl).not.toMatch(/email|%40/);
    }
    const bodies = fetchSpy.mock.calls.map(([, init]) => String((init as RequestInit).body)).join("");
    expect(bodies).not.toMatch(/email|%40|example\.test/);
  });
});
