import { describe, expect, it } from "vitest";
import {
  ALL_PRODUCTS_ELIGIBLE,
  checkEligibleQuantity,
  describeQuantityRule,
  eligibilityFromProductIds,
  isProductEligible,
  percentOfMinor,
  quantityRuleFromType,
  quantityRuleRejection,
  quantityRuleType,
  summarizeEligibleUnits,
  validateDiscountPercent,
  validateQuantityRule,
} from "../eligible-units";
import { effectiveUnitPrice, effectiveUnitPriceFromRow } from "../effective-price";

const exactly = (n: number) => ({ minQuantity: n, maxQuantity: n });

describe("quantity rules", () => {
  it("derives the rule type from the stored (min, max) pair", () => {
    expect(quantityRuleType({ minQuantity: null, maxQuantity: null })).toBe("none");
    expect(quantityRuleType(null)).toBe("none");
    expect(quantityRuleType(exactly(3))).toBe("exact");
    expect(quantityRuleType({ minQuantity: 3, maxQuantity: null })).toBe("min");
    expect(quantityRuleType({ minQuantity: null, maxQuantity: 6 })).toBe("max");
    expect(quantityRuleType({ minQuantity: 3, maxQuantity: 6 })).toBe("range");
  });

  it("maps the admin form's rule type back to the pair it stores", () => {
    expect(quantityRuleFromType("exact", { exact: 6 })).toEqual(exactly(6));
    expect(quantityRuleFromType("min", { min: 2, max: 9 })).toEqual({ minQuantity: 2, maxQuantity: null });
    expect(quantityRuleFromType("max", { min: 2, max: 9 })).toEqual({ minQuantity: null, maxQuantity: 9 });
    expect(quantityRuleFromType("range", { min: 2, max: 9 })).toEqual({ minQuantity: 2, maxQuantity: 9 });
    expect(quantityRuleFromType("none", { exact: 6 })).toEqual({ minQuantity: null, maxQuantity: null });
  });

  it("rejects impossible configurations", () => {
    expect(validateQuantityRule({ minQuantity: 6, maxQuantity: 3 })).toMatch(/cannot be greater/);
    expect(validateQuantityRule({ minQuantity: 0, maxQuantity: null })).toMatch(/whole numbers/);
    expect(validateQuantityRule({ minQuantity: 2.5, maxQuantity: null })).toMatch(/whole numbers/);
    expect(validateQuantityRule(exactly(3))).toBeNull();
    expect(validateQuantityRule({ minQuantity: null, maxQuantity: null })).toBeNull();
  });

  it("PICK3 (exactly 3) accepts only 3 eligible units", () => {
    const results = [1, 2, 3, 4, 5, 6, 7].map((n) => checkEligibleQuantity(exactly(3), n).ok);
    expect(results).toEqual([false, false, true, false, false, false, false]);
  });

  it("PICK6 (exactly 6) accepts only 6 eligible units", () => {
    const results = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => checkEligibleQuantity(exactly(6), n).ok);
    expect(results).toEqual([false, false, false, false, false, true, false, false]);
  });

  it("min / max / range bounds are inclusive", () => {
    expect(checkEligibleQuantity({ minQuantity: 3, maxQuantity: null }, 3).ok).toBe(true);
    expect(checkEligibleQuantity({ minQuantity: 3, maxQuantity: null }, 2).ok).toBe(false);
    expect(checkEligibleQuantity({ minQuantity: null, maxQuantity: 6 }, 6).ok).toBe(true);
    expect(checkEligibleQuantity({ minQuantity: null, maxQuantity: 6 }, 7).ok).toBe(false);
    expect(checkEligibleQuantity({ minQuantity: 3, maxQuantity: 6 }, 4).ok).toBe(true);
    expect(checkEligibleQuantity(null, 99).ok).toBe(true);
  });

  it("explains a failed rule in customer language", () => {
    const below = checkEligibleQuantity(exactly(6), 5);
    if (below.ok) throw new Error("expected a failure");
    expect(below.reason).toBe("below_min");
    expect(quantityRuleRejection("PICK6", below)).toBe(
      "PICK6 needs exactly 6 eligible pieces. Your cart has 5 eligible pieces.",
    );
    const above = checkEligibleQuantity(exactly(6), 7);
    if (above.ok) throw new Error("expected a failure");
    expect(above.reason).toBe("above_max");
    expect(describeQuantityRule({ minQuantity: 3, maxQuantity: 6 })).toBe("between 3 and 6 eligible pieces");
    expect(describeQuantityRule({ minQuantity: null, maxQuantity: null })).toBeNull();
  });
});

describe("percentage money math", () => {
  it("15% of 1,075.00 is exactly 161.25 (the brief's example)", () => {
    expect(percentOfMinor(107500, 15)).toBe(16125);
    expect(107500 - percentOfMinor(107500, 15)).toBe(91375);
  });

  it("rounds once, half-up, to the piaster", () => {
    // 12.5% of 1.01 = 0.12625 → 0.13
    expect(percentOfMinor(101, 12.5)).toBe(13);
    // 20% of 0.03 = 0.006 → 0.01
    expect(percentOfMinor(3, 20)).toBe(1);
    // 20% of 0.02 = 0.004 → 0.00
    expect(percentOfMinor(2, 20)).toBe(0);
  });

  it("never discounts a non-positive base or percent", () => {
    expect(percentOfMinor(0, 15)).toBe(0);
    expect(percentOfMinor(1000, 0)).toBe(0);
  });

  it("only accepts percentages in (0, 100) with at most two decimals", () => {
    expect(validateDiscountPercent(15)).toBeNull();
    expect(validateDiscountPercent(12.5)).toBeNull();
    expect(validateDiscountPercent(0)).not.toBeNull();
    expect(validateDiscountPercent(100)).not.toBeNull();
    expect(validateDiscountPercent(12.345)).not.toBeNull();
    expect(validateDiscountPercent(Number.NaN)).not.toBeNull();
  });
});

describe("promo eligibility", () => {
  const rules = {
    appliesToAllProducts: false,
    productIds: ["listed"],
    categoryIds: ["earrings"],
    excludedProductIds: ["three-piece-set"],
  };

  it("accepts listed products and products in listed categories", () => {
    expect(isProductEligible(rules, "listed", undefined)).toBe(true);
    expect(isProductEligible(rules, "stud", ["earrings"])).toBe(true);
    expect(isProductEligible(rules, "ring", ["rings"])).toBe(false);
  });

  it("exclusions win over category and all-products eligibility", () => {
    expect(isProductEligible(rules, "three-piece-set", ["earrings"])).toBe(false);
    expect(
      isProductEligible({ ...ALL_PRODUCTS_ELIGIBLE, excludedProductIds: ["three-piece-set"] }, "three-piece-set", []),
    ).toBe(false);
    expect(isProductEligible(ALL_PRODUCTS_ELIGIBLE, "anything", undefined)).toBe(true);
  });

  it("counts UNITS, not lines — 3 of one SKU is 3 eligible units", () => {
    const summary = summarizeEligibleUnits(
      [
        { id: "stud", quantity: 3, price: 100, categoryIds: ["earrings"] },
        { id: "three-piece-set", quantity: 1, price: 250, categoryIds: ["earrings"] },
        { id: "ring", quantity: 2, price: 200, categoryIds: ["rings"] },
      ],
      rules,
    );
    expect(summary.units).toBe(3);
    expect(summary.subtotalMinor).toBe(30000);
    expect(summary.lineIndexes).toEqual([0]);
  });

  it("a server-resolved id list means exactly those products", () => {
    const resolved = eligibilityFromProductIds(["a", "b"]);
    expect(isProductEligible(resolved, "a", undefined)).toBe(true);
    expect(isProductEligible(resolved, "c", ["earrings"])).toBe(false);
  });
});

describe("effective (sale) price — the one rule every pricing path uses", () => {
  it("a valid sale price below the regular price is the effective price", () => {
    expect(effectiveUnitPrice(200, 150)).toBe(150);
    expect(effectiveUnitPriceFromRow({ price: "200.00", discountPrice: "150.00" })).toBe(150);
  });

  it("no sale price, or a 'sale' price at/above the regular price, means the regular price", () => {
    expect(effectiveUnitPrice(200, null)).toBe(200);
    expect(effectiveUnitPrice(200, undefined)).toBe(200);
    expect(effectiveUnitPrice(200, 200)).toBe(200);
    expect(effectiveUnitPrice(200, 260)).toBe(200);
    expect(effectiveUnitPrice(200, -5)).toBe(200);
    expect(effectiveUnitPriceFromRow({ price: "200.00", discountPrice: null })).toBe(200);
  });

  it("a percentage promotion is computed on the effective price — never on the pre-sale price as well", () => {
    // Regular 200, on sale at 150: PICK-style 20% takes 30 off the 150 the
    // shopper would otherwise pay. The 50 sale reduction is a catalogue
    // price, not a second promotional discount computed by the engine.
    const unit = effectiveUnitPrice(200, 150);
    expect(percentOfMinor(Math.round(unit * 100), 20)).toBe(3000);
  });
});
