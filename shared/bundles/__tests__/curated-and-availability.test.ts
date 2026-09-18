import { describe, expect, it } from "vitest";
import {
  type AvailabilityProduct,
  type BundleCampaignConfig,
  buildYourStackValueRange,
  bundlePoolCapacity,
  computeBundleAvailability,
  computeTierAvailability,
  curatedEvaluationConfig,
  curatedUnitCount,
  describeBundleCampaign,
  evaluateCuratedStack,
  validateBundleCampaignConfig,
} from "../evaluate";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** "Golden Ear Stack": A×1, B×1, C×2, D×1 — 5 units, 450 fixed. */
const curated = (overrides: Partial<BundleCampaignConfig> = {}): BundleCampaignConfig => ({
  type: "curated_stack",
  requiredQuantity: 5,
  pricingType: "fixed_total",
  fixedBundlePrice: 450,
  allowDuplicates: true,
  maxPerProduct: null,
  isRepeatable: false,
  eligibleProductIds: ["A", "B", "C", "D"],
  composition: [
    { productId: "A", quantity: 1 },
    { productId: "B", quantity: 1 },
    { productId: "C", quantity: 2 },
    { productId: "D", quantity: 1 },
  ],
  ...overrides,
});

/** A×100, B×120, C×140, D×100 → 100 + 120 + 280 + 100 = 600 regular. */
const PRICES = { A: 100, B: 120, C: 140, D: 100 };

const stock = (overrides: Record<string, Partial<AvailabilityProduct>> = {}): AvailabilityProduct[] =>
  ["A", "B", "C", "D"].map((productId) => ({
    productId,
    stock: 10,
    purchasable: true,
    ...overrides[productId],
  }));

const bys = (overrides: Partial<BundleCampaignConfig> = {}): BundleCampaignConfig => ({
  type: "build_your_stack",
  requiredQuantity: 6,
  pricingType: "fixed_total",
  fixedBundlePrice: 480,
  allowDuplicates: false,
  maxPerProduct: null,
  isRepeatable: false,
  eligibleProductIds: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"],
  ...overrides,
});

const pool = (count: number, unitPrice = 100, stockEach = 10) =>
  Array.from({ length: count }, (_, i) => ({
    productId: String.fromCharCode(65 + i),
    stock: stockEach,
    purchasable: true,
    unitPrice,
  }));

// ─── Curated composition ──────────────────────────────────────────────────────

describe("curatedUnitCount", () => {
  it("counts units, not distinct products", () => {
    expect(curatedUnitCount(curated().composition!)).toBe(5);
    expect(curatedUnitCount([{ productId: "A", quantity: 3 }])).toBe(3);
    expect(curatedUnitCount([])).toBe(0);
  });
});

describe("curatedEvaluationConfig", () => {
  it("derives the requirement from the composition, not the stored column", () => {
    // A row whose requiredQuantity drifted out of sync still prices the set
    // the merchant actually defined.
    const config = curatedEvaluationConfig(curated({ requiredQuantity: 99 }));
    expect(config.requiredQuantity).toBe(5);
  });

  it("always allows duplicates and never caps per product (the composition IS the selection)", () => {
    const config = curatedEvaluationConfig(curated({ allowDuplicates: false, maxPerProduct: 1 }));
    expect(config.allowDuplicates).toBe(true);
    expect(config.maxPerProduct).toBeNull();
    // C×2 would otherwise trip the duplicate rule.
    expect(config.eligibleProductIds).toEqual(["A", "B", "C", "D"]);
  });

  it("treats one composition as exactly one bundle regardless of campaign repeatability", () => {
    // isRepeatable governs how many INSTANCES a cart may hold, not whether one
    // composition can collapse into several bundles.
    expect(curatedEvaluationConfig(curated({ isRepeatable: true })).isRepeatable).toBe(false);
  });
});

describe("evaluateCuratedStack — pricing from current prices", () => {
  it("prices the exact composition and reports a positive saving", () => {
    const result = evaluateCuratedStack(curated(), PRICES);
    expect(result.qualifies).toBe(true);
    expect(result.qualifyingQuantity).toBe(5);
    expect(result.regularTotal).toBe(600);
    expect(result.bundleTotal).toBe(450);
    expect(result.discountAmount).toBe(150);
  });

  it("multiplies a quantity > 1 line by its unit price", () => {
    // C is the only ×2 line: dropping it removes 2 × 140.
    const withoutC = curated({
      requiredQuantity: 3,
      composition: curated().composition!.filter((l) => l.productId !== "C"),
      eligibleProductIds: ["A", "B", "D"],
    });
    expect(evaluateCuratedStack(withoutC, PRICES).regularTotal).toBe(320);
  });

  it("reports zero saving truthfully when the stack costs what its pieces cost", () => {
    const result = evaluateCuratedStack(curated({ fixedBundlePrice: 600 }), PRICES);
    expect(result.qualifies).toBe(true);
    expect(result.discountAmount).toBe(0);
  });

  it("reports a NEGATIVE saving when the stack costs more than buying separately", () => {
    const result = evaluateCuratedStack(curated({ fixedBundlePrice: 700 }), PRICES);
    expect(result.qualifies).toBe(true);
    expect(result.regularTotal).toBe(600);
    expect(result.discountAmount).toBe(-100);
  });

  it("follows current prices, so a product discount shrinks the regular value and the saving", () => {
    const discounted = { ...PRICES, C: 90 };
    const result = evaluateCuratedStack(curated(), discounted);
    expect(result.regularTotal).toBe(500); // 100 + 120 + (90 × 2) + 100
    expect(result.discountAmount).toBe(50); // was 150 at full price
  });

  it("flips to a negative saving once current prices fall below the fixed price", () => {
    const result = evaluateCuratedStack(curated(), { A: 80, B: 80, C: 80, D: 80 });
    expect(result.regularTotal).toBe(400); // 5 units × 80
    expect(result.discountAmount).toBe(-50); // 450 fixed is now dearer
  });

  it("is exact with prices that don't sum cleanly in binary floating point", () => {
    const result = evaluateCuratedStack(curated({ fixedBundlePrice: 300 }), { A: 79.99, B: 79.99, C: 79.99, D: 79.99 });
    expect(result.regularTotal).toBe(399.95); // 5 × 79.99
    expect(result.discountAmount).toBe(99.95);
  });
});

describe("validateBundleCampaignConfig — curated rules", () => {
  it("accepts a valid composition", () => {
    expect(validateBundleCampaignConfig(curated(), { requireCompletablePool: true })).toBeNull();
  });

  it("rejects a quantity below 1 or non-integer", () => {
    for (const quantity of [0, -1, 1.5]) {
      const config = curated({ composition: [{ productId: "A", quantity }], requiredQuantity: quantity });
      expect(validateBundleCampaignConfig(config, { requireCompletablePool: false }), `qty=${quantity}`).toMatch(/at least 1/);
    }
  });

  it("rejects the same product listed twice (quantity is how you ask for two)", () => {
    const config = curated({
      composition: [
        { productId: "A", quantity: 1 },
        { productId: "A", quantity: 1 },
      ],
      requiredQuantity: 2,
    });
    expect(validateBundleCampaignConfig(config, { requireCompletablePool: false })).toMatch(/more than once/);
  });

  it("rejects a required quantity that disagrees with the composition", () => {
    expect(validateBundleCampaignConfig(curated({ requiredQuantity: 4 }), { requireCompletablePool: false })).toMatch(
      /must equal the number of units/,
    );
  });

  it("lets a draft have an empty composition but refuses to activate it", () => {
    const empty = curated({ composition: [], requiredQuantity: 0, eligibleProductIds: [] });
    expect(validateBundleCampaignConfig(empty, { requireCompletablePool: false })).toBeNull();
    expect(validateBundleCampaignConfig(empty, { requireCompletablePool: true })).toMatch(/at least one product/);
  });

  it("still requires a positive fixed price", () => {
    expect(validateBundleCampaignConfig(curated({ fixedBundlePrice: 0 }), { requireCompletablePool: false })).toMatch(
      /greater than 0/,
    );
  });
});

// ─── Availability ─────────────────────────────────────────────────────────────

describe("computeBundleAvailability — curated stacks", () => {
  it("is available when every line has enough stock", () => {
    expect(computeBundleAvailability(curated(), stock())).toBe("available");
  });

  it("is sold out when a ×2 line has only 1 in stock (quantity is respected)", () => {
    expect(computeBundleAvailability(curated(), stock({ C: { stock: 1 } }))).toBe("sold_out");
    // …and available again at exactly the required quantity.
    expect(computeBundleAvailability(curated(), stock({ C: { stock: 2 } }))).toBe("available");
  });

  it("is sold out when any line is out of stock, hidden or deleted", () => {
    expect(computeBundleAvailability(curated(), stock({ A: { stock: 0 } }))).toBe("sold_out");
    expect(computeBundleAvailability(curated(), stock({ B: { purchasable: false } }))).toBe("sold_out");
  });

  it("is sold out when a composition product row is missing entirely", () => {
    expect(computeBundleAvailability(curated(), stock().filter((p) => p.productId !== "D"))).toBe("sold_out");
  });

  it("is sold out when the composition is empty", () => {
    expect(computeBundleAvailability(curated({ composition: [] }), stock())).toBe("sold_out");
  });
});

describe("computeBundleAvailability — Build Your Stack", () => {
  it("needs N purchasable distinct products when duplicates are off", () => {
    expect(computeBundleAvailability(bys(), pool(6))).toBe("available");
    expect(computeBundleAvailability(bys(), pool(5))).toBe("sold_out");
  });

  it("ignores out-of-stock, hidden and deleted products when counting capacity", () => {
    const sixWithOneDead = pool(6).map((p, i) => (i === 0 ? { ...p, stock: 0 } : p));
    expect(computeBundleAvailability(bys(), sixWithOneDead)).toBe("sold_out");
    const sixWithOneHidden = pool(6).map((p, i) => (i === 0 ? { ...p, purchasable: false } : p));
    expect(computeBundleAvailability(bys(), sixWithOneHidden)).toBe("sold_out");
    expect(computeBundleAvailability(bys(), pool(7).map((p, i) => (i === 0 ? { ...p, stock: 0 } : p)))).toBe("available");
  });

  it("with duplicates on, one deep-stocked product can cover the whole stack", () => {
    const config = bys({ allowDuplicates: true, eligibleProductIds: ["A"] });
    expect(computeBundleAvailability(config, pool(1, 100, 6))).toBe("available");
    expect(computeBundleAvailability(config, pool(1, 100, 5))).toBe("sold_out");
  });

  it("respects max-per-product when counting duplicate capacity", () => {
    const config = bys({ allowDuplicates: true, maxPerProduct: 2, eligibleProductIds: ["A", "B"] });
    // 2 products × cap 2 = 4 units < 6 required, however deep the stock is.
    expect(computeBundleAvailability(config, pool(2, 100, 50))).toBe("sold_out");
    const roomier = bys({ allowDuplicates: true, maxPerProduct: 3, eligibleProductIds: ["A", "B"] });
    expect(computeBundleAvailability(roomier, pool(2, 100, 50))).toBe("available");
  });

  it("caps duplicate capacity by real stock, not just the per-product limit", () => {
    const config = bys({ allowDuplicates: true, maxPerProduct: 10, eligibleProductIds: ["A", "B"] });
    expect(computeBundleAvailability(config, pool(2, 100, 2))).toBe("sold_out"); // 2 + 2 = 4 < 6
    expect(computeBundleAvailability(config, pool(2, 100, 3))).toBe("available"); // 3 + 3 = 6
  });
});

// ─── Build Your Stack value range ─────────────────────────────────────────────

describe("buildYourStackValueRange", () => {
  it("returns the cheapest and dearest completable stack at current prices", () => {
    const products = [
      { productId: "A", stock: 10, purchasable: true, unitPrice: 100 },
      { productId: "B", stock: 10, purchasable: true, unitPrice: 120 },
      { productId: "C", stock: 10, purchasable: true, unitPrice: 140 },
    ];
    const config = bys({ requiredQuantity: 2, eligibleProductIds: ["A", "B", "C"] });
    expect(buildYourStackValueRange(config, products)).toEqual({ min: 220, max: 260 });
  });

  it("is equal at both ends when every eligible product costs the same", () => {
    const config = bys({ eligibleProductIds: ["A", "B", "C", "D", "E", "F"] });
    expect(buildYourStackValueRange(config, pool(6))).toEqual({ min: 600, max: 600 });
  });

  it("returns null when the purchasable pool cannot complete a stack", () => {
    expect(buildYourStackValueRange(bys(), pool(5))).toBeNull();
    expect(buildYourStackValueRange(bys(), [])).toBeNull();
  });

  it("excludes products that are out of stock or not purchasable", () => {
    const seven = pool(7).map((p, i) => (i === 0 ? { ...p, unitPrice: 10, stock: 0 } : p));
    // The 10 EGP product is out of stock, so the cheapest stack is 6 × 100.
    expect(buildYourStackValueRange(bys(), seven)).toEqual({ min: 600, max: 600 });
  });

  it("ignores products outside the eligible pool even when priced and in stock", () => {
    const config = bys({ requiredQuantity: 2, eligibleProductIds: ["A", "B"] });
    const products = [...pool(2, 100), { productId: "Z", stock: 10, purchasable: true, unitPrice: 1 }];
    expect(buildYourStackValueRange(config, products)).toEqual({ min: 200, max: 200 });
  });

  it("accounts for duplicate caps when picking the cheapest stack", () => {
    const config = bys({ requiredQuantity: 4, allowDuplicates: true, maxPerProduct: 2, eligibleProductIds: ["A", "B"] });
    const products = [
      { productId: "A", stock: 10, purchasable: true, unitPrice: 50 },
      { productId: "B", stock: 10, purchasable: true, unitPrice: 200 },
    ];
    // Cheapest: 2×50 + 2×200 = 500 (cap forbids 4×50). Dearest is the same set.
    expect(buildYourStackValueRange(config, products)).toEqual({ min: 500, max: 500 });
  });
});

// ─── Admin summary line ───────────────────────────────────────────────────────

describe("describeBundleCampaign — per type", () => {
  it("describes a curated stack by products, units and price", () => {
    expect(describeBundleCampaign({ ...curated(), type: "curated_stack" }, 4, "EGP")).toBe("4 products · 5 units · 450.00 EGP");
  });

  it("still describes a build-your-stack campaign as a choice", () => {
    expect(describeBundleCampaign({ ...bys(), type: "build_your_stack" }, 10, "EGP")).toBe(
      "Choose any 6 from 10 eligible products for 480.00 EGP",
    );
  });
});

// ─── Phase 7: capacity under variants ─────────────────────────────────────────
//
// Options never own stock in this store: "Gold stock 1 + Silver stock 3" IS a
// product with stock 4. What options CAN change is purchasability — a product
// whose option groups leave nothing sellable resolves to no variant at all and
// must add no capacity. Both facts feed the ONE capacity function.

describe("bundlePoolCapacity — variant-backed products (Phase 7)", () => {
  const onlyA = (overrides: Partial<BundleCampaignConfig> = {}) =>
    bys({ eligibleProductIds: ["A"], requiredQuantity: 1, ...overrides });
  /** A: Gold ×1 + Silver ×3 in stock → the product has 4 units. */
  const products: AvailabilityProduct[] = [{ productId: "A", stock: 4, purchasable: true }];

  it("duplicates disabled → 1, however many variants exist", () => {
    expect(bundlePoolCapacity(onlyA({ allowDuplicates: false }), products)).toBe(1);
  });

  it("duplicates enabled, no cap → 4 (every purchasable unit)", () => {
    expect(bundlePoolCapacity(onlyA({ allowDuplicates: true, maxPerProduct: null }), products)).toBe(4);
  });

  it("maxPerProduct = 2 → min(total purchasable variant stock, 2) = 2", () => {
    expect(bundlePoolCapacity(onlyA({ allowDuplicates: true, maxPerProduct: 2 }), products)).toBe(2);
  });

  it("a product with required options but NO valid variant contributes nothing", () => {
    const dead: AvailabilityProduct[] = [{ productId: "A", stock: 4, purchasable: false }];
    expect(bundlePoolCapacity(onlyA({ allowDuplicates: true }), dead)).toBe(0);
  });

  it("per-tier availability derives from that capacity", () => {
    const config = bys({
      eligibleProductIds: ["A", "B"],
      allowDuplicates: true,
      maxPerProduct: 2,
      tiers: [
        { id: "t3", quantity: 3, price: 270 },
        { id: "t4", quantity: 4, price: 340 },
        { id: "t6", quantity: 6, price: 480 },
      ],
    });
    // A: 4 units (variants) capped at 2; B: options leave nothing sellable.
    const pool: AvailabilityProduct[] = [
      { productId: "A", stock: 4, purchasable: true },
      { productId: "B", stock: 9, purchasable: false },
    ];
    expect(bundlePoolCapacity(config, pool)).toBe(2);
    expect(computeTierAvailability(config, pool).map((t) => t.availability)).toEqual(["sold_out", "sold_out", "sold_out"]);
    expect(computeBundleAvailability(config, pool)).toBe("sold_out");
    // B regains a purchasable variant → 2 + 2 = 4: the 3- and 4-piece tiers open.
    const revived = pool.map((p) => ({ ...p, purchasable: true }));
    expect(computeTierAvailability(config, revived).map((t) => t.availability)).toEqual(["available", "available", "sold_out"]);
    expect(computeBundleAvailability(config, revived)).toBe("available");
  });

  it("curated: a line whose fixed variant no longer resolves makes the stack sold out", () => {
    const config = curated();
    expect(computeBundleAvailability(config, stock({ C: { purchasable: false } }))).toBe("sold_out");
    expect(computeBundleAvailability(config, stock())).toBe("available");
  });
});
