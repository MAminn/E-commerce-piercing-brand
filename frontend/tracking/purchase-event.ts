import {
  TrackingEventName,
  type EcommerceEventData,
  type TrackingProductItem,
} from "#root/shared/types/pixel-tracking";

/**
 * The Purchase (`checkout_completed` → Meta `Purchase`) event.
 *
 * WHERE IT FIRES: /order-confirmation, once `payment.verify` has returned the
 * order row — i.e. only for an order the backend has created and persisted.
 * COD orders (`not_required`) and paid online orders (`paid`) fire; pending,
 * failed and unknown orders never do, and nothing fires on the Place order
 * click or on a failed / rejected checkout (the page is never reached).
 *
 * WHAT IT CARRIES: the order's persisted `total` as returned by
 * `payment.verify` (never the `?total=` in the URL), currency "EGP", the
 * order id as `transactionId`, and the persisted order lines `order.create`
 * returned — one Purchase per order, with bundle children listed as the
 * products they are inside that single event.
 *
 * DUPLICATES: one event id per order (`purchase-<orderId>`), so Meta collapses
 * the browser pixel and the Conversions API copy, and a re-fire from another
 * tab or device dedupes there too. Locally, a per-order marker in
 * localStorage (plus sessionStorage as a fallback) stops a refresh, a
 * re-render or a reopened confirmation link from emitting it again.
 */

export const purchaseEventId = (orderId: string) => `purchase-${orderId}`;

/**
 * The ISO 4217 code every order is charged in. A literal, deliberately: the
 * Purchase currency used to be STORE_CURRENCY, which is read from
 * VITE_CURRENCY / CURRENCY at BUILD time (documented as a "currency label")
 * and was passed to Meta verbatim — Meta rejects a Purchase whose currency is
 * not an exact code. Display formatting never feeds this.
 */
export const PURCHASE_CURRENCY = "EGP";

/** Written by checkout from the `order.create` response, read here once. */
export const purchaseItemsKey = (orderId: string) => `checkout_items:${orderId}`;
const trackedKey = (orderId: string) => `tracked_purchase:${orderId}`;
/** The marker the page used before this module — still honoured. */
const legacyTrackedKey = (orderId: string) => `tracked_checkout_completed:${orderId}`;

/** An order line as `order.create` returns it (the persisted `order_item` row). */
export interface PersistedOrderLine {
  productId: string;
  name: string;
  quantity: number;
  price: string | number;
}

/**
 * One tracking item per product: a product bought loose and again inside a
 * set is one content id with the summed quantity, so `num_items` equals the
 * number of pieces in the order.
 */
export function purchaseItemsFromOrderLines(lines: readonly PersistedOrderLine[]): TrackingProductItem[] {
  const byProduct = new Map<string, TrackingProductItem>();
  for (const line of lines) {
    if (!line.productId || !(line.quantity > 0)) continue;
    const existing = byProduct.get(line.productId);
    if (existing) {
      existing.quantity = (existing.quantity ?? 0) + line.quantity;
      continue;
    }
    const price = typeof line.price === "number" ? line.price : Number.parseFloat(line.price);
    byProduct.set(line.productId, {
      itemId: line.productId,
      itemName: line.name || line.productId,
      quantity: line.quantity,
      ...(Number.isFinite(price) ? { price } : {}),
    });
  }
  return [...byProduct.values()];
}

export function buildPurchaseEcommerce(input: {
  orderId: string;
  total: string | number;
  items?: TrackingProductItem[];
}): EcommerceEventData | null {
  const value = typeof input.total === "number" ? input.total : Number.parseFloat(input.total);
  // A Purchase without its value is worse than none: it would report revenue
  // as 0 and still burn the order's one event.
  if (!Number.isFinite(value) || value < 0) return null;
  return {
    currency: PURCHASE_CURRENCY,
    value,
    transactionId: input.orderId,
    ...(input.items && input.items.length > 0 ? { items: input.items } : {}),
  };
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const safeGet = (storage: StorageLike | null | undefined, key: string) => {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};
const safeSet = (storage: StorageLike | null | undefined, key: string, value: string) => {
  try {
    storage?.setItem(key, value);
  } catch {
    /* private mode / quota — the event id still dedupes at Meta */
  }
};
const safeRemove = (storage: StorageLike | null | undefined, key: string) => {
  try {
    storage?.removeItem(key);
  } catch {
    /* best-effort */
  }
};

export function savePurchaseItems(storage: StorageLike | null | undefined, orderId: string, lines: readonly PersistedOrderLine[]) {
  safeSet(storage, purchaseItemsKey(orderId), JSON.stringify(purchaseItemsFromOrderLines(lines)));
}

function readPurchaseItems(storage: StorageLike | null | undefined, orderId: string): TrackingProductItem[] | undefined {
  const raw = safeGet(storage, purchaseItemsKey(orderId));
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return undefined;
    return parsed.filter(
      (i): i is TrackingProductItem =>
        typeof i === "object" && i !== null && typeof i.itemId === "string" && typeof i.itemName === "string",
    );
  } catch {
    return undefined;
  }
}

export function hasTrackedPurchase(
  orderId: string,
  stores: { local?: StorageLike | null; session?: StorageLike | null },
): boolean {
  return Boolean(
    safeGet(stores.local, trackedKey(orderId)) ||
      safeGet(stores.session, trackedKey(orderId)) ||
      safeGet(stores.session, legacyTrackedKey(orderId)),
  );
}

export type PurchaseTrackFn = (
  eventName: TrackingEventName | string,
  data?: { ecommerce?: EcommerceEventData; eventId?: string },
) => void;

/**
 * Emit the order's Purchase unless it was already emitted. Call it only with
 * an order `payment.verify` confirmed as placed, and with that response's
 * `total`. Returns whether an event was emitted.
 */
export function trackPurchaseOnce(input: {
  orderId: string;
  total: string | number;
  trackEvent: PurchaseTrackFn;
  local?: StorageLike | null;
  session?: StorageLike | null;
}): boolean {
  const { orderId, local, session } = input;
  if (hasTrackedPurchase(orderId, { local, session })) return false;

  const ecommerce = buildPurchaseEcommerce({
    orderId,
    total: input.total,
    items: readPurchaseItems(session, orderId) ?? readPurchaseItems(local, orderId),
  });
  if (!ecommerce) return false;

  // Marked before emitting so a re-entrant render cannot slip a second one in.
  safeSet(local, trackedKey(orderId), "1");
  safeSet(session, trackedKey(orderId), "1");

  input.trackEvent(TrackingEventName.CHECKOUT_COMPLETED, {
    ecommerce,
    eventId: purchaseEventId(orderId),
  });

  safeRemove(session, purchaseItemsKey(orderId));
  safeRemove(local, purchaseItemsKey(orderId));
  return true;
}
