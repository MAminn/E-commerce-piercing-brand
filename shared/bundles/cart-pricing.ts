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
 *  5. promoDiscount        — ONLY on the code's eligible units (see planPromo):
 *       percentage → % of the eligible value, rounded once to the piaster
 *       fixed      → the amount, capped at the eligible value
 *     — promo codes follow the same offer_stacking policy as offers.
 *  6. shipping             = 0 if an applied offer, or a qualifying promo code
 *                            with free shipping, grants it; else the quoted fee.
 *                            Free shipping only ever zeroes an AVAILABLE quote —
 *                            an undeliverable destination is refused before
 *                            pricing (create-order) and never reaches here.
 *  7. total                = max(0, merchandise + bundleCharged − offerDiscount − promoDiscount) + shipping
 *                          = max(0, subtotal − bundleSavings − offerDiscount − promoDiscount) + shipping
 *
 * Discount ownership — one promotional discount per unit
 * ──────────────────────────────────────────────────────
 *   • A unit inside a bundle instance is priced by its bundle. An EXCLUSIVE
 *     bundle (the default, and the only mode a percentage-priced Pick Your
 *     Set may use) is invisible to offers and promo codes: its units neither
 *     count toward their conditions nor receive their discounts.
 *   • A STACKABLE fixed-total bundle is the merchant's explicit opt-in to let
 *     offers and ordinary promo codes discount its bundle price (unchanged).
 *   • A SET CODE — a promo code with an eligible-quantity rule (PICK3/PICK6) —
 *     owns its eligible units the way an exclusive bundle does: it counts and
 *     discounts ordinary cart lines only (never units already inside a
 *     bundle), and while it qualifies those lines are removed from the
 *     automatic-offer engine's input, so no offer can discount, or be
 *     triggered by, the same units. Unrelated lines stay visible to offers.
 *   • An ordinary promo code (no quantity rule) keeps the existing sequential
 *     rule: it applies to its eligible value after that value's share of the
 *     automatic-offer discount (allocated pro rata), never to the raw amount.
 *
 * All money math is in integer minor units.
 */

import type { PromoDiscountType } from "#root/shared/pricing/cart-math";
import {
  ALL_PRODUCTS_ELIGIBLE,
  type EligibleQuantityRule,
  type PromoEligibilityRules,
  type QuantityCheck,
  checkEligibleQuantity,
  hasQuantityRule,
  percentOfMinor,
  summarizeEligibleUnits,
} from "#root/shared/pricing/eligible-units";
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

// ─── Promo codes ──────────────────────────────────────────────────────────────

/**
 * A promo code as the pricing layer sees it. Only `discountType` and
 * `discountValue` are required, so a pre-existing caller that passes just
 * those still gets an all-products code with no quantity rule and no free
 * shipping — exactly the old behaviour (now restricted to eligible value).
 */
export interface CartPromoInput {
  discountType: PromoDiscountType;
  discountValue: number;
  /** Omitted → every product is eligible. */
  eligibility?: PromoEligibilityRules;
  /** Exact / min / max eligible UNITS. Omitted or both-null → no rule. */
  quantityRule?: EligibleQuantityRule | null;
  /** A qualifying code also zeroes an available shipping quote. */
  freeShipping?: boolean;
}

export interface PromoPlan {
  /** True when the code has a quantity rule: it owns its eligible units (see file header). */
  isSetCode: boolean;
  /** Eligible UNITS the code counts. */
  eligibleUnits: number;
  eligibleSubtotal: number;
  quantity: QuantityCheck;
  /** The cart satisfies the code's content rules: at least one eligible unit, and the quantity rule. */
  qualifies: boolean;
  /**
   * Indexes into `regularLines` of the lines a QUALIFYING set code owns —
   * removed from the automatic-offer input. Empty for an ordinary code or a
   * set code that does not qualify.
   */
  ownedLineIndexes: number[];
  /** Product ids of the eligible lines (for the storefront's per-line display). */
  eligibleProductIds: string[];
}

/**
 * Which units a promo code counts, whether the cart meets its quantity rule,
 * and which ordinary lines it takes ownership of. Pure — run identically by
 * CartContext and create-order.
 */
export function planPromo(
  regularLines: readonly PricingRegularLine[],
  bundles: readonly PricingBundle[],
  promo: CartPromoInput,
): PromoPlan {
  const rules = promo.eligibility ?? ALL_PRODUCTS_ELIGIBLE;
  const isSetCode = hasQuantityRule(promo.quantityRule);
  // A set code prices a set of loose units, like a Pick Your Set does — units
  // already inside ANY bundle are priced by that bundle and never count. An
  // ordinary code keeps the existing policy: ordinary lines plus stackable
  // bundle children at their bundle-share prices.
  const lines: { id: string; quantity: number; price: number; categoryIds?: string[] }[] = isSetCode
    ? regularLines.map((l) => ({ id: l.id, quantity: l.quantity, price: l.price, categoryIds: l.categoryIds }))
    : buildOfferInputs(regularLines, bundles).cartItems;
  const summary = summarizeEligibleUnits(lines, rules);
  const quantity = checkEligibleQuantity(promo.quantityRule, summary.units);
  const qualifies = summary.units > 0 && quantity.ok;
  return {
    isSetCode,
    eligibleUnits: summary.units,
    eligibleSubtotal: fromMinorUnits(summary.subtotalMinor),
    quantity,
    qualifies,
    // For a set code, `lines` IS `regularLines`, so its indexes line up.
    ownedLineIndexes: isSetCode && qualifies ? summary.lineIndexes : [],
    eligibleProductIds: [...new Set(summary.lineIndexes.flatMap((i) => lines[i]?.id ?? []))],
  };
}

// ─── Offers input ─────────────────────────────────────────────────────────────

export interface OfferInputs {
  cartItems: OfferInputLine[];
  subtotal: number;
  /**
   * For each of the first `regularLineIndexes.length` entries of `cartItems`,
   * the index of the ordinary cart line it came from. Lets the storefront map
   * a "free item" back to its line even when a set code removed some lines.
   */
  regularLineIndexes: number[];
}

/**
 * What the existing offers engine (and promo-code applicability) should see.
 * Exclusive bundles contribute nothing; stackable bundles contribute their
 * children at bundle-share prices; lines owned by a qualifying set code
 * (`plan.ownedLineIndexes`) are left out entirely.
 */
export function buildOfferInputs(
  regularLines: readonly PricingRegularLine[],
  bundles: readonly PricingBundle[],
  plan?: Pick<PromoPlan, "ownedLineIndexes"> | null,
): OfferInputs {
  const owned = new Set(plan?.ownedLineIndexes ?? []);
  const cartItems: OfferInputLine[] = [];
  const regularLineIndexes: number[] = [];
  let subtotalMinor = 0;
  regularLines.forEach((line, index) => {
    if (owned.has(index)) return;
    cartItems.push({
      id: line.id,
      name: line.name,
      quantity: line.quantity,
      price: line.price,
      categoryIds: line.categoryIds,
    });
    regularLineIndexes.push(index);
    subtotalMinor += toMinorUnits(line.price) * line.quantity;
  });
  for (const bundle of bundles) {
    if (bundle.offerStacking !== "stackable") continue;
    cartItems.push(...allocateBundleUnitLines(bundle));
    subtotalMinor += toMinorUnits(bundle.bundleTotal);
  }
  return { cartItems, subtotal: fromMinorUnits(subtotalMinor), regularLineIndexes };
}

// ─── Totals ───────────────────────────────────────────────────────────────────

export interface CartTotalsInput {
  regularLines: readonly PricingRegularLine[];
  bundles: readonly PricingBundle[];
  /**
   * Σ discountAmount of the offers the engine applied to
   * `buildOfferInputs(regularLines, bundles, planPromo(...))` — i.e. WITHOUT
   * the lines a qualifying set code owns.
   */
  offerDiscount: number;
  promo: CartPromoInput | null;
  baseShippingFee: number;
  /** An applied automatic offer grants free shipping. */
  freeShipping: boolean;
}

export interface CartTotals {
  merchandiseSubtotal: number;
  bundleRegularValue: number;
  bundleChargedValue: number;
  bundleSavings: number;
  /** merchandise + bundle regular value — what `order.subtotal` stores. */
  subtotal: number;
  /** The value automatic offers were allowed to discount (excludes set-code-owned lines). */
  offerBase: number;
  offerDiscount: number;
  promoDiscount: number;
  /** The promo code's eligibility outcome; null without a code. */
  promoPlan: PromoPlan | null;
  /** A qualifying promo code granted free shipping. */
  promoFreeShipping: boolean;
  /** Where a zero shipping charge came from, when one applied. */
  freeShippingSource: "offer" | "promo_code" | null;
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

  const plan = input.promo ? planPromo(input.regularLines, input.bundles, input.promo) : null;
  const owned = new Set(plan?.ownedLineIndexes ?? []);
  const ownedMinor = input.regularLines.reduce(
    (s, l, i) => (owned.has(i) ? s + toMinorUnits(l.price) * l.quantity : s),
    0,
  );

  const offerBaseMinor = merchandiseMinor - ownedMinor + stackableChargedMinor;
  // The engine never discounts more than the base it saw; clamp defensively.
  const offerDiscountMinor = Math.min(Math.max(0, toMinorUnits(input.offerDiscount)), offerBaseMinor);

  let promoDiscountMinor = 0;
  if (input.promo && plan?.qualifies) {
    const eligibleMinor = toMinorUnits(plan.eligibleSubtotal);
    // A set code's units were hidden from offers, so nothing was taken off
    // them yet. An ordinary code discounts what is left of its eligible value
    // after that value's pro-rata share of the offer discount — for an
    // all-products code that is exactly (offerBase − offerDiscount), the
    // pre-existing rule.
    const offerShareMinor =
      plan.isSetCode || offerBaseMinor === 0
        ? 0
        : Math.round((offerDiscountMinor * Math.min(eligibleMinor, offerBaseMinor)) / offerBaseMinor);
    const baseMinor = Math.max(0, eligibleMinor - offerShareMinor);
    promoDiscountMinor =
      input.promo.discountType === "percentage"
        ? percentOfMinor(baseMinor, input.promo.discountValue)
        : Math.min(Math.max(0, toMinorUnits(input.promo.discountValue)), baseMinor);
  }

  const promoFreeShipping = Boolean(input.promo?.freeShipping && plan?.qualifies);
  const freeShippingSource = input.freeShipping ? "offer" : promoFreeShipping ? "promo_code" : null;
  const shippingMinor = freeShippingSource ? 0 : toMinorUnits(input.baseShippingFee);
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
    promoPlan: plan,
    promoFreeShipping,
    freeShippingSource,
    shipping: fromMinorUnits(shippingMinor),
    total: fromMinorUnits(goodsMinor + shippingMinor),
  };
}
