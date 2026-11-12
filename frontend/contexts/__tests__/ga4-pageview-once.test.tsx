// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * GA4 page_view count with the production property settings (2026-11-12):
 * Enhanced measurement → Page views: "Page loads" ON, "Page changes based on
 * browser history events" OFF.
 *
 * GA4 rule modelled here (Google's gtag docs): with Page loads ON, every
 * `gtag('config', id, …)` sends an automatic page_view UNLESS it carries
 * `send_page_view: false`; every `gtag('event', 'page_view', …)` is one more.
 * History-change page views are off in the property, so client navigation
 * only counts the page_view our code sends.
 *
 * The real SSR snippet from pages/+Head.tsx is rendered and executed, then the
 * real TrackingProvider (initial PageView) and +onPageTransitionEnd (client
 * navigation PageView) run on top of it.
 */

const GA4_ID = "G-TZZRFSD70Q";
const META_ID = "1234567890";

let pageContext: Record<string, unknown> = {};
vi.mock("vike-react/usePageContext", () => ({ usePageContext: () => pageContext }));

const listActive = vi.fn(async () => ({
  success: true,
  result: [
    {
      id: "cfg-ga4",
      platform: "google_ga4",
      pixelId: GA4_ID,
      enabled: true,
      enableClientSide: true,
      enableServerSide: true,
      consentRequired: false,
      createdAt: new Date(),
    },
    {
      id: "cfg-meta",
      platform: "meta",
      pixelId: META_ID,
      enabled: true,
      enableClientSide: true,
      enableServerSide: true,
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

import HeadDefault from "#root/pages/+Head";
import { TrackingProvider } from "../TrackingContext";
import { onPageTransitionEnd } from "#root/pages/+onPageTransitionEnd";

type Win = Window & { dataLayer?: unknown[]; gtag?: unknown; fbq?: unknown };
const w = window as unknown as Win;

/** GA4 page_views a property with "Page loads" ON records from this dataLayer. */
function ga4PageViews(): number {
  let n = 0;
  for (const entry of w.dataLayer ?? []) {
    const [cmd, a, b] = Array.from(entry as ArrayLike<unknown>);
    if (cmd === "config" && a === GA4_ID) {
      const params = (b ?? {}) as { send_page_view?: boolean };
      if (params.send_page_view !== false) n++;
    }
    if (cmd === "event" && a === "page_view") n++;
  }
  return n;
}

let fbq: ReturnType<typeof vi.fn>;
const metaPageViews = () => fbq.mock.calls.filter(([c, n]) => c === "track" && n === "PageView").length;

/** A new document: fresh globals, then the SSR <head> GA4 snippet exactly as rendered for `path`. */
function loadDocument(path: string, opts: { excludeDashboard: boolean; ssrGa4: boolean }) {
  for (const el of Array.from(document.head.querySelectorAll("script"))) el.remove();
  Reflect.deleteProperty(w, "dataLayer");
  Reflect.deleteProperty(w, "gtag");
  Reflect.deleteProperty(w, `ga-disable-${GA4_ID}`);
  window.history.replaceState(null, "", path);
  // server.ts / vike-handler.ts: no GA4 id at all for internal routes when excluded.
  pageContext = {
    urlPathname: path,
    urlOriginal: path,
    activeGA4PixelId: opts.ssrGa4 ? GA4_ID : null,
    trackingFlags: { excludeDashboard: opts.excludeDashboard },
  };
  const html = renderToStaticMarkup(<HeadDefault />);
  const holder = document.createElement("div");
  holder.innerHTML = html;
  for (const s of Array.from(holder.querySelectorAll("script"))) {
    const tag = document.createElement("script");
    for (const attr of Array.from(s.attributes)) tag.setAttribute(attr.name, attr.value);
    document.head.appendChild(tag); // src scripts are not fetched in jsdom
    // Inline GA4 bootstrap only (other inline head scripts are unrelated).
    if (!s.getAttribute("src") && s.textContent?.includes("gtag(")) new Function(s.textContent)();
  }
  return html;
}

beforeEach(() => {
  listActive.mockClear();
  fbq = vi.fn();
  (window as unknown as { fbq: unknown }).fbq = fbq;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 204 })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const nav = (to: string, from: string, excludeDashboard = true) => {
  window.history.pushState(null, "", to);
  return onPageTransitionEnd({
    urlOriginal: to,
    urlPathname: new URL(to, "http://x").pathname,
    previousPageContext: { urlOriginal: from },
    trackingFlags: { excludeDashboard },
  } as never);
};

describe("GA4 page_view with property 'Page loads' ON", () => {
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ matches: true, media: q })) as never;
  });

  it("the SSR gtag config carries send_page_view:false (no automatic page_view)", () => {
    const html = loadDocument("/", { excludeDashboard: true, ssrGa4: true });
    expect(html).toContain(`gtag("config","${GA4_ID}",{send_page_view:false})`);
    expect(ga4PageViews()).toBe(0);
  });

  it("1. initial full page load → exactly 1 GA4 page_view (and 1 Meta PageView)", async () => {
    loadDocument("/", { excludeDashboard: true, ssrGa4: true });
    render(<TrackingProvider>{null}</TrackingProvider>);
    await waitFor(() => expect(ga4PageViews()).toBe(1));
    await new Promise((r) => setTimeout(r, 200));
    expect(ga4PageViews()).toBe(1);
    expect(metaPageViews()).toBe(1);
  });

  it("2. SPA navigation → exactly 1 more GA4 page_view per real page change; query-only change → none", async () => {
    loadDocument("/", { excludeDashboard: true, ssrGa4: true });
    const view = render(<TrackingProvider>{null}</TrackingProvider>);
    await waitFor(() => expect(ga4PageViews()).toBe(1));

    await act(() => nav("/shop", "/"));
    view.rerender(<TrackingProvider>{null}</TrackingProvider>);
    expect(ga4PageViews()).toBe(2);
    await act(() => nav("/shop/seamless-ring-8mm", "/shop"));
    expect(ga4PageViews()).toBe(3);
    await act(() => nav("/shop?sort=price", "/shop/seamless-ring-8mm"));
    expect(ga4PageViews()).toBe(4);
    await act(() => nav("/shop?sort=price&page=2", "/shop?sort=price"));
    expect(ga4PageViews()).toBe(4); // same page, new state — not a visit
    await new Promise((r) => setTimeout(r, 200));
    expect(ga4PageViews()).toBe(4);
    expect(metaPageViews()).toBe(4); // Meta: unchanged, one PageView per real page too
  });

  it("2b. adapter fallback (no SSR tag) also configures with send_page_view:false → still exactly 1", async () => {
    loadDocument("/", { excludeDashboard: true, ssrGa4: false });
    expect(w.gtag).toBeUndefined();
    render(<TrackingProvider>{null}</TrackingProvider>);
    await waitFor(() => expect(ga4PageViews()).toBe(1));
    const configs = (w.dataLayer ?? []).filter((e) => Array.from(e as ArrayLike<unknown>)[0] === "config");
    expect(configs).toHaveLength(1);
    expect(Array.from(configs[0] as ArrayLike<unknown>)[2]).toEqual({ send_page_view: false });
  });

  it("3. refresh / new document load → exactly 1 GA4 page_view again", async () => {
    loadDocument("/shop/seamless-ring-8mm", { excludeDashboard: true, ssrGa4: true });
    render(<TrackingProvider>{null}</TrackingProvider>);
    await waitFor(() => expect(ga4PageViews()).toBe(1));
    cleanup();
    fbq.mockClear();
    // Reload: a brand-new document.
    loadDocument("/shop/seamless-ring-8mm", { excludeDashboard: true, ssrGa4: true });
    expect(ga4PageViews()).toBe(0);
    render(<TrackingProvider>{null}</TrackingProvider>);
    await waitFor(() => expect(ga4PageViews()).toBe(1));
    await new Promise((r) => setTimeout(r, 200));
    expect(ga4PageViews()).toBe(1);
    expect(metaPageViews()).toBe(1);
  });

  it.each(["/admin", "/admin/login", "/dashboard", "/dashboard/orders"])(
    "4. %s loaded directly → no GA4 tag rendered and 0 GA4 page_views (0 Meta)",
    async (path) => {
      const html = loadDocument(path, { excludeDashboard: true, ssrGa4: false });
      expect(html).not.toContain("googletagmanager");
      // LayoutDefault passes disabled on internal routes.
      render(<TrackingProvider disabled>{null}</TrackingProvider>);
      await new Promise((r) => setTimeout(r, 300));
      expect(ga4PageViews()).toBe(0);
      expect(metaPageViews()).toBe(0);
      expect(listActive).not.toHaveBeenCalled();
    },
  );

  it("4b. storefront → /dashboard and → /admin by client navigation → 0 GA4 page_views for them; back → 1", async () => {
    loadDocument("/", { excludeDashboard: true, ssrGa4: true });
    const view = render(<TrackingProvider>{null}</TrackingProvider>);
    await waitFor(() => expect(ga4PageViews()).toBe(1));
    view.rerender(<TrackingProvider disabled>{null}</TrackingProvider>);
    await act(() => nav("/dashboard/orders", "/"));
    await act(() => nav("/admin", "/dashboard/orders"));
    expect(ga4PageViews()).toBe(1);
    expect((window as unknown as Record<string, unknown>)[`ga-disable-${GA4_ID}`]).toBe(true);
    expect(metaPageViews()).toBe(1);
    view.rerender(<TrackingProvider>{null}</TrackingProvider>);
    await act(() => nav("/shop", "/admin"));
    await waitFor(() => expect(ga4PageViews()).toBe(2));
    await new Promise((r) => setTimeout(r, 200));
    expect(ga4PageViews()).toBe(2); // no second "initial" page_view on re-enable
    expect(metaPageViews()).toBe(2);
  });
});
