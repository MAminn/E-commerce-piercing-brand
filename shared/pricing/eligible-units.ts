/**
 * Eligible-unit promotions — the ONE place that says how a promotion counts
 * the units it applies to, checks an exact / min / max quantity rule, and
 * turns a percentage into money.
 *
 * Shared by:
 *   • Pick Your Set percentage tiers (shared/bundles/evaluate.ts)
 *   • promo codes with an eligible-quantity rule ("set codes", e.g. PICK3 /
 *     PICK6) and every promo code's eligible-only discount
 *     (shared/bundles/cart-pricing.ts)
 *   • the cart preview (CartContext) and the authoritative order path
 *     (create-order), through cart-pricing.
 *
 * Pure and framework-free so the browser and the server run the same code.
 *
 * Money: integer minor units (piasters). A percentage is applied to an
 * eligible SUBTOTAL and rounded ONCE, half-up, to the piaster — never per
 * unit — so 15% of 1,075.00 is exactly 161.25 and the lines of a receipt
 * always add up.
 *
 * Price base: callers pass each unit's EFFECTIVE price — see
 * `effectiveUnitPrice` in shared/pricing/effective-price.ts. That is the
 * price the store would otherwise charge for the unit (its valid sale price
 * when it has one), the same base fixed-price bundles, automatic offers and
 * promo codes have always used.
 */

// ─── Quantity rule ────────────────────────────────────────────────────────────

/**
 * How many eligible UNITS (not cart lines) a promotion needs. Both bounds are
 * inclusive; null means unbounded on that side.
 *
 *   min = max = 3      → exactly 3
 *   min = 3, max null  → at least 3
 *   min null, max = 6  → at most 6
 *   min = 3, max = 6   → between 3 and 6
 *   both null          → no quantity rule
 */
export interface EligibleQuantityRule {
  minQuantity: number | null;
  maxQuantity: number | null;
}

export type EligibleQuantityRuleType = "none" | "exact" | "min" | "max" | "range";

export const NO_QUANTITY_RULE: EligibleQuantityRule = { minQuantity: null, maxQuantity: null };

export function quantityRuleType(rule: EligibleQuantityRule | null | undefined): EligibleQuantityRuleType {
  const min = rule?.minQuantity ?? null;
  const max = rule?.maxQuantity ?? null;
  if (min === null && max === null) return "none";
  if (min !== null && max !== null) return min === max ? "exact" : "range";
  return min !== null ? "min" : "max";
}

export function hasQuantityRule(rule: EligibleQuantityRule | null | undefined): boolean {
  return quantityRuleType(rule) !== "none";
}

/**
 * The (min, max) pair an admin form's rule type + inputs stand for. The form
 * and the API both store just the pair; this is the one translation.
 */
export function quantityRuleFromType(
  type: EligibleQuantityRuleType,
  values: { exact?: number | null; min?: number | null; max?: number | null },
): EligibleQuantityRule {
  switch (type) {
    case "exact":
      return { minQuantity: values.exact ?? null, maxQuantity: values.exact ?? null };
    case "min":
      return { minQuantity: values.min ?? null, maxQuantity: null };
    case "max":
      return { minQuantity: null, maxQuantity: values.max ?? null };
    case "range":
      return { minQuantity: values.min ?? null, maxQuantity: values.max ?? null };
    default:
      return NO_QUANTITY_RULE;
  }
}

/** Configuration check shared by the admin form and the API. Returns a message or null. */
export function validateQuantityRule(rule: EligibleQuantityRule): string | null {
  for (const value of [rule.minQuantity, rule.maxQuantity]) {
    if (value !== null && (!Number.isInteger(value) || value < 1 || value > 1000)) {
      return "Eligible quantities must be whole numbers between 1 and 1000.";
    }
  }
  if (rule.minQuantity !== null && rule.maxQuantity !== null && rule.minQuantity > rule.maxQuantity) {
    return "The minimum eligible quantity cannot be greater than the maximum.";
  }
  return null;
}

export type QuantityCheck =
  | { ok: true }
  | { ok: false; reason: "below_min" | "above_max"; required: EligibleQuantityRule; actual: number };

export function checkEligibleQuantity(rule: EligibleQuantityRule | null | undefined, eligibleUnits: number): QuantityCheck {
  const min = rule?.minQuantity ?? null;
  const max = rule?.maxQuantity ?? null;
  const required = { minQuantity: min, maxQuantity: max };
  if (min !== null && eligibleUnits < min) return { ok: false, reason: "below_min", required, actual: eligibleUnits };
  if (max !== null && eligibleUnits > max) return { ok: false, reason: "above_max", required, actual: eligibleUnits };
  return { ok: true };
}

const pieces = (n: number) => `${n} eligible piece${n === 1 ? "" : "s"}`;

/** "exactly 3 eligible pieces" / "at least 3 …" / "at most 6 …" / "3–6 …". Null without a rule. */
export function describeQuantityRule(rule: EligibleQuantityRule | null | undefined): string | null {
  const min = rule?.minQuantity ?? null;
  const max = rule?.maxQuantity ?? null;
  switch (quantityRuleType(rule)) {
    case "exact":
      return `exactly ${pieces(min as number)}`;
    case "min":
      return `at least ${pieces(min as number)}`;
    case "max":
      return `at most ${pieces(max as number)}`;
    case "range":
      return `between ${min} and ${max} eligible pieces`;
    default:
      return null;
  }
}

/** Customer-facing reason a quantity rule is not met, e.g. for PICK6 with 5 pieces. */
export function quantityRuleRejection(code: string, check: Extract<QuantityCheck, { ok: false }>): string {
  const requirement = describeQuantityRule(check.required) ?? "a different number of eligible pieces";
  const have = `Your cart has ${pieces(check.actual)}.`;
  return `${code} needs ${requirement}. ${have}`;
}

// ─── Percentage money math ────────────────────────────────────────────────────

/**
 * `percent` % of `baseMinor`, in minor units, rounded half-up once. Percent
 * may carry two decimals (12.5); it is converted to basis points so the whole
 * calculation is integer arithmetic and cannot drift.
 */
export function percentOfMinor(baseMinor: number, percent: number): number {
  if (!(baseMinor > 0) || !(percent > 0)) return 0;
  const basisPoints = Math.round(Math.min(percent, 100) * 100);
  return Math.floor((baseMinor * basisPoints + 5000) / 10000);
}

/** Percent values the admin may configure: (0, 100), at most two decimals. */
export function validateDiscountPercent(percent: number): string | null {
  if (!Number.isFinite(percent) || percent <= 0 || percent >= 100) {
    return "The discount percentage must be greater than 0 and less than 100.";
  }
  if (Math.abs(percent * 100 - Math.round(percent * 100)) > 1e-6) {
    return "The discount percentage can have at most two decimals.";
  }
  return null;
}

// ─── Promo eligibility ────────────────────────────────────────────────────────

/**
 * Which products a promo code may count and discount. Product-level:
 * options/variants never change eligibility.
 *
 *   appliesToAllProducts → every product, minus `excludedProductIds`
 *   otherwise            → products listed in `productIds` OR in one of
 *                          `categoryIds`, minus `excludedProductIds`
 *
 * Exclusions always win, so "every earring except the fixed 3-piece sets" is
 * expressible without listing each single piece.
 */
export interface PromoEligibilityRules {
  appliesToAllProducts: boolean;
  productIds: readonly string[];
  categoryIds: readonly string[];
  excludedProductIds: readonly string[];
}

export const ALL_PRODUCTS_ELIGIBLE: PromoEligibilityRules = {
  appliesToAllProducts: true,
  productIds: [],
  categoryIds: [],
  excludedProductIds: [],
};

/**
 * Rules that mean "exactly these products" — what the browser receives back
 * from promo validation (the server resolves categories and exclusions into a
 * plain product id list for the cart it was shown).
 */
export function eligibilityFromProductIds(productIds: readonly string[]): PromoEligibilityRules {
  return { appliesToAllProducts: false, productIds, categoryIds: [], excludedProductIds: [] };
}

export function isProductEligible(
  rules: PromoEligibilityRules,
  productId: string,
  categoryIds: readonly string[] | undefined,
): boolean {
  if (rules.excludedProductIds.includes(productId)) return false;
  if (rules.appliesToAllProducts) return true;
  if (rules.productIds.includes(productId)) return true;
  return (categoryIds ?? []).some((c) => rules.categoryIds.includes(c));
}

/** A priced unit-line a promotion looks at. `price` is the per-unit EFFECTIVE price. */
export interface EligibleUnitLine {
  id: string;
  quantity: number;
  price: number;
  categoryIds?: readonly string[];
}

export interface EligibleUnitSummary {
  /** Σ quantity of eligible lines — UNITS, so 3 × one SKU counts as 3. */
  units: number;
  subtotalMinor: number;
  /** Index into the input array of every eligible line. */
  lineIndexes: number[];
}

export function summarizeEligibleUnits(
  lines: readonly EligibleUnitLine[],
  rules: PromoEligibilityRules,
): EligibleUnitSummary {
  let units = 0;
  let subtotalMinor = 0;
  const lineIndexes: number[] = [];
  lines.forEach((line, index) => {
    if (!isProductEligible(rules, line.id, line.categoryIds)) return;
    const quantity = Math.max(0, Math.floor(line.quantity));
    if (quantity === 0) return;
    units += quantity;
    subtotalMinor += Math.round(line.price * 100) * quantity;
    lineIndexes.push(index);
  });
  return { units, subtotalMinor, lineIndexes };
}
