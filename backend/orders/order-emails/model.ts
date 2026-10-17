/**
 * Order email model — pure, no I/O.
 *
 * Turns a persisted order (row + lines + Set snapshots) into exactly what the
 * customer confirmation and the admin notification print. All money is
 * handled in integer piasters, and the totals are DERIVED from the stored
 * order figures so the printed block always reconciles:
 *
 *     subtotal − discount + shipping = total
 *
 * How the stored figures map onto the printed ones:
 *
 *   • `order.subtotal` is the regular value of every line, Set children
 *     included at their regular price; `order.discount` is Set savings +
 *     automatic offers + promo code (backend/orders/create-order).
 *   • A Set is printed as ONE line at the price the customer pays for it, so
 *     its savings are already inside that line. The printed subtotal is
 *     therefore `order.subtotal − Set savings`, and the printed discount is
 *     the rest: offers + promo code.
 *   • The printed discount is `subtotal + shipping − total`, not a copy of
 *     `order.discount`, so a row edited after the fact can never print three
 *     numbers that do not add up. A disagreement is surfaced in `warnings`
 *     for the caller to log. Should the stored total ever EXCEED subtotal +
 *     shipping, the gap is shown as an explicit adjustment, never hidden.
 */

import {
  groupOrderLines,
  type OrderBundleSnapshot,
} from "#root/shared/bundles/order-grouping";
import { fromMinorUnits, toMinorUnits } from "#root/shared/bundles/evaluate";
import { formatSelectedOptions } from "#root/shared/products/options";
import { effectiveUnitPrice } from "#root/shared/pricing/effective-price";
import { getGovernorate } from "#root/shared/shipping/egypt-governorates";
import { formatOrderNumber } from "#root/shared/orders/order-number";

export type OrderEmailPaymentMethod = "cod" | "stripe" | "paymob";

export interface OrderEmailItemInput {
  id: string;
  /** The snapshotted line name — may carry an options suffix and, for Set children, " — <Set title>". */
  name: string;
  quantity: number;
  price: string;
  discountPrice: string | null;
  selectedOptions: Record<string, string> | null;
  orderBundleId: string | null;
  /** Absolute image URL, when the product still has one. */
  imageUrl?: string | null;
}

export interface OrderEmailInput {
  orderId: string;
  orderNumber: number | null;
  createdAt: Date;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: string;
  shippingCity: string;
  /** Governorate display name (`order.shipping_state`). */
  shippingState: string;
  shippingGovernorateCode: string | null;
  shippingCountry: string;
  subtotal: string;
  shipping: string;
  discount: string | null;
  total: string;
  paymentMethod: OrderEmailPaymentMethod;
  paymentStatus: string;
  /** The promo code text the customer entered, when one was applied. */
  promoCode: string | null;
  notes: string | null;
  items: OrderEmailItemInput[];
  bundles: OrderBundleSnapshot[];
}

export interface OrderEmailOption {
  name: string;
  value: string;
}

export interface OrderEmailChild {
  /** Stable render key (the order item id). */
  key: string;
  name: string;
  options: OrderEmailOption[];
  quantity: number;
  imageUrl?: string;
}

export interface OrderEmailLine {
  /** Stable render key: the order item id, or the Set snapshot id. */
  key: string;
  kind: "item" | "set";
  name: string;
  options: OrderEmailOption[];
  quantity: number;
  /** What one unit costs the customer. For a Set: the Set price. */
  unitPriceMinor: number;
  /** The regular price, only when it is higher (sale price or Set). */
  regularUnitPriceMinor?: number;
  lineTotalMinor: number;
  imageUrl?: string;
  /** A Set's pieces. */
  children: OrderEmailChild[];
}

export interface OrderEmailTotals {
  subtotalMinor: number;
  discountMinor: number;
  /** Non-zero only for an inconsistent stored row; see the module comment. */
  adjustmentMinor: number;
  shippingMinor: number;
  totalMinor: number;
}

export interface OrderEmailModel {
  orderId: string;
  /** "#10001" — empty only for a row without a number. */
  orderNumber: string;
  createdAt: Date;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  delivery: {
    address: string;
    city: string;
    governorateEn: string;
    governorateAr: string;
    country: string;
  };
  lines: OrderEmailLine[];
  totals: OrderEmailTotals;
  promoCode: string | null;
  payment: {
    method: OrderEmailPaymentMethod;
    isCashOnDelivery: boolean;
    isPaid: boolean;
  };
  notes: string | null;
  /** Data disagreements worth logging; never shown to the customer. */
  warnings: string[];
}

function minor(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? toMinorUnits(n) : 0;
}

function optionsOf(selected: Record<string, string> | null): OrderEmailOption[] {
  if (!selected) return [];
  return Object.entries(selected)
    .filter(([, v]) => typeof v === "string" && v.trim() !== "")
    .map(([name, value]) => ({ name, value }));
}

/**
 * The line name without what the email prints separately: the options
 * suffix written at checkout ("Star Labret (Color: Gold)") and, for a Set
 * child, the " — <Set title>" suffix. Anything that doesn't match exactly is
 * left as stored — the snapshot is never guessed at.
 */
export function baseLineName(
  name: string,
  selected: Record<string, string> | null,
  setTitle?: string,
): string {
  let base = name;
  if (setTitle) {
    const suffix = ` — ${setTitle}`;
    if (base.endsWith(suffix)) base = base.slice(0, -suffix.length);
  }
  const label = formatSelectedOptions(selected);
  if (label) {
    const suffix = ` (${label})`;
    if (base.endsWith(suffix)) base = base.slice(0, -suffix.length);
  }
  return base.trim() || name;
}

function itemLine(item: OrderEmailItemInput): OrderEmailLine {
  const regular = Number(item.price);
  const sale = item.discountPrice === null ? null : Number(item.discountPrice);
  const unitMinor = toMinorUnits(effectiveUnitPrice(regular, sale));
  const regularMinor = toMinorUnits(regular);
  return {
    key: item.id,
    kind: "item",
    name: baseLineName(item.name, item.selectedOptions),
    options: optionsOf(item.selectedOptions),
    quantity: item.quantity,
    unitPriceMinor: unitMinor,
    regularUnitPriceMinor: regularMinor > unitMinor ? regularMinor : undefined,
    lineTotalMinor: unitMinor * item.quantity,
    imageUrl: item.imageUrl ?? undefined,
    children: [],
  };
}

export function buildOrderEmailModel(input: OrderEmailInput): OrderEmailModel {
  const warnings: string[] = [];
  const groups = groupOrderLines(input.items, input.bundles);

  let setSavingsMinor = 0;
  const lines: OrderEmailLine[] = groups.map((group) => {
    if (group.kind === "item") return itemLine(group.item);
    const chargedMinor = toMinorUnits(group.bundleTotal);
    const regularMinor = toMinorUnits(group.regularTotal);
    setSavingsMinor += regularMinor - chargedMinor;
    return {
      key: group.bundle.id,
      kind: "set",
      name: group.bundle.campaignTitle,
      options: [],
      quantity: 1,
      unitPriceMinor: chargedMinor,
      regularUnitPriceMinor: regularMinor > chargedMinor ? regularMinor : undefined,
      lineTotalMinor: chargedMinor,
      imageUrl: group.items.find((i) => i.imageUrl)?.imageUrl ?? undefined,
      children: group.items.map((child) => ({
        key: child.id,
        name: baseLineName(child.name, child.selectedOptions, group.bundle.campaignTitle),
        options: optionsOf(child.selectedOptions),
        quantity: child.quantity,
        imageUrl: child.imageUrl ?? undefined,
      })),
    };
  });

  const storedSubtotal = minor(input.subtotal);
  const shippingMinor = minor(input.shipping);
  const totalMinor = minor(input.total);

  const subtotalMinor = storedSubtotal - setSavingsMinor;
  // subtotal − discount + adjustment + shipping = total, by construction.
  const gap = subtotalMinor + shippingMinor - totalMinor;
  const discountMinor = Math.max(0, gap);
  const adjustmentMinor = Math.max(0, -gap);

  const storedDiscount = minor(input.discount);
  if (storedDiscount !== discountMinor + setSavingsMinor - adjustmentMinor) {
    warnings.push(
      `order.discount ${fromMinorUnits(storedDiscount)} does not match subtotal + shipping − total (${fromMinorUnits(gap + setSavingsMinor)})`,
    );
  }
  if (adjustmentMinor > 0) {
    warnings.push(`order total exceeds subtotal + shipping by ${fromMinorUnits(adjustmentMinor)}`);
  }
  const linesMinor = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
  if (linesMinor !== subtotalMinor) {
    warnings.push(
      `line totals ${fromMinorUnits(linesMinor)} differ from the order subtotal ${fromMinorUnits(subtotalMinor)}`,
    );
  }

  const governorate = input.shippingGovernorateCode
    ? getGovernorate(input.shippingGovernorateCode)
    : undefined;
  const governorateEn = governorate?.nameEn ?? input.shippingState;

  return {
    orderId: input.orderId,
    orderNumber: formatOrderNumber(input.orderNumber),
    createdAt: input.createdAt,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,
    delivery: {
      address: input.shippingAddress,
      city: input.shippingCity,
      governorateEn,
      governorateAr: governorate?.nameAr ?? governorateEn,
      country: input.shippingCountry,
    },
    lines,
    totals: {
      subtotalMinor,
      discountMinor,
      adjustmentMinor,
      shippingMinor,
      totalMinor,
    },
    promoCode: input.promoCode,
    payment: {
      method: input.paymentMethod,
      isCashOnDelivery: input.paymentMethod === "cod",
      isPaid: input.paymentStatus === "paid",
    },
    notes: input.notes,
    warnings,
  };
}

/** The reconciliation the email promises, as a predicate for tests and guards. */
export function totalsReconcile(t: OrderEmailTotals): boolean {
  return t.subtotalMinor - t.discountMinor + t.adjustmentMinor + t.shippingMinor === t.totalMinor;
}
