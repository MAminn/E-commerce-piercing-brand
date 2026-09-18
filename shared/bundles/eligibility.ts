/**
 * Build Your Stack eligibility — pure domain rules (Phase 4).
 *
 * Phase 1–3 campaigns had exactly one eligible pool: the rows in
 * `bundle_campaign_product`, hand-picked by the merchant. Phase 4 adds
 * DYNAMIC eligibility so a campaign can say "every Ear product between 80 and
 * 120" and pick up newly created products without anyone reopening the CMS.
 *
 * This module holds only the decision — "does this product belong to this
 * campaign's pool?" — with no database, no framework and no I/O, so the exact
 * same predicate runs in the SQL-narrowed server resolver
 * (backend/bundles/eligibility.ts), in its unit tests, and in the CMS preview.
 * There is deliberately no second copy of these rules in the browser: the CMS
 * asks the server how many products match.
 *
 * Money: prices arrive as plain numbers (store currency, two decimals) and are
 * compared in integer minor units, the same convention as evaluate.ts.
 *
 * ── Semantics ───────────────────────────────────────────────────────────────
 * Within one filter, the selected values are OR'd. Across filters they are
 * AND'd. A filter left empty is simply not applied.
 *
 *     categoryIds = [Ear, Nose], minPrice = 80, maxPrice = 120
 *       ⇒ (category = Ear OR category = Nose) AND 80 ≤ price ≤ 120
 *
 * This is intentionally NOT an arbitrary boolean-expression engine — see
 * docs/BUNDLES_AND_STACKS.md.
 */

import { toMinorUnits } from "./evaluate";

// ─── Modes ────────────────────────────────────────────────────────────────────

/**
 * How a Build Your Stack campaign decides its eligible pool.
 *
 *   manual  — only the products the merchant picked (Phase 1–3 behaviour, and
 *             what every pre-Phase-4 campaign is migrated to).
 *   dynamic — only the products matching the rules below.
 *   hybrid  — the union of both, manual first, deduplicated.
 *
 * `curated_stack` campaigns ignore this entirely: their composition is exact
 * and merchant-owned.
 */
export type BundleEligibilityMode = "manual" | "dynamic" | "hybrid";

export const BUNDLE_ELIGIBILITY_MODES: readonly BundleEligibilityMode[] = [
  "manual",
  "dynamic",
  "hybrid",
];

/** True when the mode draws anything from the rules. */
export function modeUsesDynamic(mode: BundleEligibilityMode): boolean {
  return mode === "dynamic" || mode === "hybrid";
}

/** True when the mode draws anything from `bundle_campaign_product`. */
export function modeUsesManual(mode: BundleEligibilityMode): boolean {
  return mode === "manual" || mode === "hybrid";
}

// ─── Rules ────────────────────────────────────────────────────────────────────

/**
 * The dynamic half of a campaign's eligibility. Only fields this repository's
 * product model can support truthfully today: a product has exactly one
 * `categoryId` and one price/discountPrice pair. There is no tag or collection
 * table, so there are no tag or collection rules — adding them would mean
 * inventing taxonomy the catalogue does not have.
 *
 * Stock is deliberately absent: a product belongs to the pool while it is
 * temporarily sold out. Whether enough stock exists to COMPLETE a stack is
 * `availability`, computed by evaluate.ts from the resolved pool.
 */
export interface BundleEligibilityRules {
  /** Product's category must be one of these. Empty = no category filter. */
  categoryIds: readonly string[];
  /** Inclusive lower bound on the product's effective price. Null = unbounded. */
  minPrice: number | null;
  /** Inclusive upper bound on the product's effective price. Null = unbounded. */
  maxPrice: number | null;
}

export const emptyEligibilityRules = (): BundleEligibilityRules => ({
  categoryIds: [],
  minPrice: null,
  maxPrice: null,
});

/** True when at least one filter is set — i.e. the rules can match anything meaningful. */
export function hasAnyEligibilityRule(rules: BundleEligibilityRules): boolean {
  return rules.categoryIds.length > 0 || rules.minPrice !== null || rules.maxPrice !== null;
}

/**
 * The product facts a rule can look at. `deleted` / `hidden` are here because
 * dynamic rules must never resurrect a product the storefront has retired —
 * see `matchesEligibilityRules`.
 */
export interface EligibilityCandidate {
  productId: string;
  categoryId: string | null;
  price: number;
  discountPrice: number | null;
  deleted: boolean;
  hidden: boolean;
}

/** What a price rule compares against: the price a shopper would actually pay. */
export function candidateEffectivePrice(
  p: Pick<EligibilityCandidate, "price" | "discountPrice">,
): number {
  return p.discountPrice !== null && p.discountPrice < p.price ? p.discountPrice : p.price;
}

/**
 * The authoritative dynamic-membership predicate.
 *
 * Deleted and hidden products never match. A manually picked product that is
 * later hidden stays in the pool (flagged, so the admin can see why the
 * builder stopped offering it) — that is a merchant decision already recorded
 * in the CMS. A rule, by contrast, is a standing query over the live
 * catalogue, so it must not pull back something the store has withdrawn.
 */
export function matchesEligibilityRules(
  rules: BundleEligibilityRules,
  candidate: EligibilityCandidate,
): boolean {
  if (candidate.deleted || candidate.hidden) return false;
  // An all-empty rule set matches nothing rather than the whole catalogue:
  // "dynamic with no rules configured" is an unfinished campaign, not an
  // instruction to make every product in the store bundle-eligible.
  if (!hasAnyEligibilityRule(rules)) return false;

  if (rules.categoryIds.length > 0) {
    if (candidate.categoryId === null) return false;
    if (!rules.categoryIds.includes(candidate.categoryId)) return false;
  }

  if (rules.minPrice !== null || rules.maxPrice !== null) {
    const priceMinor = toMinorUnits(candidateEffectivePrice(candidate));
    if (rules.minPrice !== null && priceMinor < toMinorUnits(rules.minPrice)) return false;
    if (rules.maxPrice !== null && priceMinor > toMinorUnits(rules.maxPrice)) return false;
  }

  return true;
}

// ─── Rule validation ──────────────────────────────────────────────────────────

/**
 * Configuration problems in the rules themselves, independent of the
 * catalogue. Returns the first violated rule as a human-readable message, or
 * null. Shared by the service and the CMS form so both say the same thing.
 */
export function validateEligibilityRules(
  mode: BundleEligibilityMode,
  rules: BundleEligibilityRules,
): string | null {
  if (rules.minPrice !== null && !(rules.minPrice >= 0)) {
    return "Minimum price must be 0 or more.";
  }
  if (rules.maxPrice !== null && !(rules.maxPrice >= 0)) {
    return "Maximum price must be 0 or more.";
  }
  if (
    rules.minPrice !== null &&
    rules.maxPrice !== null &&
    toMinorUnits(rules.minPrice) > toMinorUnits(rules.maxPrice)
  ) {
    return "Minimum price must not be greater than the maximum price.";
  }
  if (new Set(rules.categoryIds).size !== rules.categoryIds.length) {
    return "The same eligibility category is listed more than once.";
  }
  if (modeUsesDynamic(mode) && !hasAnyEligibilityRule(rules)) {
    return "Dynamic eligibility needs at least one rule — pick a category or set a price range.";
  }
  return null;
}

// ─── Effective pool ───────────────────────────────────────────────────────────

/** Anything with a product id can be merged; callers pass their own row shape. */
export interface PoolMember {
  productId: string;
}

/**
 * Where a product in the effective pool came from. Surfaced to the admin so a
 * merchant can tell "I picked this" from "a rule caught this", and so the CMS
 * can explain why a manual pick is no longer selectable.
 */
export type EligibilitySource = "manual" | "dynamic";

/**
 * Combines the manual pool and the dynamic matches into the effective pool for
 * one campaign, deduplicated by product.
 *
 * Ordering is deterministic and stable across requests:
 *   1. manual products, in the CMS order the caller supplied (sortOrder)
 *   2. dynamic-only products, in the caller's product sort order (name)
 *
 * A product that is both manually picked and rule-matched appears once, keeps
 * its manual position, and is reported as `manual` — the merchant's explicit
 * placement wins over the rule that would have added it anyway.
 */
export function mergeEligiblePools<T extends PoolMember>(
  mode: BundleEligibilityMode,
  manual: readonly T[],
  dynamic: readonly T[],
): { products: T[]; sources: Map<string, EligibilitySource> } {
  const sources = new Map<string, EligibilitySource>();
  const products: T[] = [];
  const seen = new Set<string>();

  if (modeUsesManual(mode)) {
    for (const row of manual) {
      if (seen.has(row.productId)) continue;
      seen.add(row.productId);
      sources.set(row.productId, "manual");
      products.push(row);
    }
  }
  if (modeUsesDynamic(mode)) {
    for (const row of dynamic) {
      if (seen.has(row.productId)) continue;
      seen.add(row.productId);
      sources.set(row.productId, "dynamic");
      products.push(row);
    }
  }
  return { products, sources };
}
