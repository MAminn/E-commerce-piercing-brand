/**
 * Bundles & Stacks — pure domain rules.
 *
 * Everything in this file is framework-free and side-effect-free so the same
 * code can run in the browser (live builder feedback) and on the server
 * (authoritative validation before a bundle is priced into a cart/order).
 * Nothing here touches the database; callers pass in the campaign config and
 * the shopper's proposed selection.
 *
 * Money: campaign prices and unit prices arrive as plain numbers (the store's
 * currency, two decimals). All arithmetic happens in integer minor units
 * (piasters) and is converted back at the boundary, so summing 6 × 79.99
 * never drifts the way raw float addition does.
 */

// ─── Money helpers ────────────────────────────────────────────────────────────

/** 12.34 → 1234. Rounds to the nearest minor unit to absorb float noise on input. */
export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

/** 1234 → 12.34 */
export function fromMinorUnits(minor: number): number {
  return minor / 100;
}

// ─── Pricing tiers ────────────────────────────────────────────────────────────

/**
 * One quantity → price step of a Build Your Stack campaign, e.g.
 * "3 pieces for 270". A campaign may define several; the shopper pays the
 * price of the tier whose quantity their selection matches EXACTLY.
 *
 * `id` is the `bundle_campaign_tier` row id, or null for a tier the domain
 * synthesised (a legacy single-price campaign, or a curated stack — see
 * `resolveCampaignTiers` and `curatedEvaluationConfig`).
 */
export interface BundleTier {
  id: string | null;
  /** Qualifying UNITS this tier prices. Whole number ≥ 1. */
  quantity: number;
  /** What those units cost in total. Store currency, two decimals, > 0. */
  price: number;
}

/** Ascending by quantity — the order tiers are stored, priced and displayed in. */
export function sortTiers(tiers: readonly BundleTier[]): BundleTier[] {
  return [...tiers].sort((a, b) => a.quantity - b.quantity);
}

/**
 * The tiers a config is actually priced by.
 *
 * When `tiers` is populated it is canonical. When it is empty the campaign
 * predates tiered pricing (or is a curated stack), so a single tier is
 * synthesised from the legacy `requiredQuantity` / `fixedBundlePrice` pair.
 * That fallback is what makes every pre-Phase-5 campaign, call site and test
 * behave exactly as before without being rewritten.
 */
export function resolveCampaignTiers(
  config: Pick<BundleCampaignConfig, "tiers" | "requiredQuantity" | "fixedBundlePrice">,
): BundleTier[] {
  const tiers = config.tiers ?? [];
  if (tiers.length > 0) return sortTiers(tiers);
  if (config.fixedBundlePrice === null || !Number.isFinite(config.requiredQuantity)) return [];
  return [{ id: null, quantity: config.requiredQuantity, price: config.fixedBundlePrice }];
}

/**
 * The tier a selection of `unitCount` units buys — an EXACT quantity match,
 * never the nearest or the next cheapest. 5 units against tiers 3/4/6 is not
 * a bundle at all; it is not silently priced as the 4-tier plus a stray item.
 */
export function resolveBundleTier(
  tiers: readonly BundleTier[],
  unitCount: number,
): BundleTier | null {
  return tiers.find((t) => t.quantity === unitCount) ?? null;
}

/** The smallest tier the shopper has not yet reached, for "add N more" prompts. */
export function nextBundleTier(
  tiers: readonly BundleTier[],
  unitCount: number,
): BundleTier | null {
  return sortTiers(tiers).find((t) => t.quantity > unitCount) ?? null;
}

/** Cheapest entry point — what a multi-tier card means by "from N pieces". */
export function lowestBundleTier(tiers: readonly BundleTier[]): BundleTier | null {
  return sortTiers(tiers)[0] ?? null;
}

export function highestBundleTier(tiers: readonly BundleTier[]): BundleTier | null {
  const sorted = sortTiers(tiers);
  return sorted[sorted.length - 1] ?? null;
}

/**
 * Configuration rules for a tier set, independent of any pool or selection.
 * Returns the first violated rule as a human-readable message, or null, so
 * the CMS form and the service can say exactly the same thing.
 */
export function validateBundleTiers(
  tiers: readonly BundleTier[],
  options: { requireAtLeastOne: boolean },
): string | null {
  if (options.requireAtLeastOne && tiers.length === 0) {
    return "Add at least one pricing tier before activating the campaign.";
  }
  for (const tier of tiers) {
    if (!Number.isInteger(tier.quantity) || tier.quantity < 1) {
      return "Every tier needs a whole quantity of at least 1.";
    }
    if (!Number.isFinite(tier.price) || tier.price <= 0) {
      return "Every tier needs a price greater than 0.";
    }
    // `price * 100` is not exact in binary floating point (79.99 * 100 is
    // 7998.999999999999), so a strict equality test would reject legitimate
    // prices. A tolerance well below half a piaster separates "rounding noise"
    // from a genuine third decimal.
    if (Math.abs(tier.price * 100 - Math.round(tier.price * 100)) > 1e-6) {
      return "Tier prices can have at most two decimals.";
    }
  }
  const quantities = tiers.map((t) => t.quantity);
  if (new Set(quantities).size !== quantities.length) {
    return "Two tiers cannot have the same quantity.";
  }
  return null;
}

// ─── Campaign config ──────────────────────────────────────────────────────────

export type BundleCampaignType = "build_your_stack" | "curated_stack";
export type BundlePricingType = "fixed_total";
export type BundleOfferStacking = "exclusive" | "stackable";

/**
 * The slice of a campaign the pricing rules need. Deliberately decoupled from
 * the Drizzle row type so this module has no dependency on the schema and the
 * DB row can grow without touching the domain logic. `fixedBundlePrice` is a
 * number here (the service converts from the DB's decimal string).
 */
export interface BundleCampaignConfig {
  type: BundleCampaignType;
  requiredQuantity: number;
  pricingType: BundlePricingType;
  fixedBundlePrice: number | null;
  allowDuplicates: boolean;
  maxPerProduct: number | null;
  isRepeatable: boolean;
  /**
   * Quantity → price tiers (Phase 5). Canonical when present: `bundleTotal`
   * always comes from the matched tier. Leave empty for a campaign that still
   * prices off `requiredQuantity` + `fixedBundlePrice` — `resolveCampaignTiers`
   * synthesises the equivalent single tier, so behaviour is unchanged.
   */
  tiers?: readonly BundleTier[];
  /** Product IDs in the campaign's eligible pool (manual selection in Phase 1). */
  eligibleProductIds: readonly string[];
  /**
   * Fixed composition of a `curated_stack` (product → units). Ignored for
   * `build_your_stack`. Every id here is also in `eligibleProductIds`.
   */
  composition?: readonly CuratedCompositionLine[];
}

export interface CuratedCompositionLine {
  productId: string;
  quantity: number;
  /**
   * Phase 7: the exact option configuration the merchant fixed for this line
   * (`{ Color: "Gold" }`). Null/absent for a product without options. A line
   * whose product HAS options but no configuration cannot be sold — the
   * service treats it as unpurchasable, never guesses a value.
   */
  selectedOptions?: Record<string, string> | null;
}

/** Units in a curated stack — what `requiredQuantity` must equal for that type. */
export function curatedUnitCount(composition: readonly CuratedCompositionLine[]): number {
  return composition.reduce((sum, line) => sum + line.quantity, 0);
}

/** Scheduling/activation fields, shared with `cart_offer`'s semantics. */
export interface BundleCampaignSchedule {
  isActive: boolean;
  startsAt: Date | string | null;
  endsAt: Date | string | null;
}

// ─── Campaign state ───────────────────────────────────────────────────────────

/**
 * Derived lifecycle state, never persisted — the same approach `cart_offer`
 * uses (isActive + startsAt/endsAt evaluated at read time) rather than the
 * promo-code approach of storing a status column that has to be kept in sync.
 *
 *   inactive  — master switch off (a draft, or paused by the admin)
 *   scheduled — switched on but startsAt is still in the future
 *   expired   — switched on but endsAt has passed
 *   active    — switched on and inside its window (or has no window)
 */
export type BundleCampaignState = "inactive" | "scheduled" | "active" | "expired";

function toDate(value: Date | string | null): Date | null {
  if (value === null) return null;
  return value instanceof Date ? value : new Date(value);
}

export function getBundleCampaignState(
  campaign: BundleCampaignSchedule,
  now: Date = new Date(),
): BundleCampaignState {
  if (!campaign.isActive) return "inactive";
  const startsAt = toDate(campaign.startsAt);
  const endsAt = toDate(campaign.endsAt);
  if (startsAt && startsAt.getTime() > now.getTime()) return "scheduled";
  if (endsAt && endsAt.getTime() < now.getTime()) return "expired";
  return "active";
}

/** True only when shoppers should currently be able to build this bundle. */
export function isBundleCampaignLive(
  campaign: BundleCampaignSchedule,
  now: Date = new Date(),
): boolean {
  return getBundleCampaignState(campaign, now) === "active";
}

// ─── Campaign invariants ──────────────────────────────────────────────────────

/**
 * Configuration rules that are independent of any shopper selection. The
 * service enforces these on create/update; they're exported so the admin form
 * can show the same message before submitting and tests can pin them down.
 *
 * Returns the first violated rule as a human-readable message, or null.
 *
 * `requireCompletablePool` — whether the eligible pool must be large enough
 * to actually finish a bundle. The service passes `isActive` here: a draft may
 * be saved with an empty pool, but a campaign can't be switched on until a
 * shopper could complete it.
 */
export function validateBundleCampaignConfig(
  config: BundleCampaignConfig,
  options: { requireCompletablePool: boolean },
): string | null {
  if (config.pricingType === "fixed_total") {
    // Build Your Stack is priced by its tiers; `fixedBundlePrice` is only a
    // derived mirror, so a missing price there is really a missing tier and
    // must be reported as one. Curated stacks genuinely price off the column.
    const pricedByTiers = config.type !== "curated_stack" && (config.tiers ?? []).length > 0;
    if (!pricedByTiers && (config.fixedBundlePrice === null || !(config.fixedBundlePrice > 0))) {
      // A Build Your Stack campaign with no tiers AND no legacy price has no
      // pricing at all, and the thing to fix is the tier list — the CMS no
      // longer offers it a standalone price field. A price that exists but is
      // invalid still reports as an invalid price.
      return config.type !== "curated_stack" && config.fixedBundlePrice === null
        ? "Add at least one pricing tier before activating the campaign."
        : "A fixed-total bundle needs a bundle price greater than 0.";
    }
  }

  if (config.type === "curated_stack") {
    const composition = config.composition ?? [];
    if (composition.some((line) => !Number.isInteger(line.quantity) || line.quantity < 1)) {
      return "Every product in a curated stack needs a quantity of at least 1.";
    }
    if (new Set(composition.map((l) => l.productId)).size !== composition.length) {
      return "The curated stack lists the same product more than once.";
    }
    if (options.requireCompletablePool && composition.length === 0) {
      return "Add at least one product to the stack before activating the campaign.";
    }
    if (composition.length > 0 && curatedUnitCount(composition) !== config.requiredQuantity) {
      return "Required quantity must equal the number of units in the curated stack.";
    }
    return null;
  }

  // Tier shape first — a campaign with a broken tier set has no coherent
  // quantity to check anything else against.
  const tiers = resolveCampaignTiers(config);
  const tierError = validateBundleTiers(config.tiers ?? [], {
    requireAtLeastOne: options.requireCompletablePool && (config.tiers ?? []).length === 0 && tiers.length === 0,
  });
  if (tierError) return tierError;
  if (options.requireCompletablePool && tiers.length === 0) {
    return "Add at least one pricing tier before activating the campaign.";
  }
  if (!Number.isInteger(config.requiredQuantity) || config.requiredQuantity < 1) {
    return "Required quantity must be a whole number of at least 1.";
  }

  if (config.maxPerProduct !== null) {
    if (!Number.isInteger(config.maxPerProduct) || config.maxPerProduct < 1) {
      return "Max per product must be a whole number of at least 1.";
    }
    if (!config.allowDuplicates) {
      return "Max per product only applies when duplicates are allowed.";
    }
  }

  if (new Set(config.eligibleProductIds).size !== config.eligibleProductIds.length) {
    return "The eligible product list contains the same product more than once.";
  }

  if (options.requireCompletablePool) {
    const poolSize = config.eligibleProductIds.length;
    if (poolSize === 0) {
      return "Add at least one eligible product before activating the campaign.";
    }
    // Max units a shopper can draw from the pool for ONE bundle.
    const capacity = config.allowDuplicates
      ? config.maxPerProduct === null
        ? Number.POSITIVE_INFINITY
        : poolSize * config.maxPerProduct
      : poolSize;
    // Phase 5: the pool must be able to complete the SMALLEST tier. A campaign
    // offering 3/4/6 from a pool of 4 is perfectly valid — it simply cannot
    // sell its 6-piece tier yet, which is a per-tier availability fact, not a
    // reason to refuse activation.
    const smallest = tiers[0]?.quantity ?? config.requiredQuantity;
    if (capacity < smallest) {
      return config.allowDuplicates
        ? `With ${poolSize} eligible product(s) and a max of ${config.maxPerProduct} per product, a shopper can only pick ${capacity} unit(s) — fewer than the ${smallest} needed for the smallest tier.`
        : `Duplicates are off, so the pool needs at least ${smallest} eligible products to complete the smallest tier (currently ${poolSize}).`;
    }
  }

  return null;
}

/** Validates the optional schedule window. Returns a message or null. */
export function validateBundleCampaignSchedule(
  startsAt: Date | null | undefined,
  endsAt: Date | null | undefined,
): string | null {
  if (startsAt && Number.isNaN(startsAt.getTime())) return "Start date is invalid.";
  if (endsAt && Number.isNaN(endsAt.getTime())) return "End date is invalid.";
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    return "End date must be after the start date.";
  }
  return null;
}

// ─── Selection evaluation ─────────────────────────────────────────────────────

/**
 * One line of the shopper's proposed selection. Eligibility is product-level
 * (see docs): variant choices live on the cart line but don't change whether a
 * unit qualifies, so several lines may share a `productId` and are merged.
 * `unitPrice` is the regular per-unit price the store would otherwise charge
 * (i.e. `discountPrice ?? price`, exactly what checkout uses).
 */
export interface BundleSelectionUnit {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export type BundleEvaluationReason =
  | "campaign_not_live"
  | "duplicates_not_allowed"
  | "max_per_product_exceeded"
  | "not_enough_units"
  | "too_many_units"
  /** Phase 5: the count sits BETWEEN configured tiers (5 against 3/4/6). */
  | "no_matching_tier"
  /** Phase 5: the campaign has no usable tier at all — a misconfiguration. */
  | "no_tiers_configured";

export interface BundleEvaluationLine {
  productId: string;
  eligible: boolean;
  /** Units the shopper put forward for this product. */
  requestedQuantity: number;
  /** Units that count toward the bundle after duplicate / cap rules. */
  countedQuantity: number;
}

export interface BundleEvaluation {
  /** True when the selection is exactly one (or, if repeatable, N) complete bundle(s). */
  qualifies: boolean;
  /** Why it doesn't qualify; null when it does. */
  reason: BundleEvaluationReason | null;
  /**
   * The tier this selection matched, or null when it matched none. Its
   * `price` is where `bundleTotal` comes from — never the client, never a
   * neighbouring tier.
   */
  tier: BundleTier | null;
  /**
   * The next tier up from the current count, so the builder can say
   * "add 2 more to unlock 6 for 480" without knowing any pricing rules.
   * Null once the largest tier is reached.
   */
  nextTier: BundleTier | null;
  /**
   * Units one bundle needs: the matched tier's quantity, else the next tier
   * the shopper is working toward. Same meaning it always had for a
   * single-price campaign.
   */
  requiredQuantity: number;
  /** Eligible units that count after duplicate/cap rules. */
  qualifyingQuantity: number;
  /** Complete bundles the counted units form (0 or 1 unless repeatable). */
  completeBundles: number;
  /** Units still needed to finish the next bundle (0 when the count is an exact multiple). */
  remainingUnitsNeeded: number;
  /** Eligible units that can't be placed: duplicates when disallowed, over the per-product cap, or beyond the bundle size. */
  excessUnits: number;
  /** Units of products outside the pool — ignored, never invalidating. */
  ineligibleUnits: number;
  /** What the counted units would cost at their regular prices. */
  regularTotal: number;
  /** What the shopper pays for the counted units under the campaign; null unless it qualifies. */
  bundleTotal: number | null;
  /** regularTotal − bundleTotal; null unless it qualifies. Negative means the bundle costs MORE than buying separately. */
  discountAmount: number | null;
  lines: BundleEvaluationLine[];
}

export interface EvaluateBundleSelectionOptions {
  /** Pass the campaign's activation/schedule to also gate on liveness. */
  schedule?: BundleCampaignSchedule;
  now?: Date;
}

function unitsBeyondCap(
  requested: number,
  config: BundleCampaignConfig,
): { counted: number; duplicateExcess: number; capExcess: number } {
  if (!config.allowDuplicates) {
    const counted = Math.min(requested, 1);
    return { counted, duplicateExcess: requested - counted, capExcess: 0 };
  }
  if (config.maxPerProduct !== null) {
    const counted = Math.min(requested, config.maxPerProduct);
    return { counted, duplicateExcess: 0, capExcess: requested - counted };
  }
  return { counted: requested, duplicateExcess: 0, capExcess: 0 };
}

/**
 * Decide whether a proposed selection completes the campaign's bundle(s) and
 * what it costs. "Requires 6" means 6 qualifying UNITS — six distinct products
 * when duplicates are off, or e.g. 3 + 3 of two products when they're on.
 *
 * A selection qualifies only when the counted units are an exact multiple of
 * `requiredQuantity` (exactly one multiple unless `isRepeatable`). Extra units
 * are reported, not silently priced, because the caller (the future
 * cart/bundle-instance layer) must decide what to do with them — the domain
 * function refuses to guess.
 */
export function evaluateBundleSelection(
  config: BundleCampaignConfig,
  selection: readonly BundleSelectionUnit[],
  options: EvaluateBundleSelectionOptions = {},
): BundleEvaluation {
  const eligible = new Set(config.eligibleProductIds);

  // Merge lines by product — variant lines of the same product share a slot budget.
  const byProduct = new Map<string, { requested: number; priceMinor: number[] }>();
  for (const unit of selection) {
    const quantity = Math.max(0, Math.floor(unit.quantity));
    if (quantity === 0) continue;
    const entry = byProduct.get(unit.productId) ?? { requested: 0, priceMinor: [] };
    entry.requested += quantity;
    const priceMinor = toMinorUnits(unit.unitPrice);
    for (let i = 0; i < quantity; i++) entry.priceMinor.push(priceMinor);
    byProduct.set(unit.productId, entry);
  }

  const lines: BundleEvaluationLine[] = [];
  let qualifyingQuantity = 0;
  let ineligibleUnits = 0;
  let duplicateExcess = 0;
  let capExcess = 0;
  let regularTotalMinor = 0;

  for (const [productId, entry] of byProduct) {
    if (!eligible.has(productId)) {
      ineligibleUnits += entry.requested;
      lines.push({ productId, eligible: false, requestedQuantity: entry.requested, countedQuantity: 0 });
      continue;
    }
    const cap = unitsBeyondCap(entry.requested, config);
    duplicateExcess += cap.duplicateExcess;
    capExcess += cap.capExcess;
    qualifyingQuantity += cap.counted;
    // Cheapest units count first so any excess is the shopper's most expensive
    // ones — the conservative choice for the store when a cap is exceeded.
    const sorted = [...entry.priceMinor].sort((a, b) => a - b);
    for (let i = 0; i < cap.counted; i++) regularTotalMinor += sorted[i] ?? 0;
    lines.push({ productId, eligible: true, requestedQuantity: entry.requested, countedQuantity: cap.counted });
  }

  // ── Tier matching ─────────────────────────────────────────────────────────
  // A selection buys the tier whose quantity it matches EXACTLY. There is no
  // nearest-tier or next-cheapest fallback: 5 units against tiers 3/4/6 is not
  // a bundle, and is never priced as "the 4-tier plus a loose item".
  //
  // The one place multiples are still allowed is a SINGLE-tier campaign, which
  // is what every pre-Phase-5 campaign is. There, 12 units of a repeatable
  // "6 for 480" remain two complete bundles, exactly as before — unambiguous
  // because there is only one quantity to divide by. With several tiers, 12
  // could be 4×3, 3×4 or 2×6, so the domain refuses to guess and the cart's
  // existing model applies instead: one instance per qualified tier selection,
  // several instances for a repeatable campaign.
  const tiers = resolveCampaignTiers(config);
  const smallestTier = tiers[0] ?? null;
  const largestTier = tiers[tiers.length - 1] ?? null;
  const singleTier = tiers.length === 1 ? (tiers[0] ?? null) : null;

  let tier = resolveBundleTier(tiers, qualifyingQuantity);
  let completeBundles = tier ? 1 : 0;
  if (!tier && singleTier && qualifyingQuantity > 0) {
    const multiples = Math.floor(qualifyingQuantity / singleTier.quantity);
    if (multiples >= 1) {
      tier = singleTier;
      completeBundles = config.isRepeatable ? multiples : 1;
    }
  }

  const perBundleQuantity = tier?.quantity ?? 0;
  const unitsInBundles = completeBundles * perBundleQuantity;
  // Units past the last complete bundle. With no complete bundle yet they are
  // progress toward the first one, not excess.
  const sizeExcess = completeBundles > 0 ? qualifyingQuantity - unitsInBundles : 0;

  const nextTier = nextBundleTier(tiers, qualifyingQuantity);
  const requiredQuantity =
    tier?.quantity ?? nextTier?.quantity ?? smallestTier?.quantity ?? config.requiredQuantity;

  let remainingUnitsNeeded: number;
  if (singleTier) {
    // Legacy formula, preserved verbatim for single-price campaigns.
    const remainder = qualifyingQuantity % singleTier.quantity;
    remainingUnitsNeeded = config.isRepeatable
      ? remainder === 0 && qualifyingQuantity > 0
        ? 0
        : singleTier.quantity - remainder
      : Math.max(0, singleTier.quantity - qualifyingQuantity);
  } else {
    // Multi-tier: how far to the next rung, 0 once a tier is matched.
    remainingUnitsNeeded = nextTier === null ? 0 : nextTier.quantity - qualifyingQuantity;
  }

  let reason: BundleEvaluationReason | null = null;
  if (options.schedule && !isBundleCampaignLive(options.schedule, options.now)) {
    reason = "campaign_not_live";
  } else if (tiers.length === 0) {
    reason = "no_tiers_configured";
  } else if (duplicateExcess > 0) {
    reason = "duplicates_not_allowed";
  } else if (capExcess > 0) {
    reason = "max_per_product_exceeded";
  } else if (completeBundles === 0) {
    // Below the first tier is "keep going"; above the last is "too many";
    // anything else is the gap between two rungs.
    reason =
      smallestTier !== null && qualifyingQuantity < smallestTier.quantity
        ? "not_enough_units"
        : largestTier !== null && qualifyingQuantity > largestTier.quantity
          ? "too_many_units"
          : "no_matching_tier";
  } else if (sizeExcess > 0) {
    reason = "too_many_units";
  }

  const qualifies = reason === null;
  const regularTotal = fromMinorUnits(regularTotalMinor);

  let bundleTotal: number | null = null;
  let discountAmount: number | null = null;
  if (qualifies && tier !== null && config.pricingType === "fixed_total") {
    // The matched tier is the only source of the charge. Savings are reported
    // truthfully and are never clamped: a tier priced above the selection's
    // regular value yields a negative discountAmount, which the storefront is
    // responsible for wording honestly.
    const bundleTotalMinor = toMinorUnits(tier.price) * completeBundles;
    bundleTotal = fromMinorUnits(bundleTotalMinor);
    discountAmount = fromMinorUnits(regularTotalMinor - bundleTotalMinor);
  }

  return {
    qualifies,
    reason,
    tier,
    nextTier,
    requiredQuantity,
    qualifyingQuantity,
    completeBundles,
    remainingUnitsNeeded,
    excessUnits: duplicateExcess + capExcess + sizeExcess,
    ineligibleUnits,
    regularTotal,
    bundleTotal,
    discountAmount,
    lines,
  };
}

// ─── Curated stacks ───────────────────────────────────────────────────────────

/**
 * A curated stack is priced through the very same evaluator: its composition
 * IS the selection, evaluated against a pool made of the composition's
 * products with duplicates allowed. Nothing about the money math is special-
 * cased, so fixed-total pricing, minor-unit exactness and negative-saving
 * reporting behave identically for both campaign types.
 */
export function evaluateCuratedStack(
  config: BundleCampaignConfig,
  unitPrices: ReadonlyMap<string, number> | Record<string, number>,
  options: EvaluateBundleSelectionOptions = {},
): BundleEvaluation {
  const composition = config.composition ?? [];
  const priceOf = (productId: string): number => {
    const value = unitPrices instanceof Map ? unitPrices.get(productId) : (unitPrices as Record<string, number>)[productId];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  };
  const selection: BundleSelectionUnit[] = composition.map((line) => ({
    productId: line.productId,
    quantity: line.quantity,
    unitPrice: priceOf(line.productId),
  }));
  return evaluateBundleSelection(curatedEvaluationConfig(config), selection, options);
}

/**
 * The config a curated stack is evaluated under: its composition IS the
 * selection, so duplicates are inherently allowed, there is no per-product
 * cap, and one composition is exactly one bundle. `requiredQuantity` comes
 * from the composition rather than the stored column, so a campaign row that
 * somehow drifted out of sync still prices the set the merchant defined.
 *
 * Exported because the server validator builds the same config from DB rows —
 * both paths must agree on what "one curated stack" means.
 */
export function curatedEvaluationConfig(config: BundleCampaignConfig): BundleCampaignConfig {
  const composition = config.composition ?? [];
  const units = curatedUnitCount(composition);
  return {
    ...config,
    requiredQuantity: units,
    allowDuplicates: true,
    maxPerProduct: null,
    isRepeatable: false,
    eligibleProductIds: composition.map((line) => line.productId),
    // A curated stack is exactly one quantity at exactly one price, so it is
    // evaluated as a single synthetic tier. Curated campaigns never store
    // `bundle_campaign_tier` rows and the CMS never offers them one — the tier
    // abstraction is reused here purely so both types price through identical
    // code, with no second pricing path to keep in sync.
    tiers:
      config.fixedBundlePrice === null
        ? []
        : [{ id: null, quantity: units, price: config.fixedBundlePrice }],
  };
}

// ─── Availability ─────────────────────────────────────────────────────────────

/** What the storefront knows about a pool product when deciding availability. */
export interface AvailabilityProduct {
  productId: string;
  stock: number;
  /** false for deleted/hidden products — they can never be picked. */
  purchasable: boolean;
}

export type BundleAvailability = "available" | "sold_out";

/**
 * Can a shopper complete this campaign right now? `is_active` + schedule say
 * whether it is LIVE; this says whether it is BUYABLE. Curated: every
 * composition line must be purchasable with stock ≥ its quantity. Build
 * Your Stack: the purchasable pool, capped per product by stock and the
 * campaign's duplicate rules, must reach `requiredQuantity`.
 */
/**
 * How many qualifying UNITS the pool can currently supply toward one bundle:
 * one per purchasable product when duplicates are off, or each product's
 * stock capped by `maxPerProduct` when they're on.
 *
 * THE capacity calculation — availability, per-tier availability and the CMS
 * preview all derive from this one function rather than re-deriving the rules.
 */
export function bundlePoolCapacity(
  config: Pick<BundleCampaignConfig, "eligibleProductIds" | "allowDuplicates" | "maxPerProduct">,
  products: readonly AvailabilityProduct[],
): number {
  const byId = new Map(products.map((p) => [p.productId, p]));
  let capacity = 0;
  for (const id of config.eligibleProductIds) {
    const p = byId.get(id);
    if (!p || !p.purchasable || p.stock <= 0) continue;
    capacity += config.allowDuplicates ? Math.min(p.stock, config.maxPerProduct ?? p.stock) : 1;
  }
  return capacity;
}

/**
 * Whether each configured tier can be completed from the pool right now.
 * Returned in tier order so callers can render it directly.
 *
 * A tier is unavailable purely because of stock — it stays part of the
 * campaign. Eligibility says which products BELONG; this says which of them
 * can be bought (the Phase 4 separation, now per tier).
 */
export function computeTierAvailability(
  config: BundleCampaignConfig,
  products: readonly AvailabilityProduct[],
): { tier: BundleTier; availability: BundleAvailability }[] {
  const capacity = bundlePoolCapacity(config, products);
  return resolveCampaignTiers(config).map((tier) => ({
    tier,
    availability: capacity >= tier.quantity ? ("available" as const) : ("sold_out" as const),
  }));
}

/**
 * Can a shopper complete this campaign right now? `is_active` + schedule say
 * whether it is LIVE; this says whether it is BUYABLE. Curated: every
 * composition line must be purchasable with stock ≥ its quantity.
 *
 * Build Your Stack (Phase 5): available when ANY configured tier can be
 * completed. A campaign offering 3/4/6 whose pool can only fill 4 is still
 * available — at its 3- and 4-piece tiers — and must not read as sold out
 * merely because its largest tier is currently out of reach. With a single
 * tier this is identical to the pre-Phase-5 behaviour.
 */
export function computeBundleAvailability(
  config: BundleCampaignConfig,
  products: readonly AvailabilityProduct[],
): BundleAvailability {
  if (config.type === "curated_stack") {
    const byId = new Map(products.map((p) => [p.productId, p]));
    const composition = config.composition ?? [];
    if (composition.length === 0) return "sold_out";
    for (const line of composition) {
      const p = byId.get(line.productId);
      if (!p || !p.purchasable || p.stock < line.quantity) return "sold_out";
    }
    return "available";
  }

  const tiers = resolveCampaignTiers(config);
  if (tiers.length === 0) return "sold_out";
  const capacity = bundlePoolCapacity(config, products);
  return tiers.some((t) => capacity >= t.quantity) ? "available" : "sold_out";
}

/**
 * Cheapest and dearest regular value of a completable Build Your Stack from
 * the given pool prices, honouring duplicate/cap rules. Null when the pool
 * cannot complete a stack. Used for "from X EGP separately" merchandising.
 */
export function buildYourStackValueRange(
  config: BundleCampaignConfig,
  products: readonly (AvailabilityProduct & { unitPrice: number })[],
): { min: number; max: number } | null {
  // Defaults to the smallest tier so a card's "from" figure lines up with the
  // cheapest way into the campaign. Per-tier figures come from
  // `valueRangeForTier`; one range can never describe several quantities.
  const tiers = resolveCampaignTiers(config);
  const quantity = tiers[0]?.quantity ?? config.requiredQuantity;
  return valueRangeForTier(config, products, quantity);
}

/**
 * Cheapest and dearest regular value of a stack of exactly `quantity` units
 * from the purchasable pool, honouring duplicate/cap rules. Null when the pool
 * cannot fill that quantity.
 *
 * Phase 5 makes this per-quantity because a 3-piece and a 6-piece tier of the
 * same campaign have genuinely different separately-bought values.
 */
export function valueRangeForTier(
  config: Pick<BundleCampaignConfig, "eligibleProductIds" | "allowDuplicates" | "maxPerProduct">,
  products: readonly (AvailabilityProduct & { unitPrice: number })[],
  quantity: number,
): { min: number; max: number } | null {
  if (!Number.isInteger(quantity) || quantity < 1) return null;
  const eligible = new Set(config.eligibleProductIds);
  const usable = products.filter((p) => p.purchasable && p.stock > 0 && eligible.has(p.productId));
  const cap = (p: AvailabilityProduct) =>
    config.allowDuplicates ? Math.min(p.stock, config.maxPerProduct ?? p.stock) : 1;
  const pick = (sorted: typeof usable): number | null => {
    let remaining = quantity;
    let totalMinor = 0;
    for (const p of sorted) {
      const take = Math.min(cap(p), remaining);
      totalMinor += toMinorUnits(p.unitPrice) * take;
      remaining -= take;
      if (remaining === 0) return fromMinorUnits(totalMinor);
    }
    return null;
  };
  const asc = [...usable].sort((a, b) => a.unitPrice - b.unitPrice);
  const min = pick(asc);
  const max = pick([...asc].reverse());
  return min === null || max === null ? null : { min, max };
}

// ─── Presentation helper ──────────────────────────────────────────────────────

/**
 * "Choose 6 from 10 eligible products for 480 EGP" — the one-line summary the
 * admin list shows. Kept here so the dashboard and (later) the storefront
 * describe a campaign identically.
 */
/**
 * THE one-line summary of a campaign's offer, used by the dashboard list, the
 * `/bundles` cards, the homepage rail and the category rail — so they can
 * never word the same campaign differently.
 *
 * A single-tier campaign keeps its stronger, concrete message
 * ("Choose any 6 for 480.00 EGP"). A multi-tier campaign cannot honestly claim
 * one quantity or one price, so it states the range and the entry price
 * ("3-6 pieces - from 270.00 EGP"). The lowest tier is used as the "from"
 * figure because it is the cheapest way in; no tier is labelled best value,
 * since a merchant is free to price 6 above 2x3 and the engine does not
 * editorialise.
 */
export function describeBundleTiers(
  tiers: readonly BundleTier[],
  currency: string,
): string | null {
  const sorted = sortTiers(tiers);
  const lowest = sorted[0];
  const highest = sorted[sorted.length - 1];
  if (lowest === undefined || highest === undefined) return null;
  if (sorted.length === 1) {
    return `${lowest.quantity} piece${lowest.quantity === 1 ? "" : "s"} for ${lowest.price.toFixed(2)} ${currency}`;
  }
  const cheapest = sorted.reduce((a, b) => (toMinorUnits(b.price) < toMinorUnits(a.price) ? b : a));
  return `${lowest.quantity}-${highest.quantity} pieces - from ${cheapest.price.toFixed(2)} ${currency}`;
}

export function describeBundleCampaign(
  config: Pick<BundleCampaignConfig, "requiredQuantity" | "pricingType" | "fixedBundlePrice" | "allowDuplicates" | "isRepeatable"> & {
    type?: BundleCampaignType;
    tiers?: readonly BundleTier[];
  },
  eligibleProductCount: number,
  currency: string,
): string {
  const singlePrice =
    resolveCampaignTiers(config as BundleCampaignConfig)[0]?.price ?? config.fixedBundlePrice;
  const price =
    config.pricingType === "fixed_total" && singlePrice !== null && singlePrice !== undefined
      ? `${singlePrice.toFixed(2)} ${currency}`
      : "—";
  if (config.type === "curated_stack") {
    const units = config.requiredQuantity;
    const base = `${eligibleProductCount} product${eligibleProductCount === 1 ? "" : "s"} · ${units} unit${units === 1 ? "" : "s"} · ${price}`;
    return config.isRepeatable ? `${base} (repeatable)` : base;
  }
  const tiers = resolveCampaignTiers(config as BundleCampaignConfig);
  const pool = `from ${eligibleProductCount} eligible product${eligibleProductCount === 1 ? "" : "s"}`;
  const pick = config.allowDuplicates ? "Choose" : "Choose any";
  // Several tiers: name them all rather than pretending one quantity applies.
  const base =
    tiers.length > 1
      ? `${tiers.map((t) => `${t.quantity} for ${t.price.toFixed(2)} ${currency}`).join(" · ")} ${pool}`
      : `${pick} ${tiers[0]?.quantity ?? config.requiredQuantity} ${pool} for ${price}`;
  return config.isRepeatable ? `${base} (repeatable)` : base;
}
