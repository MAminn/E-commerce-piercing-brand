import { describe, expect, it, vi } from "vitest";
import {
  aggregatePurchaseItems,
  buildPurchaseBody,
  GA4_PURCHASE_CURRENCY,
  validatePurchaseBody,
  type PurchaseConsentPolicy,
  type PurchaseContextInput,
} from "../payload";
import { sendPurchaseToGa4, type FetchLike } from "../transport";
import { backoffMs, MAX_ATTEMPTS } from "../worker";
import {
  PURCHASE_CURRENCY,
  purchaseItemsFromOrderLines,
} from "#root/frontend/tracking/purchase-event";

const ORDER_ID = "0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const NOW = new Date("2026-11-14T12:00:00Z");
const ctx: PurchaseContextInput = { gaClientId: "1234567890.1730000000", gaSessionId: "1731585600", consentAnalytics: null, consentMarketing: null };
const noConsent: PurchaseConsentPolicy = { consentRequired: false, consentCategory: null };
const lines = [
  { productId: "p1", name: "Hoop", quantity: 1, price: "150.00" },
  { productId: "p2", name: "Stud", quantity: 2, price: "75.50" },
  { productId: "p1", name: "Hoop — Set", quantity: 2, price: "150.00" },
];

describe("GA4 purchase payload", () => {
  it("is built from the order only: transaction_id = order UUID, value = order total, EGP", () => {
    const r = buildPurchaseBody({ order: { id: ORDER_ID, total: "651.00" }, lines, context: ctx, consentPolicy: noConsent, eligibleAt: NOW });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.body).toEqual({
      client_id: "1234567890.1730000000",
      timestamp_micros: NOW.getTime() * 1000,
      events: [
        {
          name: "purchase",
          params: {
            transaction_id: ORDER_ID,
            value: 651,
            currency: "EGP",
            items: [
              { item_id: "p1", item_name: "Hoop", quantity: 3, price: 150 },
              { item_id: "p2", item_name: "Stud", quantity: 2, price: 75.5 },
            ],
            session_id: "1731585600",
            engagement_time_msec: 1,
          },
        },
      ],
    });
    expect(validatePurchaseBody(r.body, NOW)).toEqual([]);
  });

  it("matches the browser purchase: same currency literal and item aggregation", () => {
    expect(GA4_PURCHASE_CURRENCY).toBe(PURCHASE_CURRENCY);
    const browser = purchaseItemsFromOrderLines(lines.map((l) => ({ ...l, productId: l.productId })));
    const server = aggregatePurchaseItems(lines);
    expect(server.map((i) => [i.item_id, i.item_name, i.quantity, i.price])).toEqual(
      browser.map((i) => [i.itemId, i.itemName, i.quantity, i.price]),
    );
  });

  it("carries no customer PII — only GA4's pseudonymous ids", () => {
    const r = buildPurchaseBody({ order: { id: ORDER_ID, total: 10 }, lines, context: ctx, consentPolicy: noConsent, eligibleAt: NOW });
    const json = JSON.stringify(r).toLowerCase();
    for (const key of ["email", "phone", "customer", "address", "city", "user_id", "user_data", "ip_override", "user_agent"]) {
      expect(json).not.toContain(key);
    }
    expect(Object.keys((r as { body: object }).body).sort()).toEqual(["client_id", "events", "timestamp_micros"]);
  });

  it("holds (never invents) when the shopper had no GA4 client id", () => {
    for (const context of [null, { ...ctx, gaClientId: null }]) {
      expect(buildPurchaseBody({ order: { id: ORDER_ID, total: 10 }, lines, context, consentPolicy: noConsent, eligibleAt: NOW })).toEqual({
        kind: "held",
        reason: "missing_client_id",
      });
    }
  });

  it("sends without session_id when only the session cookie is missing, and says so", () => {
    const r = buildPurchaseBody({ order: { id: ORDER_ID, total: 10 }, lines: [], context: { ...ctx, gaSessionId: null }, consentPolicy: noConsent, eligibleAt: NOW });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.missingSessionId).toBe(true);
    expect(r.body.events[0].params).toEqual({ transaction_id: ORDER_ID, value: 10, currency: "EGP" });
  });

  it("respects the GA4 row's consent setting", () => {
    const required: PurchaseConsentPolicy = { consentRequired: true, consentCategory: "analytics" };
    const build = (c: PurchaseContextInput, policy: PurchaseConsentPolicy = required) =>
      buildPurchaseBody({ order: { id: ORDER_ID, total: 10 }, lines: [], context: c, consentPolicy: policy, eligibleAt: NOW });
    expect(build(ctx)).toEqual({ kind: "held", reason: "consent_not_granted" }); // unknown
    expect(build({ ...ctx, consentAnalytics: false })).toEqual({ kind: "held", reason: "consent_not_granted" });
    expect(build({ ...ctx, consentAnalytics: true }).kind).toBe("ok");
    const marketing: PurchaseConsentPolicy = { consentRequired: true, consentCategory: "marketing" };
    expect(build({ ...ctx, consentAnalytics: true, consentMarketing: false }, marketing)).toEqual({ kind: "held", reason: "consent_not_granted" });
    // consent not required (today's production setting): unknown consent still sends
    expect(build(ctx, noConsent).kind).toBe("ok");
  });

  it("forwards an explicit marketing decision as GA4 consent signals", () => {
    const denied = buildPurchaseBody({ order: { id: ORDER_ID, total: 10 }, lines: [], context: { ...ctx, consentMarketing: false }, consentPolicy: noConsent, eligibleAt: NOW });
    expect(denied.kind === "ok" && denied.body.consent).toEqual({ ad_user_data: "DENIED", ad_personalization: "DENIED" });
    const granted = buildPurchaseBody({ order: { id: ORDER_ID, total: 10 }, lines: [], context: { ...ctx, consentMarketing: true }, consentPolicy: noConsent, eligibleAt: NOW });
    expect(granted.kind === "ok" && granted.body.consent).toEqual({ ad_user_data: "GRANTED", ad_personalization: "GRANTED" });
  });

  it("refuses an unusable order value", () => {
    expect(buildPurchaseBody({ order: { id: ORDER_ID, total: "abc" }, lines: [], context: ctx, consentPolicy: noConsent, eligibleAt: NOW })).toEqual({
      kind: "invalid",
      reason: "invalid_value",
    });
  });

  it("validation rejects what GA4 would silently drop", () => {
    const ok = buildPurchaseBody({ order: { id: ORDER_ID, total: 10 }, lines, context: ctx, consentPolicy: noConsent, eligibleAt: NOW });
    if (ok.kind !== "ok") throw new Error("expected ok");
    const body = ok.body;
    // biome-ignore lint/suspicious/noExplicitAny: deliberately malformed bodies
    const mutate = (fn: (b: any) => void) => {
      const b = structuredClone(body);
      fn(b);
      return validatePurchaseBody(b, NOW);
    };
    expect(mutate((b) => { b.client_id = "abc"; })).toContain("client_id");
    expect(mutate((b) => { b.timestamp_micros = (NOW.getTime() - 72 * 3600_000) * 1000; })).toContain("timestamp_too_old");
    expect(mutate((b) => { b.timestamp_micros = (NOW.getTime() + 3600_000) * 1000; })).toContain("timestamp_in_future");
    expect(mutate((b) => { b.events[0].name = "Purchase"; })).toContain("event_name");
    expect(mutate((b) => { b.events[0].params.currency = "egp"; })).toContain("currency");
    expect(mutate((b) => { b.events[0].params.transaction_id = ""; })).toContain("transaction_id");
    expect(mutate((b) => { b.events[0].params.value = -1; })).toContain("value");
    expect(mutate((b) => { b.events[0].params.items[0].quantity = 0; })).toContain("item_quantity");
    expect(mutate((b) => b.events.push(b.events[0]))).toContain("events");
    expect(validatePurchaseBody(null, NOW)).toEqual(["body_not_object"]);
  });
});

describe("Measurement Protocol transport", () => {
  const cfg = { measurementId: "G-TEST1234", apiSecret: "s3cr3t-value" };
  const body = { client_id: "1.2", events: [] };
  const respond = (status: number): FetchLike => vi.fn(async () => ({ status, ok: status >= 200 && status < 300 }));

  it("posts JSON to /mp/collect with measurement_id and api_secret", async () => {
    const fetchImpl = vi.fn(async () => ({ status: 204, ok: true }));
    expect(await sendPurchaseToGa4(body, cfg, { fetchImpl })).toEqual({ kind: "sent", statusCode: 204 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, { method: string; body: string; headers: Record<string, string> }];
    expect(url).toBe("https://www.google-analytics.com/mp/collect?measurement_id=G-TEST1234&api_secret=s3cr3t-value");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual(body);
  });

  it("classifies responses for the outbox", async () => {
    expect(await sendPurchaseToGa4(body, cfg, { fetchImpl: respond(200) })).toMatchObject({ kind: "sent" });
    expect(await sendPurchaseToGa4(body, cfg, { fetchImpl: respond(429) })).toMatchObject({ kind: "retry", statusCode: 429 });
    expect(await sendPurchaseToGa4(body, cfg, { fetchImpl: respond(503) })).toMatchObject({ kind: "retry", statusCode: 503 });
    expect(await sendPurchaseToGa4(body, cfg, { fetchImpl: respond(400) })).toMatchObject({ kind: "permanent", statusCode: 400 });
    expect(await sendPurchaseToGa4(body, cfg, { fetchImpl: respond(403) })).toMatchObject({ kind: "permanent", statusCode: 403 });
  });

  it("a timeout is ambiguous (GA4 may have the event)", async () => {
    const hang: FetchLike = (_url, init) =>
      new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))));
    expect(await sendPurchaseToGa4(body, cfg, { fetchImpl: hang, timeoutMs: 20 })).toEqual({ kind: "ambiguous", error: "timeout" });
  });

  it("a connection that never reached Google is a plain retry; a dropped one is ambiguous", async () => {
    const fail = (code: string): FetchLike => async () => {
      throw Object.assign(new TypeError("fetch failed"), { cause: { code } });
    };
    expect(await sendPurchaseToGa4(body, cfg, { fetchImpl: fail("ECONNREFUSED") })).toEqual({ kind: "retry", error: "network_ECONNREFUSED" });
    expect(await sendPurchaseToGa4(body, cfg, { fetchImpl: fail("ENOTFOUND") })).toEqual({ kind: "retry", error: "network_ENOTFOUND" });
    expect(await sendPurchaseToGa4(body, cfg, { fetchImpl: fail("ECONNRESET") })).toMatchObject({ kind: "ambiguous" });
  });

  it("never returns the api_secret in an error", async () => {
    const leaky: FetchLike = async (url) => {
      throw new Error(`request to ${url} failed`);
    };
    const r = await sendPurchaseToGa4(body, cfg, { fetchImpl: leaky });
    expect(JSON.stringify(r)).not.toContain(cfg.apiSecret);
  });
});

describe("retry schedule", () => {
  it("backs off exponentially from 30 s, capped at 1 h, within GA4's 72 h window", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(backoffMs)).toEqual([30e3, 60e3, 120e3, 240e3, 480e3, 960e3, 1920e3, 3600e3]);
    const total = Array.from({ length: MAX_ATTEMPTS - 1 }, (_, i) => backoffMs(i + 1)).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThan(6 * 3600e3);
  });
});
