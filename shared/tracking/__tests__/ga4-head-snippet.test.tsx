// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * GA4_CLIENT_ID_CONTINUITY — the SSR gtag bootstrap rendered by
 * pages/+Head.tsx, executed exactly as emitted. Checks the arguments of the
 * FIRST gtag("config") call for every cookie / storage combination.
 */
let pageContext: Record<string, unknown> = {};
vi.mock("vike-react/usePageContext", () => ({ usePageContext: () => pageContext }));

import HeadDefault from "#root/pages/+Head";
import { buildGa4HeadSnippet, GA4_CID_STORAGE_KEY } from "#root/shared/tracking/ga4-head-snippet";

const GA4_ID = "G-CONT1234";
type Win = Window & { dataLayer?: unknown[]; gtag?: unknown };
const w = window as unknown as Win;

function clearCookies() {
  for (const part of document.cookie.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

/** Render <head> for a storefront page and run its inline GA4 bootstrap. */
function runHead(flags: Record<string, unknown>, path = "/") {
  Reflect.deleteProperty(w, "dataLayer");
  Reflect.deleteProperty(w, "gtag");
  pageContext = { urlPathname: path, urlOriginal: path, activeGA4PixelId: path.startsWith("/dashboard") ? null : GA4_ID, trackingFlags: flags };
  const html = renderToStaticMarkup(<HeadDefault />);
  const holder = document.createElement("div");
  holder.innerHTML = html;
  for (const s of Array.from(holder.querySelectorAll("script"))) {
    if (!s.getAttribute("src") && s.textContent?.includes("gtag(")) new Function(s.textContent)();
  }
  return html;
}

const configCalls = () =>
  (w.dataLayer ?? []).map((e) => Array.from(e as ArrayLike<unknown>)).filter(([cmd]) => cmd === "config");

beforeEach(() => {
  clearCookies();
  localStorage.clear();
});
afterEach(() => {
  clearCookies();
  localStorage.clear();
  vi.restoreAllMocks();
});

const ON = { excludeDashboard: true, ga4ClientIdContinuity: true };

describe("SSR gtag bootstrap — GA4_CLIENT_ID_CONTINUITY on", () => {
  it("valid _ga present: client id saved to localStorage; config unchanged (no client_id)", () => {
    document.cookie = "_ga=GA1.1.1234567890.1731600000; path=/";
    runHead(ON);
    expect(localStorage.getItem(GA4_CID_STORAGE_KEY)).toBe("1234567890.1731600000");
    expect(configCalls()).toEqual([["config", GA4_ID, { send_page_view: false }]]);
  });

  it("valid _ga present and a DIFFERENT stored id: the cookie wins, storage updated, no client_id", () => {
    localStorage.setItem(GA4_CID_STORAGE_KEY, "111.222");
    document.cookie = "_ga=GA1.2.999.888; path=/";
    runHead(ON);
    expect(localStorage.getItem(GA4_CID_STORAGE_KEY)).toBe("999.888");
    expect(configCalls()).toEqual([["config", GA4_ID, { send_page_view: false }]]);
  });

  it("valid _ga present and the SAME stored id: storage not rewritten", () => {
    localStorage.setItem(GA4_CID_STORAGE_KEY, "999.888");
    document.cookie = "_ga=GA1.1.999.888; path=/";
    const set = vi.spyOn(Storage.prototype, "setItem");
    runHead(ON);
    expect(set).not.toHaveBeenCalled();
  });

  it("_ga absent + valid stored id: the FIRST config call carries it as client_id", () => {
    localStorage.setItem(GA4_CID_STORAGE_KEY, "1234567890.1731600000");
    runHead(ON);
    expect(configCalls()).toEqual([["config", GA4_ID, { send_page_view: false, client_id: "1234567890.1731600000" }]]);
  });

  it("_ga absent + nothing stored: no client_id is invented", () => {
    runHead(ON);
    expect(configCalls()).toEqual([["config", GA4_ID, { send_page_view: false }]]);
    expect(localStorage.getItem(GA4_CID_STORAGE_KEY)).toBeNull();
  });

  it("malformed stored ids are never used", () => {
    for (const bad of ["abc", "123", "1.2.3", "12a.34", " 1.2", "1.2 ", `${"9".repeat(21)}.1`, ""]) {
      localStorage.setItem(GA4_CID_STORAGE_KEY, bad);
      runHead(ON);
      expect(configCalls()).toEqual([["config", GA4_ID, { send_page_view: false }]]);
    }
  });

  it("malformed _ga cookie: not saved; a valid stored id is used instead (the cookie is not valid)", () => {
    document.cookie = "_ga=GA2.1.123.456; path=/";
    runHead(ON);
    expect(localStorage.getItem(GA4_CID_STORAGE_KEY)).toBeNull();
    localStorage.setItem(GA4_CID_STORAGE_KEY, "555.666");
    runHead(ON);
    expect(configCalls()).toEqual([["config", GA4_ID, { send_page_view: false, client_id: "555.666" }]]);
  });

  it("a _ga_<container> cookie is not mistaken for _ga", () => {
    document.cookie = "_ga_CONT1234=GS1.1.1731600000.1.0.1731600000.0.0.0; path=/";
    runHead(ON);
    expect(localStorage.getItem(GA4_CID_STORAGE_KEY)).toBeNull();
    expect(configCalls()).toEqual([["config", GA4_ID, { send_page_view: false }]]);
  });

  it("localStorage that throws: no error, config still sent exactly once with send_page_view:false", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    document.cookie = "_ga=GA1.1.1.2; path=/";
    expect(() => runHead(ON)).not.toThrow();
    expect(configCalls()).toEqual([["config", GA4_ID, { send_page_view: false }]]);
  });

  it("dashboard routes still get no GA4 tag at all", () => {
    const html = runHead(ON, "/dashboard/orders");
    expect(html).not.toContain("gtag(");
    expect(html).not.toContain("googletagmanager");
    expect(configCalls()).toEqual([]);
  });
});

describe("SSR gtag bootstrap — flag off / absent", () => {
  const PREVIOUS = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag("js",new Date());gtag("config","${GA4_ID}",{send_page_view:false});`;

  it("flag off → the previous snippet byte for byte, storage untouched", () => {
    expect(buildGa4HeadSnippet(GA4_ID, { clientIdContinuity: false })).toBe(PREVIOUS);
    localStorage.setItem(GA4_CID_STORAGE_KEY, "1.2");
    const html = runHead({ excludeDashboard: true, ga4ClientIdContinuity: false });
    expect(html).toContain(PREVIOUS);
    expect(configCalls()).toEqual([["config", GA4_ID, { send_page_view: false }]]);
  });

  it("flag missing from trackingFlags (older server) → previous snippet", () => {
    const html = runHead({ excludeDashboard: true });
    expect(html).toContain(PREVIOUS);
    expect(configCalls()).toEqual([["config", GA4_ID, { send_page_view: false }]]);
  });

  it("flag on: no automatic page_view — the only config call keeps send_page_view:false", () => {
    localStorage.setItem(GA4_CID_STORAGE_KEY, "1.2");
    runHead(ON);
    const calls = configCalls();
    expect(calls).toHaveLength(1);
    expect((calls[0]![2] as { send_page_view?: boolean }).send_page_view).toBe(false);
    expect((w.dataLayer ?? []).some((e) => Array.from(e as ArrayLike<unknown>)[1] === "page_view")).toBe(false);
  });
});
