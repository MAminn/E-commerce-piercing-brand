import { describe, expect, it } from "vitest";
import {
  type BundleCampaignConfig,
  describeBundleCampaign,
  describeBundleTiers,
  describeTierOffer,
  evaluateBundleSelection,
  validateBundleCampaignConfig,
  validateBundleTiers,
} from "../evaluate";

/**
 * Pick Your Set PERCENTAGE pricing: each tier takes a percentage off the
 * selected units' effective prices. The fixed-total path is covered by
 * tiers.test.ts and must be unaffected.
 */
const POOL = ["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8"];

const percentCampaign = (overrides: Partial<BundleCampaignConfig> = {}): BundleCampaignConfig => ({
  type: "build_your_stack",
  requiredQuantity: 3,
  pricingType: "percentage_discount",
  fixedBundlePrice: null,
  allowDuplicates: true,
  maxPerProduct: null,
  isRepeatable: false,
  tiers: [
    { id: "t3", quantity: 3, price: null, discountPercent: 20 },
    { id: "t6", quantity: 6, price: null, discountPercent: 15 },
  ],
  eligibleProductIds: POOL,
  ...overrides,
});

/** Six selected units worth 1,075.00 — the brief's example. */
const sixSelected = [
  { productId: "e1", quantity: 1, unitPrice: 150 },
  { productId: "e2", quantity: 1, unitPrice: 150 },
  { productId: "e3", quantity: 1, unitPrice: 175 },
  { productId: "e4", quantity: 1, unitPrice: 200 },
  { productId: "e5", quantity: 2, unitPrice: 200 },
];

describe("percentage tiers — pricing", () => {
  it("6 selected pieces → 15%: subtotal 1,075, discount 161.25, final 913.75", () => {
    const result = evaluateBundleSelection(percentCampaign(), sixSelected);
    expect(result.qualifies).toBe(true);
    expect(result.tier?.discountPercent).toBe(15);
    expect(result.regularTotal).toBe(1075);
    expect(result.discountAmount).toBe(161.25);
    expect(result.bundleTotal).toBe(913.75);
  });

  it("3 selected pieces → 20% of their own subtotal", () => {
    const result = evaluateBundleSelection(percentCampaign(), [
      { productId: "e1", quantity: 1, unitPrice: 120 },
      { productId: "e2", quantity: 1, unitPrice: 135.5 },
      { productId: "e3", quantity: 1, unitPrice: 99.99 },
    ]);
    // 355.49 × 20% = 71.098 → 71.10 (one half-up rounding)
    expect(result.regularTotal).toBe(355.49);
    expect(result.discountAmount).toBe(71.1);
    expect(result.bundleTotal).toBe(284.39);
  });

  it("a count between or beyond the configured pieces is not priced", () => {
    for (const quantity of [1, 2, 4, 5, 7]) {
      const result = evaluateBundleSelection(percentCampaign(), [{ productId: "e1", quantity, unitPrice: 100 }]);
      expect(result.qualifies).toBe(false);
      expect(result.bundleTotal).toBeNull();
      expect(result.discountAmount).toBeNull();
    }
  });

  it("keeps the campaign's duplicate controls", () => {
    const strict = percentCampaign({ allowDuplicates: false });
    const result = evaluateBundleSelection(strict, [
      { productId: "e1", quantity: 2, unitPrice: 100 },
      { productId: "e2", quantity: 1, unitPrice: 100 },
    ]);
    expect(result.qualifies).toBe(false);
    expect(result.reason).toBe("duplicates_not_allowed");
  });

  it("a repeatable single-tier campaign discounts every counted unit", () => {
    const single = percentCampaign({
      isRepeatable: true,
      tiers: [{ id: "t3", quantity: 3, price: null, discountPercent: 20 }],
    });
    const result = evaluateBundleSelection(single, [{ productId: "e1", quantity: 6, unitPrice: 100 }]);
    expect(result.completeBundles).toBe(2);
    expect(result.bundleTotal).toBe(480);
    expect(result.discountAmount).toBe(120);
  });

  it("a percentage tier never prices under a fixed-total campaign (and vice versa)", () => {
    const mismatched = percentCampaign({ pricingType: "fixed_total", fixedBundlePrice: 100 });
    const result = evaluateBundleSelection(mismatched, sixSelected);
    expect(result.bundleTotal).toBeNull();
  });
});

describe("percentage tiers — configuration", () => {
  it("requires a percentage in (0, 100) on every tier", () => {
    const percentage = { requireAtLeastOne: true, pricingType: "percentage_discount" as const };
    expect(validateBundleTiers([{ id: null, quantity: 3, price: null, discountPercent: 20 }], percentage)).toBeNull();
    expect(validateBundleTiers([{ id: null, quantity: 3, price: null, discountPercent: 0 }], percentage)).toMatch(/discount/);
    expect(validateBundleTiers([{ id: null, quantity: 3, price: null, discountPercent: 100 }], percentage)).toMatch(/discount/);
    expect(validateBundleTiers([{ id: null, quantity: 3, price: 270, discountPercent: null }], percentage)).toMatch(/discount/);
  });

  it("fixed-total validation is unchanged (and ignores percentages)", () => {
    const fixed = { requireAtLeastOne: true, pricingType: "fixed_total" as const };
    expect(validateBundleTiers([{ id: null, quantity: 3, price: 270 }], fixed)).toBeNull();
    expect(validateBundleTiers([{ id: null, quantity: 3, price: null, discountPercent: 20 }], fixed)).toMatch(/price/);
    expect(validateBundleTiers([{ id: null, quantity: 3, price: 270 }], { requireAtLeastOne: true })).toBeNull();
  });

  it("a complete percentage campaign validates without any fixed price", () => {
    expect(validateBundleCampaignConfig(percentCampaign(), { requireCompletablePool: true })).toBeNull();
  });

  it("a Ready Set (curated stack) cannot use percentage pricing", () => {
    const curated = percentCampaign({
      type: "curated_stack",
      tiers: [],
      composition: [{ productId: "e1", quantity: 3 }],
      requiredQuantity: 3,
    });
    expect(validateBundleCampaignConfig(curated, { requireCompletablePool: false })).toMatch(/Ready Set/);
  });
});

describe("percentage tiers — wording", () => {
  it("describes the discount, never an invented price", () => {
    const tiers = percentCampaign().tiers ?? [];
    expect(describeBundleTiers(tiers, "EGP")).toBe("3-6 pieces - up to 20% off");
    expect(describeBundleTiers([tiers[1]!], "EGP")).toBe("6 pieces - 15% off");
    expect(describeTierOffer(tiers[0]!, "EGP")).toBe("20% off");
    expect(describeTierOffer({ id: null, quantity: 6, price: 480 }, "EGP")).toBe("480.00 EGP");
    expect(describeBundleCampaign(percentCampaign(), 8, "EGP")).toBe("3 at 20% off · 6 at 15% off from 8 eligible products");
  });

  it("fixed-total wording is unchanged", () => {
    expect(describeBundleTiers([{ id: null, quantity: 6, price: 480 }], "EGP")).toBe("6 pieces for 480.00 EGP");
  });
});
