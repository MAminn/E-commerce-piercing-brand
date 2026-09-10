import { describe, expect, it } from "vitest";
import { computePromoDiscount, deriveEffectiveShipping } from "../cart-math";

describe("computePromoDiscount", () => {
  it("applies a percentage discount to the raw subtotal when no offer discount is active", () => {
    expect(computePromoDiscount("percentage", 5, 1950, 0)).toBeCloseTo(97.5);
  });

  it("applies a percentage discount to the subtotal AFTER offer discount, not the raw subtotal (regression: was stacking on raw subtotal)", () => {
    // Matches the client's reported case: 1950 subtotal, 650 offer savings,
    // 5% promo code — the 5% must land on 1300, not 1950.
    expect(computePromoDiscount("percentage", 5, 1950, 650)).toBeCloseTo(65);
    expect(computePromoDiscount("percentage", 5, 1950, 650)).not.toBeCloseTo(97.5);
  });

  it("applies a fixed-amount discount capped at the post-offer subtotal, not the raw one", () => {
    expect(computePromoDiscount("fixed_amount", 100, 1950, 650)).toBe(100);
    // Fixed discount larger than what's left after the offer discount should
    // cap at what's left, not at the raw subtotal.
    expect(computePromoDiscount("fixed_amount", 2000, 1950, 650)).toBe(1300);
  });

  it("never goes negative when the offer discount alone exceeds the subtotal", () => {
    expect(computePromoDiscount("percentage", 10, 100, 500)).toBe(0);
    expect(computePromoDiscount("fixed_amount", 50, 100, 500)).toBe(0);
  });
});

describe("deriveEffectiveShipping", () => {
  const baseFee = 80;

  it("returns the base shipping fee when no offer grants free shipping", () => {
    expect(deriveEffectiveShipping(baseFee, [])).toBe(baseFee);
    expect(deriveEffectiveShipping(baseFee, [{ freeShipping: false }])).toBe(baseFee);
  });

  it("returns 0 when an applied offer grants free shipping", () => {
    expect(deriveEffectiveShipping(baseFee, [{ freeShipping: true }])).toBe(0);
  });

  it("restores the base fee once the free-shipping offer no longer applies (regression: client's add/remove-item scenario)", () => {
    // 3 items — below whatever threshold the offer needs — no free shipping.
    let applied: { freeShipping: boolean }[] = [];
    expect(deriveEffectiveShipping(baseFee, applied)).toBe(baseFee);

    // 4th item added — threshold met, free shipping kicks in.
    applied = [{ freeShipping: true }];
    expect(deriveEffectiveShipping(baseFee, applied)).toBe(0);

    // Minus button pressed back down to 3 items — this is exactly the step
    // that used to stay stuck at 0 because shipping was toggled with a
    // one-way `setShipping(0)` and nothing ever set it back.
    applied = [];
    expect(deriveEffectiveShipping(baseFee, applied)).toBe(baseFee);
  });

  it("stays free across multiple re-evaluations while still above threshold", () => {
    const applied = [{ freeShipping: true }];
    expect(deriveEffectiveShipping(baseFee, applied)).toBe(0);
    expect(deriveEffectiveShipping(baseFee, applied)).toBe(0);
  });
});
