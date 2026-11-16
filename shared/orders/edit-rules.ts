/**
 * Rules for adding catalogue products to an EXISTING order from the admin
 * Edit Order screen. Framework-free and shared: the server enforces them
 * inside the edit transaction, and the dashboard uses the same functions to
 * explain up front why "Add product" is unavailable and to show which added
 * product will fold into an existing line.
 *
 * ── Which orders accept new products ─────────────────────────────────────────
 *
 * Only an order that has not left the shop and whose money has not been
 * settled. Concretely, all of:
 *
 *   • status pending or processing — a shipped parcel is with the courier,
 *     and delivered / cancelled orders are finished (the ERP recognises
 *     revenue and stock movements at delivery);
 *   • Cash on Delivery — an online payment was taken (or a payment session
 *     opened) for the ORIGINAL amount, so adding goods would leave money
 *     owed that no flow collects;
 *   • its reserved stock has not been released (`stock_restored`), which
 *     happens when an order is cancelled — adding units to such an order
 *     would deduct stock that a later cancel would never give back;
 *   • not yet handed to a courier integration (Bosta delivery created, or a
 *     Fincart tracking number), whose COD amount was fixed at hand-off.
 *
 * Editing quantities, prices or details of existing lines is NOT governed by
 * these rules — that is the pre-existing full-control editor, unchanged.
 */

import {
  type SelectedOptions,
  selectedOptionsKey,
} from "#root/shared/products/options";

export type OrderStatusValue =
  | "pending"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

export interface AddProductEligibilityInput {
  status: OrderStatusValue;
  paymentMethod: "cod" | "stripe" | "paymob";
  stockRestored: boolean;
  bostaDeliveryId: string | null;
  fincartTrackingNumber: string | null;
}

export const ADDABLE_ORDER_STATUSES: readonly OrderStatusValue[] = ["pending", "processing"];

/**
 * Why products cannot be added to this order, in admin-facing words — or
 * null when they can.
 */
export function addProductBlockReason(o: AddProductEligibilityInput): string | null {
  if (!ADDABLE_ORDER_STATUSES.includes(o.status)) {
    return `Products can only be added to pending or processing orders — this order is ${o.status}.`;
  }
  if (o.paymentMethod !== "cod") {
    return "Products can only be added to Cash on Delivery orders — this order's online payment was made for the original amount.";
  }
  if (o.stockRestored) {
    return "This order's reserved stock has already been released, so products can't be added to it.";
  }
  if (o.bostaDeliveryId || o.fincartTrackingNumber) {
    return "This order has already been handed to the courier with its cash-on-delivery amount, so products can't be added to it.";
  }
  return null;
}

// ─── Merging an added product into an existing line ───────────────────────────

const toMinor = (amount: number): number => Math.round(amount * 100);

/**
 * What one unit of an EXISTING order line charges: its snapshotted sale
 * price when it has one, else its price. This is the rule the order editor
 * has always recomputed `order.subtotal` with, so it is the one that says
 * what the customer was billed. (Checkout only snapshots a valid sale price,
 * so for any line it wrote this equals the effective-price rule.)
 */
export function lineUnitCharge(price: number, discountPrice: number | null): number {
  return discountPrice ?? price;
}

/** The subset of an order line the merge rule looks at. */
export interface MergeableLine {
  id: string;
  productId: string;
  quantity: number;
  price: number;
  discountPrice: number | null;
  orderBundleId: string | null;
  selectedOptions: SelectedOptions | null;
  /** True when this edit removes the line; a removed line never absorbs units. */
  removed?: boolean;
}

export interface MergeCandidate {
  productId: string;
  selectedOptions: SelectedOptions | null;
  /** What one added unit will be charged (effective price incl. option modifiers). */
  unitPrice: number;
}

/**
 * The existing line an added product should fold into, or null for a new
 * line. A line qualifies only when it is the SAME sellable thing at the SAME
 * charge:
 *
 *   • a standalone line (never a bundle child — those are priced by their
 *     set's snapshot, and adding a loose unit must not join the set);
 *   • the same product and the same option configuration;
 *   • the same effective unit price. When the catalogue price has moved
 *     since the order was placed, merging would either charge the new units
 *     the old price or reprice what the customer already agreed to, so the
 *     addition becomes its own line instead.
 */
export function findMergeTarget<L extends MergeableLine>(
  lines: readonly L[],
  candidate: MergeCandidate,
): L | null {
  const wantedKey = selectedOptionsKey(candidate.selectedOptions);
  const wantedMinor = toMinor(candidate.unitPrice);
  for (const line of lines) {
    if (line.removed || line.quantity <= 0) continue;
    if (line.orderBundleId) continue;
    if (line.productId !== candidate.productId) continue;
    if (selectedOptionsKey(line.selectedOptions) !== wantedKey) continue;
    if (toMinor(lineUnitCharge(line.price, line.discountPrice)) !== wantedMinor) continue;
    return line;
  }
  return null;
}

// ─── Totals ───────────────────────────────────────────────────────────────────

/**
 * The order total from its parts — the same shape checkout stores
 * (shared/bundles/cart-pricing.ts): the discount never eats into shipping.
 */
export function orderTotalFromParts(parts: {
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
}): number {
  const goods = Math.max(0, toMinor(parts.subtotal) - toMinor(parts.discount));
  return (goods + toMinor(parts.shipping) + toMinor(parts.tax)) / 100;
}

/**
 * The editor's stale-summary refusal, shared so the dashboard can recognise
 * it, close the stale details and reload instead of showing a generic failure.
 */
export const ORDER_CHANGED_MESSAGE =
  "This order changed since you opened the editor, so nothing was saved. Open the order again to review the latest version.";
