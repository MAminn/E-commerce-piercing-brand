// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { createHash, webcrypto } from "node:crypto";
import Fastify from "fastify";

/**
 * Meta browser Pixel ↔ Conversions API, end to end through the real code:
 *
 *   real SSR <head> (GA4 bootstrap) → real TrackingProvider / useTracking /
 *   +onPageTransitionEnd / trackPurchaseOnce → captured fbq calls and the
 *   real /api/track beacon bodies → the real Fastify /api/track route → the
 *   real delivery pipeline → the real Meta CAPI adapter (only the Graph API
 *   HTTP call is stubbed) and a recording fake DB (tracking_event rows =
 *   internal visit stats).
 *
 * Counts per scenario: browser Meta PageView, CAPI PageView, shared
 * event_id, tracking_event rows — plus GA4 page_view (must be unchanged) and
 * Measurement Protocol hits (must stay 0).
 */

const GA4_ID = "G-TZZRFSD70Q";
const META_ID = "1234567890";
const SESSION_ID = "0193F000-AAAA-7BBB-8CCC-000000000001"; // stored as-is by an old client
const ORDER_ID = "0193a6c1-0000-7000-8000-00000000abcd";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)";
const FBP = "fb.1.1731400000000.1234567890";
const RAW_EMAIL = " Shopper.Name@Example.COM ";
const RAW_PHONE = "010 1234 5678";
const ACCOUNT_EMAIL = "Account.Holder@Example.com";
const ACCOUNT_PHONE = "+20 111 222 3333";

const sha = (v: string) => createHash("sha256").update(v, "utf8").digest("hex");
const EXTERNAL_ID = sha(SESSION_ID.toLowerCase());

let pageContext: Record<string, unknown> = {};
vi.mock("vike-react/usePageContext", () => ({ usePageContext: () => pageContext }));

const clientConfig = (platform: string, pixelId: string) => ({
  id: `cfg-${platform}`,
  platform,
  pixelId,
  enabled: true,
  enableClientSide: true,
  enableServerSide: true,
  consentRequired: false,
  createdAt: new Date(),
});
const listActive = vi.fn(async () => ({
  success: true,
  result: [clientConfig("google_ga4", GA4_ID), clientConfig("meta", META_ID)],
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
import { TrackingProvider, useTracking } from "../TrackingContext";
import { onPageTransitionEnd } from "#root/pages/+onPageTransitionEnd";
import { trackBeaconPlugin } from "#root/server/routes/track";
import { trackPurchaseOnce, purchaseEventId } from "#root/frontend/tracking/purchase-event";
import { TrackingEventName, type EcommerceEventData } from "#root/shared/types/pixel-tracking";
import {
  ga4ServerConfig,
  makePipelineFakeDb,
  metaServerConfig,
} from "#root/backend/pixel-tracking/__tests__/pipeline-fake-db";

// ─── Browser harness ─────────────────────────────────────────────────────────

type Win = Window & { dataLayer?: unknown[]; gtag?: unknown };
const w = window as unknown as Win;

function loadDocument(path: string, opts: { internal?: boolean } = {}) {
  for (const el of Array.from(document.head.querySelectorAll("script"))) el.remove();
  Reflect.deleteProperty(w, "dataLayer");
  Reflect.deleteProperty(w, "gtag");
  Reflect.deleteProperty(w, `ga-disable-${GA4_ID}`);
  window.history.replaceState(null, "", path);
  pageContext = {
    urlPathname: new URL(path, "http://x").pathname,
    urlOriginal: path,
    activeGA4PixelId: opts.internal ? null : GA4_ID,
    trackingFlags: { excludeDashboard: true, metaAdvancedMatching: true },
  };
  const holder = document.createElement("div");
  holder.innerHTML = renderToStaticMarkup(<HeadDefault />);
  for (const s of Array.from(holder.querySelectorAll("script"))) {
    const tag = document.createElement("script");
    for (const attr of Array.from(s.attributes)) tag.setAttribute(attr.name, attr.value);
    document.head.appendChild(tag);
    if (!s.getAttribute("src") && s.textContent?.includes("gtag(")) new Function(s.textContent)();
  }
}

function ga4PageViews(): number {
  let n = 0;
  for (const entry of w.dataLayer ?? []) {
    const [cmd, a, b] = Array.from(entry as ArrayLike<unknown>);
    if (cmd === "config" && a === GA4_ID && (b as { send_page_view?: boolean } | undefined)?.send_page_view !== false) n++;
    if (cmd === "event" && a === "page_view") n++;
  }
  return n;
}
const ga4Events = () =>
  (w.dataLayer ?? [])
    .map((e) => Array.from(e as ArrayLike<unknown>))
    .filter(([cmd]) => cmd === "event")
    .map(([, name, params]) => ({ name, params }));

function clearCookies() {
  for (const part of document.cookie.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}
function cookieJar(): Record<string, string> {
  const jar: Record<string, string> = {};
  for (const part of document.cookie.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) jar[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return jar;
}

let fbq: ReturnType<typeof vi.fn>;
const browserTracks = () =>
  fbq.mock.calls
    .filter(([cmd]) => cmd === "track")
    .map(([, name, params, options]) => ({
      name: name as string,
      params: params as Record<string, unknown>,
      id: (options as { eventID: string }).eventID,
    }));
const browserPageViews = () => browserTracks().filter((t) => t.name === "PageView");
const inits = () => fbq.mock.calls.filter(([cmd]) => cmd === "init");

// ─── Network harness ─────────────────────────────────────────────────────────

let beacons: string[] = [];
let capiBatches: Array<{ data: Array<Record<string, unknown>> }> = [];
let ga4MpHits = 0;
let consoleOutput: string[] = [];

beforeEach(() => {
  listActive.mockClear();
  beacons = [];
  capiBatches = [];
  ga4MpHits = 0;
  consoleOutput = [];
  fbq = vi.fn();
  (window as unknown as { fbq: unknown }).fbq = fbq;
  clearCookies();
  document.cookie = `_fbp=${FBP}; path=/`; // fbevents.js already ran (the usual case)
  window.localStorage.clear();
  window.sessionStorage.clear(); // trackPurchaseOnce's per-order marker
  window.localStorage.setItem("tracking_session_id", SESSION_ID);
  window.matchMedia = ((q: string) => ({ matches: true, media: q })) as never;
  // jsdom has no SubtleCrypto; browsers do (secure contexts). Node's is the same API.
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: { body?: unknown }) => {
      const u = String(url);
      if (u === "/api/track") {
        beacons.push(String(init?.body));
        return new Response(null, { status: 204 });
      }
      if (u.startsWith("https://graph.facebook.com/")) {
        capiBatches.push(JSON.parse(String(init?.body)));
        return new Response('{"events_received":1}', { status: 200 });
      }
      if (u.includes("google-analytics.com")) {
        ga4MpHits++;
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected fetch ${u}`);
    }),
  );
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    });
  }
  Reflect.deleteProperty(process.env, "META_ADVANCED_MATCHING");
  Reflect.deleteProperty(process.env, "TRACKING_EXCLUDE_INTERNAL");
  Reflect.deleteProperty(process.env, "GA4_MP_MODE");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const settle = async () => {
  for (let i = 0; i < 40; i++) await new Promise((r) => setTimeout(r, 0));
};

/** Wait for the provider's debounced beacon. */
const beaconFlushed = async (n = 1) => waitFor(() => expect(beacons.length).toBeGreaterThanOrEqual(n), { timeout: 3000 });

type Fake = ReturnType<typeof makePipelineFakeDb>;

/** POST every captured beacon body to the real /api/track route, with this browser's cookies. */
async function deliver(fake: Fake, opts: { session?: Record<string, unknown> } = {}) {
  const bodies = beacons.splice(0);
  for (const payload of bodies) {
    const app = Fastify();
    const cookies = cookieJar();
    app.addHook("onRequest", async (req) => {
      Object.assign(req, { db: fake.db, cookies, clientSession: opts.session });
    });
    await app.register(trackBeaconPlugin, { prefix: "/api/track" });
    const res = await app.inject({
      method: "POST",
      url: "/api/track",
      payload: JSON.parse(payload),
      headers: { "user-agent": UA },
    });
    expect(res.statusCode).toBe(204);
    await app.close();
  }
  await settle();
}

const capiEvents = () => capiBatches.flatMap((b) => b.data);
const capiPageViews = () => capiEvents().filter((e) => e.event_name === "PageView");
const rows = (fake: Fake, name: string) => fake.persisted.filter((r) => r.eventName === name);

const nav = (to: string, from: string) => {
  window.history.pushState(null, "", to);
  return onPageTransitionEnd({
    urlOriginal: to,
    urlPathname: new URL(to, "http://x").pathname,
    previousPageContext: { urlOriginal: from },
    trackingFlags: { excludeDashboard: true, metaAdvancedMatching: true },
  } as never);
};

const provider = (props: Record<string, unknown> = {}, child: React.ReactNode = null) => (
  <TrackingProvider metaAdvancedMatching {...props}>
    {child}
  </TrackingProvider>
);

const fakeDb = (extra: Partial<Parameters<typeof makePipelineFakeDb>[0]> = {}) =>
  makePipelineFakeDb({ configs: [metaServerConfig, ga4ServerConfig], ...extra });

/** Land on `path` and deliver the landing beacon. */
async function land(path: string, fake: Fake, props: Record<string, unknown> = {}) {
  loadDocument(path);
  const view = render(provider(props));
  await waitFor(() => expect(browserPageViews()).toHaveLength(1));
  await beaconFlushed();
  await deliver(fake);
  return view;
}

// ─── PageView ────────────────────────────────────────────────────────────────

describe("PageView: browser Pixel + CAPI, one shared event_id", () => {
  it("1. initial landing → browser 1, CAPI 1, same event_id, 1 tracking_event row; GA4 page_view 1", async () => {
    const fake = fakeDb();
    await land("/", fake);

    expect(browserPageViews()).toHaveLength(1);
    expect(capiPageViews()).toHaveLength(1);
    expect(capiPageViews()[0]?.event_id).toBe(browserPageViews()[0]?.id);
    expect(rows(fake, TrackingEventName.PAGE_VIEWED)).toHaveLength(1);
    expect(ga4PageViews()).toBe(1);
    expect(ga4MpHits).toBe(0);
  });

  it("2. SPA navigation → exactly one more browser PageView and one more CAPI PageView, same event_id, + 1 row", async () => {
    const fake = fakeDb();
    await land("/", fake);

    await act(() => nav("/shop", "/"));
    expect(browserPageViews()).toHaveLength(2);
    await beaconFlushed();
    await deliver(fake);

    expect(capiPageViews()).toHaveLength(2);
    const spa = browserPageViews()[1];
    const spaCapi = capiPageViews()[1];
    expect(spaCapi?.event_id).toBe(spa?.id);
    expect(spaCapi?.event_source_url).toBe("http://localhost:3000/shop");
    expect(rows(fake, TrackingEventName.PAGE_VIEWED)).toHaveLength(2);
    expect(ga4PageViews()).toBe(2);
  });

  it("3. multiple navigations (/shop → product → /cart → /checkout) → exactly one pair per navigation", async () => {
    const fake = fakeDb();
    await land("/", fake);

    const path = ["/shop", "/shop/seamless-ring-8mm", "/cart", "/checkout"];
    let from = "/";
    for (const to of path) {
      await act(() => nav(to, from));
      from = to;
    }
    await beaconFlushed();
    await deliver(fake);

    const browser = browserPageViews();
    const server = capiPageViews();
    expect(browser).toHaveLength(5);
    expect(server).toHaveLength(5);
    expect(new Set(browser.map((b) => b.id)).size).toBe(5);
    // Pairwise: same ids, same order, nothing extra on either side.
    expect(server.map((s) => s.event_id)).toEqual(browser.map((b) => b.id));
    expect(server.map((s) => new URL(String(s.event_source_url)).pathname)).toEqual(["/", ...path]);
    expect(rows(fake, TrackingEventName.PAGE_VIEWED)).toHaveLength(5);
    expect(ga4PageViews()).toBe(5);
    expect(ga4MpHits).toBe(0);
  });

  it("4. query-only navigation (sort / page / filter) → no PageView on either side, no beacon (unchanged rule)", async () => {
    const fake = fakeDb();
    await land("/shop", fake);

    await act(() => nav("/shop?sort=price", "/shop"));
    await act(() => nav("/shop?sort=price&page=2", "/shop?sort=price"));
    await new Promise((r) => setTimeout(r, 400));

    expect(beacons).toHaveLength(0);
    await deliver(fake);
    expect(browserPageViews()).toHaveLength(1);
    expect(capiPageViews()).toHaveLength(1);
    expect(rows(fake, TrackingEventName.PAGE_VIEWED)).toHaveLength(1);
    expect(ga4PageViews()).toBe(1);
  });

  it.each(["/admin", "/admin/login", "/dashboard", "/dashboard/orders"])(
    "5/6. %s loaded directly → browser 0, CAPI 0, /api/track 0",
    async (path) => {
      loadDocument(path, { internal: true });
      // LayoutDefault passes disabled on internal routes.
      render(provider({ disabled: true }));
      await new Promise((r) => setTimeout(r, 400));
      expect(fbq).not.toHaveBeenCalled();
      expect(listActive).not.toHaveBeenCalled();
      expect(beacons).toHaveLength(0);
      expect(ga4PageViews()).toBe(0);
    },
  );

  it("5/6. storefront → /admin and → /dashboard by client navigation → browser 0, CAPI 0, /api/track 0 for them", async () => {
    const fake = fakeDb();
    const view = await land("/", fake);
    const pixelCallsBefore = fbq.mock.calls.length;

    view.rerender(provider({ disabled: true }));
    await act(() => nav("/admin", "/"));
    await act(() => nav("/dashboard/orders", "/admin"));
    await act(() => nav("/dashboard", "/dashboard/orders"));
    await new Promise((r) => setTimeout(r, 400));

    expect(fbq.mock.calls.length).toBe(pixelCallsBefore);
    expect(beacons).toHaveLength(0);
    expect(capiPageViews()).toHaveLength(1); // the landing only
    expect(ga4PageViews()).toBe(1);
  });

  it("5/6. an /admin or /dashboard event that still reaches /api/track (old cached bundle) → not stored, not relayed", async () => {
    const fake = fakeDb();
    for (const page of ["http://localhost:3000/admin", "http://localhost:3000/dashboard/orders"]) {
      beacons.push(
        JSON.stringify({
          events: [{ eventId: `x-${page}`, eventName: "page_viewed", timestamp: Date.now(), pageUrl: page, sessionId: SESSION_ID }],
        }),
      );
    }
    await deliver(fake);
    expect(fake.persisted).toHaveLength(0);
    expect(capiEvents()).toHaveLength(0);
  });

  it("dashboard → storefront by client navigation → one pair for the storefront page, no second 'initial' PageView", async () => {
    loadDocument("/dashboard/orders", { internal: true });
    const view = render(provider({ disabled: true }));
    await new Promise((r) => setTimeout(r, 300));
    view.rerender(provider());
    await act(() => nav("/shop", "/dashboard/orders"));
    await waitFor(() => expect(browserPageViews()).toHaveLength(1));
    await beaconFlushed();
    const fake = fakeDb();
    await deliver(fake);
    await new Promise((r) => setTimeout(r, 300));
    expect(browserPageViews()).toHaveLength(1);
    expect(capiPageViews()).toHaveLength(1);
    expect(capiPageViews()[0]?.event_id).toBe(browserPageViews()[0]?.id);
  });
});

// ─── Funnel deduplication + user_data ────────────────────────────────────────

const ITEM = { itemId: "p-1", itemName: "Seamless Ring 8mm", price: 110, quantity: 1, category: "Rings" };
const ecom = (value: number, quantity = 1): EcommerceEventData => ({
  currency: "EGP",
  value,
  items: [{ ...ITEM, quantity }],
});

let api: ReturnType<typeof useTracking> | null = null;
function Grab() {
  api = useTracking();
  return null;
}

const placedOrder = {
  id: ORDER_ID,
  createdAt: new Date(),
  paymentStatus: "not_required",
  status: "pending",
  customerEmail: RAW_EMAIL,
  customerPhone: RAW_PHONE,
  customerName: "Mona  Hassan",
  shippingCity: "Cairo",
  shippingState: "Cairo",
  shippingPostalCode: "",
  shippingCountry: "Egypt",
};

async function runFunnel(fake: Fake, opts: { session?: Record<string, unknown>; props?: Record<string, unknown> } = {}) {
  loadDocument("/shop/seamless-ring-8mm");
  render(provider(opts.props ?? {}, <Grab />));
  await waitFor(() => expect(browserPageViews()).toHaveLength(1));
  act(() => {
    api?.trackEvent(TrackingEventName.PRODUCT_VIEWED, { ecommerce: ecom(110) });
    api?.trackEvent(TrackingEventName.PRODUCT_ADDED_TO_CART, { ecommerce: ecom(220, 2) });
    api?.trackEvent(TrackingEventName.CHECKOUT_STARTED, { ecommerce: ecom(220, 2) });
  });
  const trackEvent = api?.trackEvent;
  if (!trackEvent) throw new Error("TrackingProvider not mounted");
  await act(async () => {
    trackPurchaseOnce({
      orderId: ORDER_ID,
      total: "270.00",
      trackEvent,
      local: window.localStorage,
      session: window.sessionStorage,
    });
  });
  await beaconFlushed();
  await deliver(fake, { session: opts.session });
}

const FUNNEL = [
  ["PageView", undefined],
  ["ViewContent", 110],
  ["AddToCart", 220],
  ["InitiateCheckout", 220],
  ["Purchase", 270],
] as const;

describe("Deduplication: one logical Meta event per action (browser eventID = CAPI event_id)", () => {
  it("PageView, ViewContent, AddToCart, InitiateCheckout, Purchase", async () => {
    const fake = fakeDb({ orders: [placedOrder] });
    await runFunnel(fake);

    for (const [name, value] of FUNNEL) {
      const browser = browserTracks().filter((t) => t.name === name);
      const server = capiEvents().filter((e) => e.event_name === name);
      expect(browser, name).toHaveLength(1);
      expect(server, name).toHaveLength(1);
      expect(server[0]?.event_id, name).toBe(browser[0]?.id);
      expect(server[0]?.action_source).toBe("website");
      expect(typeof server[0]?.event_time).toBe("number");
      expect(String(server[0]?.event_source_url)).toMatch(/^http:\/\/localhost:3000\//);
      if (value !== undefined) {
        const cd = server[0]?.custom_data as Record<string, unknown>;
        expect(cd.value, name).toBe(value);
        expect(cd.currency, name).toBe("EGP");
        expect(browser[0]?.params.value, name).toBe(value);
        expect(browser[0]?.params.currency, name).toBe("EGP");
      }
    }
    const purchase = capiEvents().find((e) => e.event_name === "Purchase");
    expect(purchase?.event_id).toBe(purchaseEventId(ORDER_ID));
    expect((purchase?.custom_data as Record<string, unknown>).order_id).toBe(ORDER_ID);
    const vc = capiEvents().find((e) => e.event_name === "ViewContent")?.custom_data as Record<string, unknown>;
    expect(vc).toMatchObject({
      content_ids: ["p-1"],
      contents: [{ id: "p-1", quantity: 1 }],
      content_type: "product",
      content_name: "Seamless Ring 8mm",
      content_category: "Rings",
      num_items: 1,
    });
    // Same logical events as tracking_event rows — one each.
    for (const n of [
      TrackingEventName.PAGE_VIEWED,
      TrackingEventName.PRODUCT_VIEWED,
      TrackingEventName.PRODUCT_ADDED_TO_CART,
      TrackingEventName.CHECKOUT_STARTED,
      TrackingEventName.CHECKOUT_COMPLETED,
    ]) {
      expect(rows(fake, n), n).toHaveLength(1);
    }
  });
});

describe("user_data (META_ADVANCED_MATCHING, default on)", () => {
  it("anonymous funnel: IP + UA + fbp + hashed external_id on every event; Purchase adds the order's hashed em/ph/fn/ln/ct/st/country", async () => {
    const fake = fakeDb({ orders: [placedOrder] });
    await runFunnel(fake);

    for (const e of capiEvents()) {
      const ud = e.user_data as Record<string, unknown>;
      expect(ud.client_ip_address, String(e.event_name)).toBe("127.0.0.1");
      expect(ud.client_user_agent).toBe(UA);
      expect(ud.fbp).toBe(FBP);
      expect(ud.external_id).toBe(EXTERNAL_ID);
      if (e.event_name !== "Purchase") {
        // Anonymous browsing: nothing the visitor did not give us.
        expect(Object.keys(ud).sort()).toEqual(["client_ip_address", "client_user_agent", "external_id", "fbp"]);
      }
    }
    const ud = capiEvents().find((e) => e.event_name === "Purchase")?.user_data as Record<string, unknown>;
    expect(ud).toMatchObject({
      em: sha("shopper.name@example.com"),
      ph: sha("201012345678"),
      fn: sha("mona"),
      ln: sha("hassan"),
      ct: sha("cairo"),
      st: sha("cairo"),
      country: sha("eg"),
      external_id: EXTERNAL_ID,
      fbp: FBP,
    });
    expect(ud.zp).toBeUndefined(); // empty postal code is omitted, not hashed
    expect(fake.orderLookups()).toBe(1);
  });

  it("browser pixel: ONE init, with the same hashed external_id CAPI sends (manual advanced matching)", async () => {
    const fake = fakeDb({ orders: [placedOrder] });
    await runFunnel(fake);
    expect(inits()).toHaveLength(1);
    expect(inits()[0]).toEqual(["init", META_ID, { external_id: EXTERNAL_ID }]);
  });

  it("signed-in shopper: browser init and every CAPI event carry the same hashed account em/ph/fn/ln", async () => {
    const account = { email: ACCOUNT_EMAIL, phone: ACCOUNT_PHONE, name: "Account Holder" };
    const fake = fakeDb({ orders: [placedOrder] });
    await runFunnel(fake, { session: { id: "u1", role: "user", ...account }, props: { metaCustomer: account } });

    const expected = {
      em: sha("account.holder@example.com"),
      ph: sha("201112223333"),
      fn: sha("account"),
      ln: sha("holder"),
    };
    expect(inits()).toHaveLength(1);
    expect(inits()[0]).toEqual(["init", META_ID, { ...expected, external_id: EXTERNAL_ID }]);
    for (const e of capiEvents().filter((x) => x.event_name !== "Purchase")) {
      expect(e.user_data, String(e.event_name)).toMatchObject({ ...expected, external_id: EXTERNAL_ID });
    }
    // The Purchase is matched on what was typed for THIS order.
    expect(capiEvents().find((e) => e.event_name === "Purchase")?.user_data).toMatchObject({
      em: sha("shopper.name@example.com"),
    });
  });

  it("no raw email / phone anywhere: CAPI body, tracking_event rows, delivery log, console, fbq, beacons", async () => {
    const account = { email: ACCOUNT_EMAIL, phone: ACCOUNT_PHONE, name: "Account Holder" };
    const fake = fakeDb({ orders: [placedOrder] });
    beacons = [];
    const sentBeacons: string[] = [];
    const origPush = beacons.push.bind(beacons);
    beacons.push = (...b: string[]) => {
      sentBeacons.push(...b);
      return origPush(...b);
    };
    await runFunnel(fake, { session: { id: "u1", role: "user", ...account }, props: { metaCustomer: account } });

    const haystacks = {
      capi: JSON.stringify(capiBatches),
      rows: JSON.stringify(fake.persisted),
      deliveries: JSON.stringify(fake.deliveries),
      console: consoleOutput.join("\n"),
      fbq: JSON.stringify(fbq.mock.calls),
      beacons: sentBeacons.join("\n"),
    };
    const needles = [
      "shopper.name@example.com",
      "Shopper.Name@Example.COM",
      "account.holder@example.com",
      ACCOUNT_EMAIL,
      "01012345678",
      "201012345678",
      "1012345678",
      "201112223333",
      "1112223333",
      "Mona",
    ];
    for (const [where, text] of Object.entries(haystacks)) {
      for (const needle of needles) expect(text.includes(needle), `${needle} in ${where}`).toBe(false);
    }
    // Hashes are relay-only: never written to tracking_event either.
    expect(haystacks.rows.includes(sha("shopper.name@example.com"))).toBe(false);
    expect(haystacks.rows.includes(EXTERNAL_ID)).toBe(false);
    expect(haystacks.rows.includes("metaUserData")).toBe(false);
  });

  it("replayed Purchase beacon (event_id already stored) → still relayed as before, but no customer data attached", async () => {
    const fake = fakeDb({ orders: [placedOrder], existingEventIds: [purchaseEventId(ORDER_ID)] });
    await runFunnel(fake);
    const ud = capiEvents().find((e) => e.event_name === "Purchase")?.user_data as Record<string, unknown>;
    expect(ud).toBeDefined();
    expect(ud.em).toBeUndefined();
    expect(ud.ph).toBeUndefined();
    expect(fake.orderLookups()).toBe(0);
  });

  it("Purchase whose order is not placed (pending online payment) → relayed unchanged, no customer data", async () => {
    const fake = fakeDb({ orders: [{ ...placedOrder, paymentMethod: "paymob", paymentStatus: "pending" }] });
    await runFunnel(fake);
    const p = capiEvents().find((e) => e.event_name === "Purchase");
    expect(p?.event_id).toBe(purchaseEventId(ORDER_ID));
    expect((p?.custom_data as Record<string, unknown>).value).toBe(270);
    expect((p?.user_data as Record<string, unknown>).em).toBeUndefined();
  });

  it("?fbclid= landing → first-party _fbc written before the first beacon and forwarded unhashed as fbc", async () => {
    const fake = fakeDb();
    await land("/?fbclid=IwAR0abc_DEF-123", fake);
    const fbc = cookieJar()._fbc;
    expect(fbc).toMatch(/^fb\.1\.\d{13}\.IwAR0abc_DEF-123$/);
    expect((capiPageViews()[0]?.user_data as Record<string, unknown>).fbc).toBe(fbc);
  });

  it("existing _fbc for the same click is preserved as is", async () => {
    document.cookie = "_fbc=fb.1.1700000000000.SameClick; path=/";
    const fake = fakeDb();
    await land("/?fbclid=SameClick", fake);
    expect(cookieJar()._fbc).toBe("fb.1.1700000000000.SameClick");
    expect((capiPageViews()[0]?.user_data as Record<string, unknown>).fbc).toBe("fb.1.1700000000000.SameClick");
  });

  it("first beacon waits for Meta's _fbp (written by fbevents.js) so the landing CAPI PageView carries it", async () => {
    clearCookies();
    loadDocument("/");
    render(provider());
    await waitFor(() => expect(browserPageViews()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 500));
    expect(beacons).toHaveLength(0); // held: no _fbp yet
    document.cookie = `_fbp=${FBP}; path=/`; // fbevents.js loaded
    await beaconFlushed();
    const fake = fakeDb();
    await deliver(fake);
    expect((capiPageViews()[0]?.user_data as Record<string, unknown>).fbp).toBe(FBP);
  });

  it("…but never longer than FBP_WAIT_MAX_MS: fbevents.js blocked → beacon still sent, without fbp", async () => {
    clearCookies();
    loadDocument("/");
    const started = Date.now();
    render(provider());
    await beaconFlushed();
    expect(Date.now() - started).toBeLessThan(2600);
    const fake = fakeDb();
    await deliver(fake);
    expect(capiPageViews()).toHaveLength(1);
    expect((capiPageViews()[0]?.user_data as Record<string, unknown>).fbp).toBeUndefined();
    expect((capiPageViews()[0]?.user_data as Record<string, unknown>).external_id).toBe(EXTERNAL_ID);
  });

  it("META_ADVANCED_MATCHING=off → previous behaviour exactly: 2-arg init, user_data = IP/UA/fbp/fbc only", async () => {
    process.env.META_ADVANCED_MATCHING = "off";
    document.cookie = "_fbc=fb.1.1700000000000.Click; path=/";
    const account = { email: ACCOUNT_EMAIL, phone: ACCOUNT_PHONE, name: "Account Holder" };
    const fake = fakeDb({ orders: [placedOrder] });
    await runFunnel(fake, {
      session: { id: "u1", role: "user", ...account },
      props: { metaAdvancedMatching: false, metaCustomer: account },
    });
    expect(inits()).toEqual([["init", META_ID]]);
    expect(capiEvents()).toHaveLength(5);
    for (const e of capiEvents()) {
      expect(Object.keys(e.user_data as object).sort()).toEqual(["client_ip_address", "client_user_agent", "fbc", "fbp"]);
    }
    expect(fake.orderLookups()).toBe(0);
  });
});

describe("GA4 regression (browser-only ownership is unchanged)", () => {
  it("GA4 ecommerce events are sent once each by the browser, none by the server (no MP mirror)", async () => {
    const fake = fakeDb({ orders: [placedOrder] });
    await runFunnel(fake);
    const names = ga4Events().map((e) => e.name);
    expect(names.filter((n) => n === "page_view")).toHaveLength(1);
    expect(names.filter((n) => n === "view_item")).toHaveLength(1);
    expect(names.filter((n) => n === "add_to_cart")).toHaveLength(1);
    expect(names.filter((n) => n === "begin_checkout")).toHaveLength(1);
    expect(names.filter((n) => n === "purchase")).toHaveLength(1);
    const purchase = ga4Events().find((e) => e.name === "purchase")?.params as Record<string, unknown>;
    expect(purchase).toMatchObject({ currency: "EGP", value: 270, transaction_id: ORDER_ID });
    // page_view carries no new parameters (UTMs etc. are not GA4 params).
    expect(ga4Events().find((e) => e.name === "page_view")?.params).toEqual({});
    expect(ga4MpHits).toBe(0);
    expect(fake.deliveries.every((d) => d.platform === "meta")).toBe(true);
  });
});
