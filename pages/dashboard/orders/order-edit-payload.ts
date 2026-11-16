/**
 * Turns the Edit Order panel's draft into the `order.edit` / `order.previewEdit`
 * input, sending ONLY what the admin changed.
 *
 * The editor used to send every field on every save, which had side effects
 * nobody asked for: each existing line's price snapshot was rewritten
 * (`discountPrice` flattened to null), the total was recomputed even for a
 * notes-only edit, and any order whose customer gave no email (allowed for
 * cash on delivery) failed validation on every save. A field the admin did
 * not touch is now simply absent, so the server leaves it exactly as stored —
 * payment method, shipping address and status can never change as a side
 * effect of adding a product.
 */

import type { SelectedOptions } from "#root/shared/products/options";
import { formatSelectedOptions } from "#root/shared/products/options";

export type OrderStatus = "pending" | "processing" | "shipped" | "delivered" | "cancelled";
export type PaymentMethod = "cod" | "stripe" | "paymob";
export type PaymentStatus = "not_required" | "pending" | "processing" | "paid" | "failed" | "refunded";

/** The stored order as the panel received it. */
export interface OriginalOrder {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: string;
  shippingCity: string;
  shippingState: string | null;
  shippingPostalCode: string | null;
  shippingCountry: string | null;
  shipping: string;
  tax?: string | null;
  discount: string | null;
  status: OrderStatus;
  notes: string | null;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  items: { id: string; quantity: number; price: string; discountPrice?: string | null }[];
}

export interface DraftLine {
  orderItemId: string;
  quantity: number;
  /** Unit price as typed. */
  unitPrice: string;
  removed: boolean;
}

export interface DraftAddition {
  productId: string;
  quantity: number;
  selectedOptions: SelectedOptions | null;
}

export interface OrderDraft {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: string;
  shippingCity: string;
  shippingState: string;
  shippingPostalCode: string;
  shippingCountry: string;
  items: DraftLine[];
  newItems: DraftAddition[];
  shipping: string;
  tax: string;
  discount: string;
  overrideTotal: boolean;
  total: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  notes: string;
}

export interface OrderEditPayload {
  items?: { orderItemId: string; quantity: number; price?: number; discountPrice?: null }[];
  newItems?: { productId: string; quantity: number; selectedOptions?: SelectedOptions }[];
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  shippingAddress?: string;
  shippingCity?: string;
  shippingState?: string;
  shippingPostalCode?: string;
  shippingCountry?: string;
  shipping?: number;
  tax?: number;
  discount?: number;
  total?: number;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  status?: OrderStatus;
  notes?: string | null;
}

export const parseAmount = (v: string | null | undefined): number => {
  const parsed = Number.parseFloat(v ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
};
const toMinor = (v: number) => Math.round(v * 100);
const sameAmount = (a: string | null | undefined, b: string | null | undefined) =>
  toMinor(parseAmount(a)) === toMinor(parseAmount(b));

/** What one unit of an existing line charges (the editor's long-standing rule). */
export function originalUnitPrice(item: { price: string; discountPrice?: string | null }): number {
  return parseAmount(item.discountPrice || item.price);
}

export function buildOrderEditPayload(original: OriginalOrder, draft: OrderDraft): OrderEditPayload {
  const payload: OrderEditPayload = {};
  const originalById = new Map(original.items.map((it) => [it.id, it]));

  const items: NonNullable<OrderEditPayload["items"]> = [];
  for (const line of draft.items) {
    const before = originalById.get(line.orderItemId);
    if (!before) continue;
    if (line.removed) {
      items.push({ orderItemId: line.orderItemId, quantity: 0 });
      continue;
    }
    const priceChanged = toMinor(parseAmount(line.unitPrice)) !== toMinor(originalUnitPrice(before));
    if (line.quantity === before.quantity && !priceChanged) continue;
    items.push({
      orderItemId: line.orderItemId,
      quantity: line.quantity,
      // Only an explicit price edit rewrites the line's price snapshot.
      ...(priceChanged ? { price: parseAmount(line.unitPrice), discountPrice: null } : {}),
    });
  }
  if (items.length > 0) payload.items = items;

  const newItems = draft.newItems
    .filter((it) => it.productId && it.quantity > 0)
    .map((it) => ({
      productId: it.productId,
      quantity: it.quantity,
      ...(it.selectedOptions && Object.keys(it.selectedOptions).length > 0 ? { selectedOptions: it.selectedOptions } : {}),
    }));
  if (newItems.length > 0) payload.newItems = newItems;

  const text = (key: keyof OriginalOrder & keyof OrderDraft & keyof OrderEditPayload) => {
    const before = (original[key] as string | null | undefined) ?? "";
    const after = draft[key] as string;
    if (after !== before) (payload as Record<string, unknown>)[key] = after;
  };
  text("customerName");
  text("customerEmail");
  text("customerPhone");
  text("shippingAddress");
  text("shippingCity");
  text("shippingState");
  text("shippingPostalCode");
  text("shippingCountry");

  if (!sameAmount(draft.shipping, original.shipping)) payload.shipping = parseAmount(draft.shipping);
  if (!sameAmount(draft.tax, original.tax)) payload.tax = parseAmount(draft.tax);
  if (!sameAmount(draft.discount, original.discount)) payload.discount = parseAmount(draft.discount);
  if (draft.overrideTotal) payload.total = parseAmount(draft.total);

  if (draft.paymentMethod !== original.paymentMethod) payload.paymentMethod = draft.paymentMethod;
  if (draft.paymentStatus !== original.paymentStatus) payload.paymentStatus = draft.paymentStatus;
  if (draft.status !== original.status) payload.status = draft.status;

  const notes = draft.notes.trim() === "" ? null : draft.notes;
  if (notes !== (original.notes && original.notes.trim() !== "" ? original.notes : null)) payload.notes = notes;

  return payload;
}

/** True when the payload would change any line or amount (so the total is recomputed). */
export function payloadChangesMoney(p: OrderEditPayload): boolean {
  return (
    p.items !== undefined ||
    p.newItems !== undefined ||
    p.shipping !== undefined ||
    p.tax !== undefined ||
    p.discount !== undefined ||
    p.total !== undefined
  );
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
const METHOD_LABEL: Record<PaymentMethod, string> = { cod: "Cash on Delivery", stripe: "Stripe", paymob: "Paymob" };

/**
 * Plain-language list of the non-line changes in a payload, for the review
 * step — so a status, payment or address change is never confirmed unseen.
 */
export function describeDetailChanges(original: OriginalOrder, p: OrderEditPayload): string[] {
  const out: string[] = [];
  if (p.customerName !== undefined || p.customerEmail !== undefined || p.customerPhone !== undefined) {
    out.push("Customer details updated");
  }
  if (
    p.shippingAddress !== undefined ||
    p.shippingCity !== undefined ||
    p.shippingState !== undefined ||
    p.shippingPostalCode !== undefined ||
    p.shippingCountry !== undefined
  ) {
    out.push("Shipping address updated");
  }
  if (p.status !== undefined) out.push(`Order status: ${STATUS_LABEL[original.status]} → ${STATUS_LABEL[p.status]}`);
  if (p.paymentMethod !== undefined) {
    out.push(`Payment method: ${METHOD_LABEL[original.paymentMethod]} → ${METHOD_LABEL[p.paymentMethod]}`);
  }
  if (p.paymentStatus !== undefined) out.push(`Payment status: ${original.paymentStatus} → ${p.paymentStatus}`);
  if (p.shipping !== undefined) out.push("Shipping fee changed manually");
  if (p.tax !== undefined) out.push("Tax changed manually");
  if (p.discount !== undefined) out.push("Discount changed manually");
  if (p.total !== undefined) out.push("Total overridden manually");
  if (p.notes !== undefined) out.push("Order notes updated");
  return out;
}

/** "Color: Gold" style label, or "" for a simple product. */
export const optionsLabel = (selected: SelectedOptions | null | undefined) => formatSelectedOptions(selected);
