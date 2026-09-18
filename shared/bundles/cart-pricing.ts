/**
 * Cart pricing with bundle instances — the ONE place that says how ordinary
 * lines, bundle instances, automatic offers, promo codes and shipping combine.
 * Used by CartContext (preview) and create-order (authoritative), so the two
 * cannot drift.
 *
 * Calculation order
 *  1. merchandiseSubtotal  = Σ regular line price × qty
 *  2. bundleRegularValue   = Σ bundle.regularTotal   (what the children cost separately)
 *     bundleChargedValue   = Σ bundle.bundleTotal    (the fixed campaign prices)
 *     bundleSavings        = regular − charged
 *  3. subtotal             = merchandiseSubtotal + bundleRegularValue
 *     — matches the order schema: order_item rows snapshot regular prices, so
 *     Σ items = subtotal and edit-order's recomputation stays consistent.
 *  4. offerBase            = merchandiseSubtotal + Σ STACKABLE bundle charged value
 *     Offers are evaluated by the existing engine on `buildOfferInputs()`:
 *       exclusive bundles → invisible (no lines, no value in the base)
 *       stackable bundles → children as lines at their share of the bundle
 *                           price (never regular price), value in the base
 *  5. promoDiscount        = computePromoDiscount(type, value, offerBase, offerDiscount)
 *     — promo codes follow the same offer_stacking policy as offers.
 *  6. shipping             = 0 if an applied offer grants free shipping, else the store fee
 *  7. total                = max(0, merchandise + bundleCharged − offerDiscount − promoDiscount) + shipping
 *                          = max(0, subtotal − bundleSavings − offerDiscount − promoDiscount) + shipping
 *
 * All money math is in integer minor units.
 */

import { computePromoDiscount, type PromoDiscountType } from "#root/shared/pricing/cart-math";
import type { BundleOfferStacking } from "./evaluate";
import { fromMinorUnits, toMinorUnits } from "./evaluate";

export interface PricingRegularLine {
  id: string;
  name: string;
  quantity: number;
  /** Effective per-unit price (discountPrice ?? price). */
  price: number;
  categoryIds?: string[];
}

export interface PricingBundleItem {
  productId: string;
  name: string;
  quantity: number;
  /** Regular per-unit price. */
  unitPrice: number;
  categoryIds?: string[];
}

export interface PricingBundle {
  instanceId: string;
  offerStacking: BundleOfferStacking;
  /** Σ regular unit prices of the children — server-derived. */
  regularTotal: number;
  /** Fixed campaign charge for this instance — server-derived. */
  bundleTotal: number;
  items: PricingBundleItem[];
}

/** Same shape the offers engine's `CartItemInput` has, without importing backend code into the browser. */
export interface OfferInputLine {
  id: string;
  name: string;
  quantity: number;
  price: number;
  categoryIds?: string[];
}

/**
 * Spreads a bundle's charged total across its units in proportion to their
 * regular prices, in minor units, with the rounding remainder landing on the
 * last unit so the lines sum to the bundle total exactly. One line per unit
 * (quantity 1) so that remainder can be assigned precisely.
 */
export function allocateBundleUnitLines(bundle: PricingBundle): OfferInputLine[] {
  const units: { item: PricingBundleItem; regularMinor: number }[] = [];
  for (const item of bundle.items) {
    const regularMinor = toMinorUnits(item.unitPrice);
    for (let i = 0; i < item.quantity; i++) units.push({ item, regularMinor });
  }
  if (units.length === 0) return [];

  const regularTotalMinor = units.reduce((s, u) => s + u.regularMinor, 0);
  const bundleTotalMinor = toMinorUnits(bundle.bundleTotal);

  let assigned = 0;
  return units.map((unit, index) => {
    const isLast = index === units.length - 1;
    let shareMinor: number;
    if (isLast) {
      shareMinor = bundleTotalMinor - assigned;
    } else if (regularTotalMinor === 0) {
      shareMinor = Math.floor(bundleTotalMinor / units.length);
    } else {
      shareMinor = Math.floor((bundleTotalMinor * unit.regularMinor) / regularTotalMinor);
    }
    assigned += shareMinor;
    return {
      id: unit.item.productId,
      name: unit.item.name,
      quantity: 1,
      price: fromMinorUnits(Math.max(0, shareMinor)),
      categoryIds: unit.item.categoryIds,
    };
  });
}

/**
 * What the existing offers engine (and promo-code applicability) should see.
 * Exclusive bundles contribute nothing; stackable bundles contribute their
 * children at bundle-share prices.
 */
export function buildOfferInputs(
  regularLines: readonly PricingRegularLine[],
  bundles: readonly PricingBundle[],
): { cartItems: OfferInputLine[]; subtotal: number } {
  const cartItems: OfferInputLine[] = regularLines.map((line) => ({
    id: line.id,
    name: line.name,
    quantity: line.quantity,
    price: line.price,
    categoryIds: line.categoryIds,
  }));
  let subtotalMinor = regularLines.reduce((s, l) => s + toMinorUnits(l.price) * l.quantity, 0);
  for (const bundle of bundles) {
    if (bundle.offerStacking !== "stackable") continue;
    cartItems.push(...allocateBundleUnitLines(bundle));
    subtotalMinor += toMinorUnits(bundle.bundleTotal);
  }
  return { cartItems, subtotal: fromMinorUnits(subtotalMinor) };
}

export interface CartTotalsInput {
  regularLines: readonly PricingRegularLine[];
  bundles: readonly PricingBundle[];
  /** Σ discountAmount of the offers the engine applied to `buildOfferInputs()`. */
  offerDiscount: number;
  promo: { discountType: PromoDiscountType; discountValue: number } | null;
  baseShippingFee: number;
  freeShipping: boolean;
}

export interface CartTotals {
  merchandiseSubtotal: number;
  bundleRegularValue: number;
  bundleChargedValue: number;
  bundleSavings: number;
  /** merchandise + bundle regular value — what `order.subtotal` stores. */
  subtotal: number;
  /** The value offers/promo codes were allowed to discount. */
  offerBase: number;
  offerDiscount: number;
  promoDiscount: number;
  shipping: number;
  total: number;
}

export function computeCartTotals(input: CartTotalsInput): CartTotals {
  const merchandiseMinor = input.regularLines.reduce((s, l) => s + toMinorUnits(l.price) * l.quantity, 0);
  const bundleRegularMinor = input.bundles.reduce((s, b) => s + toMinorUnits(b.regularTotal), 0);
  const bundleChargedMinor = input.bundles.reduce((s, b) => s + toMinorUnits(b.bundleTotal), 0);
  const stackableChargedMinor = input.bundles
    .filter((b) => b.offerStacking === "stackable")
    .reduce((s, b) => s + toMinorUnits(b.bundleTotal), 0);

  const offerBaseMinor = merchandiseMinor + stackableChargedMinor;
  // The engine never discounts more than the base it saw; clamp defensively.
  const offerDiscountMinor = Math.min(Math.max(0, toMinorUnits(input.offerDiscount)), offerBaseMinor);

  const promoDiscountMinor = input.promo
    ? toMinorUnits(
        computePromoDiscount(
          input.promo.discountType,
          input.promo.discountValue,
          fromMinorUnits(offerBaseMinor),
          fromMinorUnits(offerDiscountMinor),
        ),
      )
    : 0;

  const shippingMinor = input.freeShipping ? 0 : toMinorUnits(input.baseShippingFee);
  const goodsMinor = Math.max(0, merchandiseMinor + bundleChargedMinor - offerDiscountMinor - promoDiscountMinor);

  return {
    merchandiseSubtotal: fromMinorUnits(merchandiseMinor),
    bundleRegularValue: fromMinorUnits(bundleRegularMinor),
    bundleChargedValue: fromMinorUnits(bundleChargedMinor),
    bundleSavings: fromMinorUnits(bundleRegularMinor - bundleChargedMinor),
    subtotal: fromMinorUnits(merchandiseMinor + bundleRegularMinor),
    offerBase: fromMinorUnits(offerBaseMinor),
    offerDiscount: fromMinorUnits(offerDiscountMinor),
    promoDiscount: fromMinorUnits(promoDiscountMinor),
    shipping: fromMinorUnits(shippingMinor),
    total: fromMinorUnits(goodsMinor + shippingMinor),
  };
}
