import { describe, expect, it } from "vitest";
import {
  type BundleCampaignConfig,
  type BundleTier,
  bundlePoolCapacity,
  computeBundleAvailability,
  computeTierAvailability,
  describeBundleTiers,
  evaluateBundleSelection,
  highestBundleTier,
  lowestBundleTier,
  nextBundleTier,
  resolveBundleTier,
  resolveCampaignTiers,
  sortTiers,
  validateBundleCampaignConfig,
  validateBundleTiers,
  valueRangeForTier,
} from "../evaluate";

/**
 * Phase 5 — tiered Build Your Stack pricing.
 *
 * The rule under test everywhere here: a selection buys the tier whose
 * quantity it matches EXACTLY. Nothing rounds down to the tier below, nothing
 * snaps to the nearest, and a count between rungs is simply not a bundle.
 */

const POOL = ["A", "B", "C", "D", "E", "F", "G", "H"];

const tier = (quantity: number, price: number, id: string | null = `t${quantity}`): BundleTier => ({
  id,
  quantity,
  price,
});

/** 3 → 270, 4 → 340, 6 → 480. */
const LADDER = [tier(3, 270), tier(4, 340), tier(6, 480)];

const campaign = (overrides: Partial<BundleCampaignConfig> = {}): BundleCampaignConfig => ({
  type: "build_your_stack",
  requiredQuantity: 3,
  pricingType: "fixed_total",
  fixedBundlePrice: 270,
  tiers: LADDER,
  allowDuplicates: false,
  maxPerProduct: null,
  isRepeatable: false,
  eligibleProductIds: POOL,
  ...overrides,
});

/** N distinct products at 100 each. */
const distinct = (n: number, unitPrice = 100) =>
  POOL.slice(0, n).map((productId) => ({ productId, quantity: 1, unitPrice }));

const stocked = (ids: readonly string[], stock = 5, unitPrice = 100) =>
  ids.map((productId) => ({ productId, stock, purchasable: true, unitPrice }));

// ─── Tier helpers ─────────────────────────────────────────────────────────────

describe("sortTiers", () => {
  it("orders ascending by quantity regardless of input order", () => {
    expect(sortTiers([tier(6, 480), tier(3, 270), tier(4, 340)]).map((t) => t.quantity)).toEqual([3, 4, 6]);
  });

  it("does not mutate the caller's array", () => {
    const input = [tier(6, 480), tier(3, 270)];
    sortTiers(input);
    expect(input.map((t) => t.quantity)).toEqual([6, 3]);
  });
});

describe("resolveCampaignTiers", () => {
  it("returns the stored tiers, sorted", () => {
    expect(resolveCampaignTiers(campaign()).map((t) => t.quantity)).toEqual([3, 4, 6]);
  });

  it("synthesises a single tier from the legacy pair when none are stored", () => {
    const legacy = resolveCampaignTiers({ tiers: [], requiredQuantity: 6, fixedBundlePrice: 480 });
    expect(legacy).toEqual([{ id: null, quantity: 6, price: 480 }]);
  });

  it("returns nothing when there is neither a tier nor a legacy price", () => {
    expect(resolveCampaignTiers({ tiers: [], requiredQuantity: 6, fixedBundlePrice: null })).toEqual([]);
  });
});

describe("resolveBundleTier — exact match only", () => {
  it("matches each configured quantity", () => {
    expect(resolveBundleTier(LADDER, 3)?.price).toBe(270);
    expect(resolveBundleTier(LADDER, 4)?.price).toBe(340);
    expect(resolveBundleTier(LADDER, 6)?.price).toBe(480);
  });

  it("returns null for a count between tiers — never the tier below", () => {
    expect(resolveBundleTier(LADDER, 5)).toBeNull();
  });

  it("returns null below the smallest and above the largest tier", () => {
    expect(resolveBundleTier(LADDER, 2)).toBeNull();
    expect(resolveBundleTier(LADDER, 7)).toBeNull();
  });

  it("returns null for an empty ladder or a zero selection", () => {
    expect(resolveBundleTier([], 3)).toBeNull();
    expect(resolveBundleTier(LADDER, 0)).toBeNull();
  });
});

describe("nextBundleTier / lowest / highest", () => {
  it("points at the next rung up", () => {
    expect(nextBundleTier(LADDER, 0)?.quantity).toBe(3);
    expect(nextBundleTier(LADDER, 2)?.quantity).toBe(3);
    expect(nextBundleTier(LADDER, 3)?.quantity).toBe(4);
    expect(nextBundleTier(LADDER, 5)?.quantity).toBe(6);
  });

  it("has no next rung at or above the largest tier", () => {
    expect(nextBundleTier(LADDER, 6)).toBeNull();
    expect(nextBundleTier(LADDER, 9)).toBeNull();
  });

  it("reports the extremes", () => {
    expect(lowestBundleTier(LADDER)?.quantity).toBe(3);
    expect(highestBundleTier(LADDER)?.quantity).toBe(6);
    expect(lowestBundleTier([])).toBeNull();
    expect(highestBundleTier([])).toBeNull();
  });
});

// ─── Validation ───────────────────────────────────────────────────────────────

describe("validateBundleTiers", () => {
  it("accepts a well-formed ladder", () => {
    expect(validateBundleTiers(LADDER, { requireAtLeastOne: true })).toBeNull();
  });

  it("accepts a single tier", () => {
    expect(validateBundleTiers([tier(6, 480)], { requireAtLeastOne: true })).toBeNull();
  });

  it("rejects duplicate quantities", () => {
    expect(validateBundleTiers([tier(3, 270), tier(3, 280)], { requireAtLeastOne: true })).toMatch(
      /same quantity/i,
    );
  });

  it("rejects a zero or negative quantity", () => {
    expect(validateBundleTiers([tier(0, 270)], { requireAtLeastOne: true })).toMatch(/at least 1/i);
    expect(validateBundleTiers([tier(-2, 270)], { requireAtLeastOne: true })).toMatch(/at least 1/i);
  });

  it("rejects a fractional quantity", () => {
    expect(validateBundleTiers([{ id: null, quantity: 2.5, price: 270 }], { requireAtLeastOne: true })).toMatch(
      /whole quantity/i,
    );
  });

  it("rejects a zero or negative price", () => {
    expect(validateBundleTiers([tier(3, 0)], { requireAtLeastOne: true })).toMatch(/greater than 0/i);
    expect(validateBundleTiers([tier(3, -10)], { requireAtLeastOne: true })).toMatch(/greater than 0/i);
  });

  it("rejects more than two decimals on a price", () => {
    expect(validateBundleTiers([tier(3, 270.005)], { requireAtLeastOne: true })).toMatch(/two decimals/i);
  });

  it("requires a tier only when asked", () => {
    expect(validateBundleTiers([], { requireAtLeastOne: true })).toMatch(/at least one pricing tier/i);
    expect(validateBundleTiers([], { requireAtLeastOne: false })).toBeNull();
  });
});

describe("validateBundleCampaignConfig — activation", () => {
  it("refuses to activate a Build Your Stack campaign with no tiers", () => {
    const config = campaign({ tiers: [], fixedBundlePrice: null });
    expect(validateBundleCampaignConfig(config, { requireCompletablePool: true })).toMatch(
      /at least one pricing tier/i,
    );
  });

  it("activates when the pool can complete the SMALLEST tier, even if larger ones cannot", () => {
    // Four eligible products, duplicates off: the 3- and 4-tiers are
    // completable, the 6-tier is not. That is a per-tier availability fact,
    // not a reason to block the campaign.
    const config = campaign({ eligibleProductIds: ["A", "B", "C", "D"] });
    expect(validateBundleCampaignConfig(config, { requireCompletablePool: true })).toBeNull();
  });

  it("refuses when the pool cannot even complete the smallest tier", () => {
    const config = campaign({ eligibleProductIds: ["A", "B"] });
    expect(validateBundleCampaignConfig(config, { requireCompletablePool: true })).toMatch(/smallest tier/i);
  });

  it("still allows a draft with an unfinished pool", () => {
    expect(
      validateBundleCampaignConfig(campaign({ eligibleProductIds: [] }), { requireCompletablePool: false }),
    ).toBeNull();
  });
});

// ─── Evaluation ───────────────────────────────────────────────────────────────

describe("evaluateBundleSelection — tier matching", () => {
  it("prices 3 units at the 3-tier", () => {
    const result = evaluateBundleSelection(campaign(), distinct(3));
    expect(result.qualifies).toBe(true);
    expect(result.tier?.quantity).toBe(3);
    expect(result.bundleTotal).toBe(270);
    expect(result.regularTotal).toBe(300);
    expect(result.discountAmount).toBe(30);
  });

  it("prices 4 units at the 4-tier — not the 3-tier plus an item", () => {
    const result = evaluateBundleSelection(campaign(), distinct(4));
    expect(result.qualifies).toBe(true);
    expect(result.tier?.quantity).toBe(4);
    expect(result.bundleTotal).toBe(340);
  });

  it("prices 6 units at the 6-tier rather than two 3-tiers", () => {
    const result = evaluateBundleSelection(campaign(), distinct(6));
    expect(result.qualifies).toBe(true);
    expect(result.tier?.quantity).toBe(6);
    expect(result.bundleTotal).toBe(480);
  });

  it("refuses 5 units with no_matching_tier and quotes no price", () => {
    const result = evaluateBundleSelection(campaign(), distinct(5));
    expect(result.qualifies).toBe(false);
    expect(result.reason).toBe("no_matching_tier");
    expect(result.tier).toBeNull();
    expect(result.bundleTotal).toBeNull();
    expect(result.discountAmount).toBeNull();
  });

  it("treats a count below the smallest tier as progress, not a gap", () => {
    const result = evaluateBundleSelection(campaign(), distinct(2));
    expect(result.reason).toBe("not_enough_units");
    expect(result.nextTier?.quantity).toBe(3);
    expect(result.remainingUnitsNeeded).toBe(1);
  });

  it("treats a count above the largest tier as too many", () => {
    const result = evaluateBundleSelection(campaign(), distinct(7));
    expect(result.reason).toBe("too_many_units");
    expect(result.tier).toBeNull();
  });

  it("reports the next rung while the shopper climbs", () => {
    expect(evaluateBundleSelection(campaign(), distinct(0)).nextTier?.quantity).toBe(3);
    expect(evaluateBundleSelection(campaign(), distinct(3)).nextTier?.quantity).toBe(4);
    expect(evaluateBundleSelection(campaign(), distinct(4)).nextTier?.quantity).toBe(6);
    expect(evaluateBundleSelection(campaign(), distinct(5)).nextTier?.quantity).toBe(6);
  });

  it("has no next rung once the largest tier is matched", () => {
    const result = evaluateBundleSelection(campaign(), distinct(6));
    expect(result.nextTier).toBeNull();
    expect(result.remainingUnitsNeeded).toBe(0);
  });

  it("refuses a campaign with no tiers at all", () => {
    const result = evaluateBundleSelection(campaign({ tiers: [], fixedBundlePrice: null }), distinct(3));
    expect(result.qualifies).toBe(false);
    expect(result.reason).toBe("no_tiers_configured");
  });
});

describe("evaluateBundleSelection — savings are reported truthfully", () => {
  it("reports a positive saving", () => {
    const result = evaluateBundleSelection(campaign(), distinct(3, 100));
    expect(result.discountAmount).toBe(30);
  });

  it("reports exactly zero when the tier price equals the regular value", () => {
    const result = evaluateBundleSelection(campaign(), distinct(3, 90));
    expect(result.regularTotal).toBe(270);
    expect(result.discountAmount).toBe(0);
  });

  it("keeps a NEGATIVE saving rather than clamping it to zero", () => {
    // Three products at 80 = 240 regular, but the 3-tier costs 270.
    const result = evaluateBundleSelection(campaign(), distinct(3, 80));
    expect(result.regularTotal).toBe(240);
    expect(result.bundleTotal).toBe(270);
    expect(result.discountAmount).toBe(-30);
  });

  it("does not drift on repeating decimals", () => {
    const result = evaluateBundleSelection(campaign(), distinct(3, 79.99));
    expect(result.regularTotal).toBe(239.97);
    expect(result.discountAmount).toBe(-30.03);
  });
});

describe("evaluateBundleSelection — tier matching with duplicates", () => {
  it("counts duplicate units toward the tier when they are allowed", () => {
    const config = campaign({ allowDuplicates: true, maxPerProduct: 3 });
    const result = evaluateBundleSelection(config, [
      { productId: "A", quantity: 2, unitPrice: 100 },
      { productId: "B", quantity: 2, unitPrice: 100 },
    ]);
    expect(result.tier?.quantity).toBe(4);
    expect(result.bundleTotal).toBe(340);
  });

  it("still refuses a gap reached via duplicates", () => {
    const config = campaign({ allowDuplicates: true, maxPerProduct: 3 });
    const result = evaluateBundleSelection(config, [
      { productId: "A", quantity: 3, unitPrice: 100 },
      { productId: "B", quantity: 2, unitPrice: 100 },
    ]);
    expect(result.reason).toBe("no_matching_tier");
  });
});

describe("legacy single-tier campaigns are untouched", () => {
  const legacy = (overrides: Partial<BundleCampaignConfig> = {}) =>
    campaign({ tiers: [], requiredQuantity: 6, fixedBundlePrice: 480, ...overrides });

  it("prices 6 units from the legacy pair exactly as before", () => {
    const result = evaluateBundleSelection(legacy(), distinct(6));
    expect(result.qualifies).toBe(true);
    expect(result.bundleTotal).toBe(480);
    expect(result.tier).toEqual({ id: null, quantity: 6, price: 480 });
  });

  it("keeps the repeatable multiple-of-quantity behaviour for a single tier", () => {
    const config = legacy({ isRepeatable: true, allowDuplicates: true });
    const result = evaluateBundleSelection(config, [
      { productId: "A", quantity: 6, unitPrice: 100 },
      { productId: "B", quantity: 6, unitPrice: 100 },
    ]);
    expect(result.completeBundles).toBe(2);
    expect(result.bundleTotal).toBe(960);
  });

  it("does NOT extend that multiple behaviour to a multi-tier campaign", () => {
    // 12 against 3/4/6 could be 4x3, 3x4 or 2x6 — ambiguous, so the domain
    // refuses rather than guessing. Repeat purchases are separate instances.
    const config = campaign({ isRepeatable: true, allowDuplicates: true, maxPerProduct: 6 });
    const result = evaluateBundleSelection(config, [
      { productId: "A", quantity: 6, unitPrice: 100 },
      { productId: "B", quantity: 6, unitPrice: 100 },
    ]);
    expect(result.qualifies).toBe(false);
    expect(result.completeBundles).toBe(0);
  });
});

// ─── Capacity & availability ──────────────────────────────────────────────────

describe("bundlePoolCapacity", () => {
  it("counts one unit per purchasable product when duplicates are off", () => {
    expect(bundlePoolCapacity(campaign(), stocked(["A", "B", "C"]))).toBe(3);
  });

  it("counts stock when duplicates are on and uncapped", () => {
    expect(bundlePoolCapacity(campaign({ allowDuplicates: true }), stocked(["A"], 6))).toBe(6);
  });

  it("respects max-per-product", () => {
    expect(bundlePoolCapacity(campaign({ allowDuplicates: true, maxPerProduct: 2 }), stocked(["A"], 10))).toBe(2);
  });

  it("ignores out-of-stock and non-purchasable products", () => {
    const products = [
      { productId: "A", stock: 0, purchasable: true, unitPrice: 100 },
      { productId: "B", stock: 5, purchasable: false, unitPrice: 100 },
      { productId: "C", stock: 5, purchasable: true, unitPrice: 100 },
    ];
    expect(bundlePoolCapacity(campaign(), products)).toBe(1);
  });

  it("ignores products outside the eligible pool", () => {
    expect(bundlePoolCapacity(campaign({ eligibleProductIds: ["A"] }), stocked(["A", "B", "C"]))).toBe(1);
  });
});

describe("computeTierAvailability", () => {
  it("marks each rung independently against the current pool", () => {
    // Capacity 4, duplicates off.
    const result = computeTierAvailability(campaign(), stocked(["A", "B", "C", "D"]));
    expect(result.map((r) => [r.tier.quantity, r.availability])).toEqual([
      [3, "available"],
      [4, "available"],
      [6, "sold_out"],
    ]);
  });

  it("opens the larger rungs when duplicates lift capacity", () => {
    const config = campaign({ allowDuplicates: true, eligibleProductIds: ["A"] });
    const result = computeTierAvailability(config, stocked(["A"], 6));
    expect(result.every((r) => r.availability === "available")).toBe(true);
  });

  it("closes rungs that max-per-product puts out of reach", () => {
    const config = campaign({ allowDuplicates: true, maxPerProduct: 2, eligibleProductIds: ["A"] });
    const result = computeTierAvailability(config, stocked(["A"], 10));
    // Capacity is 2 — below every rung.
    expect(result.every((r) => r.availability === "sold_out")).toBe(true);
  });
});

describe("computeBundleAvailability — campaign level", () => {
  it("is available when ANY tier can be completed", () => {
    expect(computeBundleAvailability(campaign(), stocked(["A", "B", "C", "D"]))).toBe("available");
  });

  it("is sold out only when no tier can be completed", () => {
    expect(computeBundleAvailability(campaign(), stocked(["A", "B"]))).toBe("sold_out");
  });

  it("is sold out when the pool is entirely out of stock", () => {
    expect(computeBundleAvailability(campaign(), stocked(POOL, 0))).toBe("sold_out");
  });

  it("is sold out when the campaign has no tiers", () => {
    const config = campaign({ tiers: [], fixedBundlePrice: null });
    expect(computeBundleAvailability(config, stocked(POOL))).toBe("sold_out");
  });

  it("matches pre-Phase-5 behaviour for a legacy single-tier campaign", () => {
    const legacy = campaign({ tiers: [], requiredQuantity: 6, fixedBundlePrice: 480 });
    expect(computeBundleAvailability(legacy, stocked(["A", "B", "C", "D", "E", "F"]))).toBe("available");
    expect(computeBundleAvailability(legacy, stocked(["A", "B", "C"]))).toBe("sold_out");
  });
});

// ─── Value ranges ─────────────────────────────────────────────────────────────

describe("valueRangeForTier", () => {
  const priced = [
    { productId: "A", stock: 5, purchasable: true, unitPrice: 50 },
    { productId: "B", stock: 5, purchasable: true, unitPrice: 100 },
    { productId: "C", stock: 5, purchasable: true, unitPrice: 150 },
    { productId: "D", stock: 5, purchasable: true, unitPrice: 200 },
  ];

  it("uses the cheapest and dearest products for that exact quantity", () => {
    expect(valueRangeForTier(campaign(), priced, 3)).toEqual({ min: 300, max: 450 });
  });

  it("gives a genuinely different range per tier", () => {
    expect(valueRangeForTier(campaign(), priced, 4)).toEqual({ min: 500, max: 500 });
  });

  it("returns null when the pool cannot fill the quantity", () => {
    expect(valueRangeForTier(campaign(), priced, 6)).toBeNull();
  });

  it("rejects a nonsensical quantity", () => {
    expect(valueRangeForTier(campaign(), priced, 0)).toBeNull();
    expect(valueRangeForTier(campaign(), priced, 2.5)).toBeNull();
  });
});

// ─── Summary copy ─────────────────────────────────────────────────────────────

describe("describeBundleTiers", () => {
  it("keeps the concrete message for a single tier", () => {
    expect(describeBundleTiers([tier(6, 480)], "EGP")).toBe("6 pieces for 480.00 EGP");
  });

  it("states the span and the cheapest entry price for several tiers", () => {
    expect(describeBundleTiers(LADDER, "EGP")).toBe("3-6 pieces - from 270.00 EGP");
  });

  it("quotes the cheapest PRICE, not the smallest quantity's price", () => {
    // A merchant may price 6 below 3 — "from" must be payable.
    expect(describeBundleTiers([tier(3, 300), tier(6, 280)], "EGP")).toBe("3-6 pieces - from 280.00 EGP");
  });

  it("returns null when there is nothing to describe", () => {
    expect(describeBundleTiers([], "EGP")).toBeNull();
  });
});
