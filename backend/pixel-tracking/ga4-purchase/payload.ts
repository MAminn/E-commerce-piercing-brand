/**
 * The GA4 Measurement Protocol `purchase` body — built ONLY from the
 * persisted order, its lines and the captured GA4 context. Pure.
 *
 * Parity with the browser purchase (frontend/tracking/purchase-event.ts):
 * same transaction_id (the order UUID), same value (order.total), same
 * currency literal, same item aggregation (one item per product, summed
 * quantity, the line's stored price). No customer PII: the only identifiers
 * are GA4's own pseudonymous client_id / session_id.
 */

/** Must equal frontend/tracking/purchase-event.ts PURCHASE_CURRENCY (test-enforced). */
export const GA4_PURCHASE_CURRENCY = "EGP";

/** GA4 accepts timestamp_micros up to 72 h in the past; keep a margin. */
export const GA4_MAX_EVENT_AGE_MS = 71 * 60 * 60 * 1000;

export interface PurchaseOrderInput {
  id: string;
  total: string | number;
}

export interface PurchaseLineInput {
  productId: string | null;
  name: string | null;
  quantity: number;
  price: string | number;
}

export interface PurchaseContextInput {
  gaClientId: string | null;
  gaSessionId: string | null;
  consentAnalytics: boolean | null;
  consentMarketing: boolean | null;
}

export interface PurchaseConsentPolicy {
  consentRequired: boolean;
  consentCategory: string | null;
}

export interface Ga4MpItem {
  item_id: string;
  item_name: string;
  quantity: number;
  price?: number;
}

export interface Ga4MpPurchaseBody {
  client_id: string;
  timestamp_micros: number;
  consent?: { ad_user_data: "GRANTED" | "DENIED"; ad_personalization: "GRANTED" | "DENIED" };
  events: [
    {
      name: "purchase";
      params: {
        transaction_id: string;
        value: number;
        currency: string;
        items?: Ga4MpItem[];
        session_id?: string;
        engagement_time_msec?: number;
      };
    },
  ];
}

export type BuildResult =
  | { kind: "ok"; body: Ga4MpPurchaseBody; missingSessionId: boolean }
  | { kind: "held"; reason: "missing_client_id" | "consent_not_granted" }
  | { kind: "invalid"; reason: string };

export function aggregatePurchaseItems(lines: readonly PurchaseLineInput[]): Ga4MpItem[] {
  const byProduct = new Map<string, Ga4MpItem>();
  for (const line of lines) {
    if (!line.productId || !(line.quantity > 0)) continue;
    const existing = byProduct.get(line.productId);
    if (existing) {
      existing.quantity += line.quantity;
      continue;
    }
    const price = typeof line.price === "number" ? line.price : Number.parseFloat(line.price);
    byProduct.set(line.productId, {
      item_id: line.productId,
      item_name: (line.name || line.productId).slice(0, 100),
      quantity: line.quantity,
      ...(Number.isFinite(price) ? { price } : {}),
    });
  }
  return [...byProduct.values()];
}

function consentGranted(policy: PurchaseConsentPolicy, ctx: PurchaseContextInput | null): boolean {
  if (!policy.consentRequired) return true;
  const category = policy.consentCategory === "marketing" ? "marketing" : "analytics";
  return (category === "marketing" ? ctx?.consentMarketing : ctx?.consentAnalytics) === true;
}

export function buildPurchaseBody(input: {
  order: PurchaseOrderInput;
  lines: readonly PurchaseLineInput[];
  context: PurchaseContextInput | null;
  consentPolicy: PurchaseConsentPolicy;
  eligibleAt: Date;
}): BuildResult {
  const { order, context } = input;
  if (!consentGranted(input.consentPolicy, context)) return { kind: "held", reason: "consent_not_granted" };
  // Never invented: without the shopper's own GA4 client id the purchase is
  // held for an owner decision instead of being attributed to a fake user.
  if (!context?.gaClientId) return { kind: "held", reason: "missing_client_id" };

  const value = typeof order.total === "number" ? order.total : Number.parseFloat(order.total);
  if (!Number.isFinite(value) || value < 0) return { kind: "invalid", reason: "invalid_value" };

  const items = aggregatePurchaseItems(input.lines);
  const params: Ga4MpPurchaseBody["events"][0]["params"] = {
    transaction_id: order.id,
    value,
    currency: GA4_PURCHASE_CURRENCY,
    ...(items.length > 0 ? { items } : {}),
    ...(context.gaSessionId ? { session_id: context.gaSessionId, engagement_time_msec: 1 } : {}),
  };
  const body: Ga4MpPurchaseBody = {
    client_id: context.gaClientId,
    timestamp_micros: input.eligibleAt.getTime() * 1000,
    events: [{ name: "purchase", params }],
  };
  // Only an explicit marketing decision is forwarded; none = GA4 defaults.
  if (context.consentMarketing !== null) {
    const v = context.consentMarketing ? "GRANTED" : "DENIED";
    body.consent = { ad_user_data: v, ad_personalization: v };
  }
  return { kind: "ok", body, missingSessionId: !context.gaSessionId };
}

/**
 * Local validation against GA4 Measurement Protocol limits. /mp/collect
 * answers 2xx even for a malformed body, so this is the delivery gate: a
 * body that fails here is never sent.
 */
export function validatePurchaseBody(body: unknown, now: Date): string[] {
  const errors: string[] = [];
  const b = body as Partial<Ga4MpPurchaseBody> | null;
  if (!b || typeof b !== "object") return ["body_not_object"];
  if (typeof b.client_id !== "string" || !/^\d{1,20}\.\d{1,20}$/.test(b.client_id)) errors.push("client_id");
  if (typeof b.timestamp_micros !== "number" || !Number.isInteger(b.timestamp_micros)) {
    errors.push("timestamp_micros");
  } else {
    const ageMs = now.getTime() - b.timestamp_micros / 1000;
    if (ageMs > GA4_MAX_EVENT_AGE_MS) errors.push("timestamp_too_old");
    if (ageMs < -15 * 60 * 1000) errors.push("timestamp_in_future");
  }
  if (!Array.isArray(b.events) || b.events.length !== 1) return [...errors, "events"];
  const event = b.events[0];
  if (event?.name !== "purchase") errors.push("event_name");
  const p = event?.params;
  if (!p || typeof p !== "object") return [...errors, "params"];
  if (Object.keys(p).length > 25) errors.push("too_many_params");
  if (typeof p.transaction_id !== "string" || p.transaction_id.length === 0 || p.transaction_id.length > 100) {
    errors.push("transaction_id");
  }
  if (typeof p.value !== "number" || !Number.isFinite(p.value) || p.value < 0) errors.push("value");
  if (typeof p.currency !== "string" || !/^[A-Z]{3}$/.test(p.currency)) errors.push("currency");
  if (p.session_id !== undefined && !/^\d{1,20}$/.test(String(p.session_id))) errors.push("session_id");
  if (p.items !== undefined) {
    if (!Array.isArray(p.items) || p.items.length > 200) {
      errors.push("items");
    } else {
      for (const item of p.items) {
        if (!item?.item_id && !item?.item_name) errors.push("item_id");
        if (!Number.isInteger(item?.quantity) || item.quantity <= 0) errors.push("item_quantity");
        if (item?.price !== undefined && !Number.isFinite(item.price)) errors.push("item_price");
      }
    }
  }
  return [...new Set(errors)];
}
