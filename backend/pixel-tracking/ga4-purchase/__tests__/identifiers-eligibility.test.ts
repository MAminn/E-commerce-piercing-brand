import { describe, expect, it } from "vitest";
import {
  gaSessionCookieName,
  parseGaClientId,
  parseGaSessionCookie,
  pickGa4PurchaseCookies,
  readConsentSnapshot,
  readGa4Identifiers,
} from "../identifiers";
import { isPurchaseMilestone } from "../eligibility";

describe("GA4 identifiers from first-party cookies", () => {
  it("reads the client id exactly as gtag.js writes _ga", () => {
    expect(parseGaClientId("GA1.1.1234567890.1730000000")).toBe("1234567890.1730000000");
    expect(parseGaClientId("GA1.2.987.654")).toBe("987.654");
  });

  it("never repairs or invents a client id", () => {
    for (const bad of [undefined, null, "", "GA1.1.abc.123", "GA1.1.123", "GA2.1.1.2.3", "1234567890.1730000000", "GA1.1.1.2.3"]) {
      expect(parseGaClientId(bad as string | undefined)).toBeNull();
    }
  });

  it("reads the session id from both _ga_<container> formats", () => {
    expect(parseGaSessionCookie("GS1.1.1731600000.3.1.1731600500.0.0.0")).toEqual({ sessionId: "1731600000", sessionNumber: 3 });
    expect(parseGaSessionCookie("GS2.1.s1731600000$o7$g1$t1731600500$j60$l0$h0")).toEqual({ sessionId: "1731600000", sessionNumber: 7 });
    expect(parseGaSessionCookie("GS2.1.o7$g1")).toBeNull();
    expect(parseGaSessionCookie("garbage")).toBeNull();
  });

  it("uses only the session cookie of the store's measurement id", () => {
    expect(gaSessionCookieName("G-ABC123XYZ")).toBe("_ga_ABC123XYZ");
    expect(gaSessionCookieName("UA-1-1")).toBeNull();
    const cookies = {
      _ga: "GA1.1.111.222",
      _ga_ABC123XYZ: "GS1.1.1731600000.3.1.1731600500.0.0.0",
      _ga_OTHER1: "GS1.1.999.1.1.1.0.0.0",
    };
    expect(readGa4Identifiers(cookies, "G-ABC123XYZ")).toEqual({ clientId: "111.222", sessionId: "1731600000", sessionNumber: 3 });
    expect(readGa4Identifiers(cookies, "G-NOTSET1")).toEqual({ clientId: "111.222", sessionId: null, sessionNumber: null });
  });

  it("keeps no session without its client id", () => {
    expect(readGa4Identifiers({ _ga_ABC123XYZ: "GS1.1.1731600000.3.1.1.0.0.0" }, "G-ABC123XYZ")).toEqual({
      clientId: null,
      sessionId: null,
      sessionNumber: null,
    });
  });

  it("passes only _ga, _ga_<id> and _tracking_consent to the order request context", () => {
    expect(
      pickGa4PurchaseCookies({
        _ga: "GA1.1.1.2",
        _ga_ABC123: "GS1.1.1.1.1.1.0.0.0",
        _tracking_consent: "{}",
        session_token: "secret",
        _fbp: "fb.1.2.3",
        "minimal-locale": "en",
      }),
    ).toEqual({ _ga: "GA1.1.1.2", _ga_ABC123: "GS1.1.1.1.1.1.0.0.0", _tracking_consent: "{}" });
    expect(pickGa4PurchaseCookies(undefined)).toEqual({});
  });

  it("reads only an explicit, unexpired consent decision", () => {
    const now = new Date("2026-11-14T12:00:00Z");
    const future = now.getTime() + 1000;
    expect(readConsentSnapshot({}, now)).toEqual({ analytics: null, marketing: null });
    expect(readConsentSnapshot({ _tracking_consent: JSON.stringify({ g: 1, a: 1, m: 0, ex: future }) }, now)).toEqual({
      analytics: true,
      marketing: false,
    });
    expect(
      readConsentSnapshot({ _tracking_consent: encodeURIComponent(JSON.stringify({ g: 1, a: 0, m: 0, ex: future })) }, now),
    ).toEqual({ analytics: false, marketing: false });
    // implied default (no choice made) and expired choices are "unknown"
    expect(readConsentSnapshot({ _tracking_consent: JSON.stringify({ g: 0, a: 0, m: 0 }) }, now)).toEqual({ analytics: null, marketing: null });
    expect(readConsentSnapshot({ _tracking_consent: JSON.stringify({ g: 1, a: 1, m: 1, ex: now.getTime() - 1 }) }, now)).toEqual({
      analytics: null,
      marketing: null,
    });
    expect(readConsentSnapshot({ _tracking_consent: "not json" }, now)).toEqual({ analytics: null, marketing: null });
  });
});

describe("purchase milestones", () => {
  const cod = { paymentMethod: "cod", paymentStatus: "not_required", status: "pending" };
  const pending = { paymentMethod: "paymob", paymentStatus: "pending", status: "pending" };
  const paid = { paymentMethod: "paymob", paymentStatus: "paid", status: "processing" };

  it("COD is a purchase at creation, and only at creation", () => {
    expect(isPurchaseMilestone("order_create", null, cod)).toBe(true);
    expect(isPurchaseMilestone("admin_edit", cod, { ...cod, status: "processing" })).toBe(false);
    expect(isPurchaseMilestone("admin_edit", cod, { ...cod, paymentStatus: "paid" })).toBe(false);
    expect(isPurchaseMilestone("order_create", null, { ...cod, status: "cancelled" })).toBe(false);
  });

  it("an online order is not a purchase at creation", () => {
    expect(isPurchaseMilestone("order_create", null, pending)).toBe(false);
    expect(isPurchaseMilestone("order_create", null, { ...pending, paymentMethod: "stripe" })).toBe(false);
  });

  it("an online order becomes a purchase on its transition to paid", () => {
    for (const source of ["payment_confirmed", "stripe_webhook", "admin_edit"] as const) {
      expect(isPurchaseMilestone(source, pending, paid)).toBe(true);
      expect(isPurchaseMilestone(source, { ...pending, paymentStatus: "processing" }, paid)).toBe(true);
    }
  });

  it("repeated callbacks, failures, refunds and cancellations never enqueue", () => {
    expect(isPurchaseMilestone("payment_confirmed", paid, paid)).toBe(false);
    expect(isPurchaseMilestone("payment_confirmed", pending, { ...pending, paymentStatus: "failed" })).toBe(false);
    expect(isPurchaseMilestone("payment_confirmed", pending, { ...pending, paymentStatus: "processing" })).toBe(false);
    expect(isPurchaseMilestone("stripe_webhook", paid, { ...paid, paymentStatus: "refunded" })).toBe(false);
    expect(isPurchaseMilestone("admin_edit", pending, { ...paid, status: "cancelled" })).toBe(false);
    expect(isPurchaseMilestone("payment_confirmed", null, paid)).toBe(false);
  });
});
