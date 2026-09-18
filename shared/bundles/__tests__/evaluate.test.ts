import { describe, expect, it } from "vitest";
import {
  type BundleCampaignConfig,
  type BundleSelectionUnit,
  describeBundleCampaign,
  evaluateBundleSelection,
  fromMinorUnits,
  getBundleCampaignState,
  isBundleCampaignLive,
  toMinorUnits,
  validateBundleCampaignConfig,
  validateBundleCampaignSchedule,
} from "../evaluate";

// Ten eligible products A..J, mirroring the brief's example.
const POOL = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

/** "Build Your Stack": choose exactly 6 for 480. */
const stack6for480 = (overrides: Partial<BundleCampaignConfig> = {}): BundleCampaignConfig => ({
  type: "build_your_stack",
  requiredQuantity: 6,
  pricingType: "fixed_total",
  fixedBundlePrice: 480,
  allowDuplicates: false,
  maxPerProduct: null,
  isRepeatable: false,
  eligibleProductIds: POOL,
  ...overrides,
});

const unit = (productId: string, quantity = 1, unitPrice = 100): BundleSelectionUnit => ({
  productId,
  quantity,
  unitPrice,
});

const distinct = (ids: string[], unitPrice = 100) => ids.map((id) => unit(id, 1, unitPrice));

describe("validateBundleCampaignConfig — campaign invariants", () => {
  it("accepts a valid fixed-total campaign", () => {
    expect(validateBundleCampaignConfig(stack6for480(), { requireCompletablePool: true })).toBeNull();
  });

  it("rejects requiredQuantity below 1 or non-integer", () => {
    expect(validateBundleCampaignConfig(stack6for480({ requiredQuantity: 0 }), { requireCompletablePool: false })).toMatch(/at least 1/);
    expect(validateBundleCampaignConfig(stack6for480({ requiredQuantity: 2.5 }), { requireCompletablePool: false })).toMatch(/whole number/);
  });

  it("rejects a fixed-total price that is missing, zero or negative", () => {
    // Phase 5: a Build Your Stack campaign with neither tiers nor a legacy
    // price has no pricing configured at all, and the actionable instruction
    // is to add a tier — the CMS no longer offers it a bare price field.
    expect(validateBundleCampaignConfig(stack6for480({ fixedBundlePrice: null }), { requireCompletablePool: false })).toMatch(/at least one pricing tier/);
    expect(validateBundleCampaignConfig(stack6for480({ fixedBundlePrice: 0 }), { requireCompletablePool: false })).toMatch(/greater than 0/);
    expect(validateBundleCampaignConfig(stack6for480({ fixedBundlePrice: -10 }), { requireCompletablePool: false })).toMatch(/greater than 0/);
  });

  it("rejects maxPerProduct when duplicates are off", () => {
    expect(
      validateBundleCampaignConfig(stack6for480({ allowDuplicates: false, maxPerProduct: 2 }), { requireCompletablePool: false }),
    ).toMatch(/only applies when duplicates/);
  });

  it("rejects a duplicated eligible product id", () => {
    expect(
      validateBundleCampaignConfig(stack6for480({ eligibleProductIds: ["A", "B", "A"] }), { requireCompletablePool: false }),
    ).toMatch(/more than once/);
  });

  it("lets a draft be saved with an empty pool but refuses to activate it", () => {
    const draft = stack6for480({ eligibleProductIds: [] });
    expect(validateBundleCampaignConfig(draft, { requireCompletablePool: false })).toBeNull();
    expect(validateBundleCampaignConfig(draft, { requireCompletablePool: true })).toMatch(/at least one eligible product/);
  });

  it("refuses to activate when duplicates are off and the pool is smaller than the required quantity", () => {
    const tooSmall = stack6for480({ eligibleProductIds: ["A", "B", "C", "D", "E"] });
    expect(validateBundleCampaignConfig(tooSmall, { requireCompletablePool: true })).toMatch(/at least 6 eligible products/);
  });

  it("refuses to activate when pool × maxPerProduct can't reach the required quantity", () => {
    const capped = stack6for480({ eligibleProductIds: ["A", "B"], allowDuplicates: true, maxPerProduct: 2 });
    expect(validateBundleCampaignConfig(capped, { requireCompletablePool: true })).toMatch(/only pick 4 unit/);
    const enough = stack6for480({ eligibleProductIds: ["A", "B"], allowDuplicates: true, maxPerProduct: 3 });
    expect(validateBundleCampaignConfig(enough, { requireCompletablePool: true })).toBeNull();
  });

  it("allows an uncapped duplicates pool of any size to activate", () => {
    const single = stack6for480({ eligibleProductIds: ["A"], allowDuplicates: true, maxPerProduct: null });
    expect(validateBundleCampaignConfig(single, { requireCompletablePool: true })).toBeNull();
  });
});

describe("validateBundleCampaignSchedule", () => {
  it("accepts open-ended and ordered windows", () => {
    expect(validateBundleCampaignSchedule(null, null)).toBeNull();
    expect(validateBundleCampaignSchedule(new Date("2026-01-01"), null)).toBeNull();
    expect(validateBundleCampaignSchedule(null, new Date("2026-01-01"))).toBeNull();
    expect(validateBundleCampaignSchedule(new Date("2026-01-01"), new Date("2026-02-01"))).toBeNull();
  });

  it("rejects an end before or equal to the start", () => {
    expect(validateBundleCampaignSchedule(new Date("2026-02-01"), new Date("2026-01-01"))).toMatch(/after the start/);
    expect(validateBundleCampaignSchedule(new Date("2026-01-01"), new Date("2026-01-01"))).toMatch(/after the start/);
  });

  it("rejects invalid dates", () => {
    expect(validateBundleCampaignSchedule(new Date("nope"), null)).toMatch(/invalid/);
  });
});

describe("getBundleCampaignState — derived lifecycle", () => {
  const now = new Date("2026-09-17T12:00:00Z");
  const past = new Date("2026-09-01T00:00:00Z");
  const future = new Date("2026-10-01T00:00:00Z");

  it("is inactive whenever the master switch is off, regardless of dates", () => {
    expect(getBundleCampaignState({ isActive: false, startsAt: null, endsAt: null }, now)).toBe("inactive");
    expect(getBundleCampaignState({ isActive: false, startsAt: past, endsAt: future }, now)).toBe("inactive");
  });

  it("is scheduled before startsAt, active inside the window, expired after endsAt", () => {
    expect(getBundleCampaignState({ isActive: true, startsAt: future, endsAt: null }, now)).toBe("scheduled");
    expect(getBundleCampaignState({ isActive: true, startsAt: past, endsAt: future }, now)).toBe("active");
    expect(getBundleCampaignState({ isActive: true, startsAt: null, endsAt: past }, now)).toBe("expired");
  });

  it("treats no window as always active and accepts ISO strings (tRPC/JSON round-trip)", () => {
    expect(getBundleCampaignState({ isActive: true, startsAt: null, endsAt: null }, now)).toBe("active");
    expect(getBundleCampaignState({ isActive: true, startsAt: past.toISOString(), endsAt: future.toISOString() }, now)).toBe("active");
    expect(isBundleCampaignLive({ isActive: true, startsAt: future.toISOString(), endsAt: null }, now)).toBe(false);
  });
});

describe("evaluateBundleSelection — qualification", () => {
  it("counts only products in the eligible pool", () => {
    const result = evaluateBundleSelection(stack6for480(), [...distinct(["A", "B", "C"]), unit("Z", 3)]);
    expect(result.qualifyingQuantity).toBe(3);
    expect(result.ineligibleUnits).toBe(3);
    expect(result.lines.find((l) => l.productId === "Z")).toMatchObject({ eligible: false, countedQuantity: 0 });
  });

  it("completes a 6-item campaign with exactly 6 qualifying units", () => {
    const result = evaluateBundleSelection(stack6for480(), distinct(["A", "B", "C", "D", "E", "F"]));
    expect(result.qualifies).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.completeBundles).toBe(1);
    expect(result.remainingUnitsNeeded).toBe(0);
    expect(result.excessUnits).toBe(0);
  });

  it("does not complete it with 5 qualifying units and reports 1 remaining", () => {
    const result = evaluateBundleSelection(stack6for480(), distinct(["A", "B", "C", "D", "E"]));
    expect(result.qualifies).toBe(false);
    expect(result.reason).toBe("not_enough_units");
    expect(result.qualifyingQuantity).toBe(5);
    expect(result.remainingUnitsNeeded).toBe(1);
    expect(result.bundleTotal).toBeNull();
    expect(result.discountAmount).toBeNull();
  });

  it("does not let non-eligible items fill the missing slot", () => {
    const result = evaluateBundleSelection(stack6for480(), [...distinct(["A", "B", "C", "D", "E"]), unit("Z")]);
    expect(result.qualifies).toBe(false);
    expect(result.reason).toBe("not_enough_units");
    expect(result.qualifyingQuantity).toBe(5);
  });

  it("starts from 'all units needed' on an empty selection", () => {
    const result = evaluateBundleSelection(stack6for480(), []);
    expect(result.qualifyingQuantity).toBe(0);
    expect(result.remainingUnitsNeeded).toBe(6);
    expect(result.regularTotal).toBe(0);
  });

  it("rejects 7 units on a non-repeatable campaign instead of silently pricing 6 of them", () => {
    const result = evaluateBundleSelection(stack6for480(), distinct(["A", "B", "C", "D", "E", "F", "G"]));
    expect(result.qualifies).toBe(false);
    expect(result.reason).toBe("too_many_units");
    expect(result.completeBundles).toBe(1);
    expect(result.excessUnits).toBe(1);
    expect(result.remainingUnitsNeeded).toBe(0);
  });

  it("ignores zero/negative quantities", () => {
    const result = evaluateBundleSelection(stack6for480(), [unit("A", 0), unit("B", -2)]);
    expect(result.qualifyingQuantity).toBe(0);
    expect(result.lines).toHaveLength(0);
  });
});

describe("evaluateBundleSelection — duplicates", () => {
  it("with duplicates disabled, a second unit of the same product cannot fill a slot", () => {
    // A ×2 + B..E = 6 requested units, but only 5 distinct → not a valid stack.
    const result = evaluateBundleSelection(stack6for480({ allowDuplicates: false }), [
      unit("A", 2),
      ...distinct(["B", "C", "D", "E"]),
    ]);
    expect(result.qualifies).toBe(false);
    expect(result.reason).toBe("duplicates_not_allowed");
    expect(result.qualifyingQuantity).toBe(5);
    expect(result.excessUnits).toBe(1);
    expect(result.lines.find((l) => l.productId === "A")).toMatchObject({ requestedQuantity: 2, countedQuantity: 1 });
  });

  it("with duplicates disabled, two cart lines of the same product (different variants) share one slot", () => {
    const result = evaluateBundleSelection(stack6for480({ allowDuplicates: false }), [
      unit("A"),
      unit("A"), // e.g. a different size of A on its own cart line
      ...distinct(["B", "C", "D", "E"]),
    ]);
    expect(result.reason).toBe("duplicates_not_allowed");
    expect(result.qualifyingQuantity).toBe(5);
  });

  it("with duplicates enabled, quantity > 1 contributes multiple qualifying units", () => {
    const result = evaluateBundleSelection(stack6for480({ allowDuplicates: true }), [unit("A", 4), unit("B", 2)]);
    expect(result.qualifies).toBe(true);
    expect(result.qualifyingQuantity).toBe(6);
    expect(result.completeBundles).toBe(1);
  });

  it("with duplicates enabled, a single product can complete the whole stack when uncapped", () => {
    const result = evaluateBundleSelection(stack6for480({ allowDuplicates: true }), [unit("A", 6)]);
    expect(result.qualifies).toBe(true);
  });

  it("with duplicates enabled and maxPerProduct set, units over the cap are rejected", () => {
    const capped = stack6for480({ allowDuplicates: true, maxPerProduct: 2 });
    const over = evaluateBundleSelection(capped, [unit("A", 3), unit("B", 2), unit("C", 1)]);
    expect(over.qualifies).toBe(false);
    expect(over.reason).toBe("max_per_product_exceeded");
    expect(over.qualifyingQuantity).toBe(5);
    expect(over.excessUnits).toBe(1);

    const within = evaluateBundleSelection(capped, [unit("A", 2), unit("B", 2), unit("C", 2)]);
    expect(within.qualifies).toBe(true);
  });
});

describe("evaluateBundleSelection — pricing", () => {
  it("prices a complete stack at the fixed bundle total and reports the saving", () => {
    const result = evaluateBundleSelection(stack6for480(), distinct(["A", "B", "C", "D", "E", "F"], 100));
    expect(result.regularTotal).toBe(600);
    expect(result.bundleTotal).toBe(480);
    expect(result.discountAmount).toBe(120);
  });

  it("uses each unit's own regular price, so the saving depends on what was picked", () => {
    const selection = [
      unit("A", 1, 120),
      unit("B", 1, 120),
      unit("C", 1, 90),
      unit("D", 1, 90),
      unit("E", 1, 75.5),
      unit("F", 1, 60),
    ];
    const result = evaluateBundleSelection(stack6for480(), selection);
    expect(result.regularTotal).toBe(555.5);
    expect(result.bundleTotal).toBe(480);
    expect(result.discountAmount).toBe(75.5);
  });

  it("is exact with prices that don't sum cleanly in binary floating point", () => {
    // 6 × 79.99 = 479.94 — plain float addition gives 479.94000000000005.
    const result = evaluateBundleSelection(stack6for480({ fixedBundlePrice: 400.1 }), distinct(POOL.slice(0, 6), 79.99));
    expect(result.regularTotal).toBe(479.94);
    expect(result.bundleTotal).toBe(400.1);
    expect(result.discountAmount).toBe(79.84);
  });

  it("reports a negative discount when the bundle costs more than buying separately", () => {
    const result = evaluateBundleSelection(stack6for480({ fixedBundlePrice: 480 }), distinct(POOL.slice(0, 6), 50));
    expect(result.qualifies).toBe(true);
    expect(result.regularTotal).toBe(300);
    expect(result.discountAmount).toBe(-180);
  });

  it("still reports the regular total of counted units when the selection is incomplete", () => {
    const result = evaluateBundleSelection(stack6for480(), distinct(["A", "B"], 100));
    expect(result.qualifies).toBe(false);
    expect(result.regularTotal).toBe(200);
    expect(result.bundleTotal).toBeNull();
  });

  it("counts the cheapest units of a product first when a cap is exceeded, leaving the dearest as excess", () => {
    const capped = stack6for480({ allowDuplicates: true, maxPerProduct: 1, requiredQuantity: 1 });
    // Two lines of A (variant price difference), cap 1 → the 80 unit counts, the 120 unit is excess.
    const result = evaluateBundleSelection(capped, [unit("A", 1, 120), unit("A", 1, 80)]);
    expect(result.regularTotal).toBe(80);
  });
});

describe("evaluateBundleSelection — repeatable campaigns", () => {
  it("forms two complete bundles from 12 qualifying units and doubles the bundle total", () => {
    const repeatableDupes = stack6for480({ isRepeatable: true, allowDuplicates: true });
    const two = evaluateBundleSelection(repeatableDupes, [unit("A", 6), unit("B", 6)]);
    expect(two.qualifies).toBe(true);
    expect(two.completeBundles).toBe(2);
    expect(two.regularTotal).toBe(1200);
    expect(two.bundleTotal).toBe(960);
    expect(two.discountAmount).toBe(240);
  });

  it("forms two bundles from 12 distinct products when duplicates are off and the pool is big enough", () => {
    const bigPool = stack6for480({ isRepeatable: true, eligibleProductIds: [...POOL, "K", "L"] });
    const result = evaluateBundleSelection(bigPool, distinct([...POOL, "K", "L"]));
    expect(result.completeBundles).toBe(2);
    expect(result.qualifies).toBe(true);
  });

  it("reports 13 units as one extra unit over two complete bundles", () => {
    const repeatableDupes = stack6for480({ isRepeatable: true, allowDuplicates: true });
    const result = evaluateBundleSelection(repeatableDupes, [unit("A", 7), unit("B", 6)]);
    expect(result.qualifies).toBe(false);
    expect(result.reason).toBe("too_many_units");
    expect(result.completeBundles).toBe(2);
    expect(result.excessUnits).toBe(1);
    expect(result.remainingUnitsNeeded).toBe(5);
  });

  it("non-repeatable campaigns cap at one bundle even with 12 qualifying units", () => {
    const single = stack6for480({ isRepeatable: false, allowDuplicates: true });
    const result = evaluateBundleSelection(single, [unit("A", 6), unit("B", 6)]);
    expect(result.completeBundles).toBe(1);
    expect(result.excessUnits).toBe(6);
    expect(result.reason).toBe("too_many_units");
  });
});

describe("evaluateBundleSelection — liveness gate", () => {
  it("refuses a complete selection when the campaign is not live", () => {
    const now = new Date("2026-09-17T12:00:00Z");
    const result = evaluateBundleSelection(stack6for480(), distinct(POOL.slice(0, 6)), {
      schedule: { isActive: true, startsAt: new Date("2026-10-01T00:00:00Z"), endsAt: null },
      now,
    });
    expect(result.qualifies).toBe(false);
    expect(result.reason).toBe("campaign_not_live");
    // The counts are still reported so a builder can show progress on a preview.
    expect(result.qualifyingQuantity).toBe(6);
  });

  it("accepts it when the campaign is live", () => {
    const now = new Date("2026-09-17T12:00:00Z");
    const result = evaluateBundleSelection(stack6for480(), distinct(POOL.slice(0, 6)), {
      schedule: { isActive: true, startsAt: new Date("2026-09-01T00:00:00Z"), endsAt: null },
      now,
    });
    expect(result.qualifies).toBe(true);
  });
});

describe("money helpers", () => {
  it("round-trips two-decimal amounts through minor units without drift", () => {
    expect(toMinorUnits(79.99)).toBe(7999);
    expect(toMinorUnits(0.1 + 0.2)).toBe(30);
    expect(fromMinorUnits(7999)).toBe(79.99);
  });
});

describe("describeBundleCampaign", () => {
  it("produces the admin summary line", () => {
    expect(describeBundleCampaign(stack6for480(), 10, "EGP")).toBe("Choose any 6 from 10 eligible products for 480.00 EGP");
  });

  it("marks repeatable campaigns and singular pool sizes", () => {
    expect(describeBundleCampaign(stack6for480({ isRepeatable: true, allowDuplicates: true }), 1, "EGP")).toBe(
      "Choose 6 from 1 eligible product for 480.00 EGP (repeatable)",
    );
  });
});
