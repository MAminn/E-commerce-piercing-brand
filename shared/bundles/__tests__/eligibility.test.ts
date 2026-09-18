import { describe, expect, it } from "vitest";
import {
  type BundleEligibilityRules,
  type EligibilityCandidate,
  candidateEffectivePrice,
  emptyEligibilityRules,
  hasAnyEligibilityRule,
  matchesEligibilityRules,
  mergeEligiblePools,
  modeUsesDynamic,
  modeUsesManual,
  validateEligibilityRules,
} from "../eligibility";

const EAR = "cat-ear";
const NOSE = "cat-nose";
const LIP = "cat-lip";

const rules = (overrides: Partial<BundleEligibilityRules> = {}): BundleEligibilityRules => ({
  ...emptyEligibilityRules(),
  ...overrides,
});

const candidate = (overrides: Partial<EligibilityCandidate> = {}): EligibilityCandidate => ({
  productId: "p1",
  categoryId: EAR,
  price: 100,
  discountPrice: null,
  deleted: false,
  hidden: false,
  ...overrides,
});

describe("modes", () => {
  it("says which halves each mode draws from", () => {
    expect(modeUsesManual("manual")).toBe(true);
    expect(modeUsesDynamic("manual")).toBe(false);
    expect(modeUsesManual("dynamic")).toBe(false);
    expect(modeUsesDynamic("dynamic")).toBe(true);
    expect(modeUsesManual("hybrid")).toBe(true);
    expect(modeUsesDynamic("hybrid")).toBe(true);
  });
});

describe("hasAnyEligibilityRule", () => {
  it("is false for an untouched rule set", () => {
    expect(hasAnyEligibilityRule(emptyEligibilityRules())).toBe(false);
  });

  it("is true once any single filter is set", () => {
    expect(hasAnyEligibilityRule(rules({ categoryIds: [EAR] }))).toBe(true);
    expect(hasAnyEligibilityRule(rules({ minPrice: 0 }))).toBe(true);
    expect(hasAnyEligibilityRule(rules({ maxPrice: 120 }))).toBe(true);
  });
});

describe("candidateEffectivePrice", () => {
  it("uses the discount only when it is genuinely lower", () => {
    expect(candidateEffectivePrice({ price: 100, discountPrice: null })).toBe(100);
    expect(candidateEffectivePrice({ price: 100, discountPrice: 80 })).toBe(80);
    expect(candidateEffectivePrice({ price: 100, discountPrice: 130 })).toBe(100);
  });
});

describe("matchesEligibilityRules — category filter (OR within the filter)", () => {
  it("matches a product in any listed category", () => {
    const r = rules({ categoryIds: [EAR, NOSE] });
    expect(matchesEligibilityRules(r, candidate({ categoryId: EAR }))).toBe(true);
    expect(matchesEligibilityRules(r, candidate({ categoryId: NOSE }))).toBe(true);
  });

  it("rejects a product in an unlisted category", () => {
    expect(matchesEligibilityRules(rules({ categoryIds: [EAR, NOSE] }), candidate({ categoryId: LIP }))).toBe(false);
  });

  it("rejects a product with no category at all", () => {
    expect(matchesEligibilityRules(rules({ categoryIds: [EAR] }), candidate({ categoryId: null }))).toBe(false);
  });

  it("ignores the category of a price-only rule", () => {
    expect(matchesEligibilityRules(rules({ maxPrice: 200 }), candidate({ categoryId: LIP }))).toBe(true);
  });
});

describe("matchesEligibilityRules — price filter", () => {
  it("treats both bounds as inclusive", () => {
    const r = rules({ minPrice: 80, maxPrice: 120 });
    expect(matchesEligibilityRules(r, candidate({ price: 80 }))).toBe(true);
    expect(matchesEligibilityRules(r, candidate({ price: 120 }))).toBe(true);
    expect(matchesEligibilityRules(r, candidate({ price: 79.99 }))).toBe(false);
    expect(matchesEligibilityRules(r, candidate({ price: 120.01 }))).toBe(false);
  });

  it("compares against the discounted price a shopper would actually pay", () => {
    const r = rules({ minPrice: 80, maxPrice: 120 });
    // Lists at 200, sells at 100 → inside the band.
    expect(matchesEligibilityRules(r, candidate({ price: 200, discountPrice: 100 }))).toBe(true);
    // Lists at 100, sells at 50 → below the band.
    expect(matchesEligibilityRules(r, candidate({ price: 100, discountPrice: 50 }))).toBe(false);
  });

  it("supports an open-ended bound on either side", () => {
    expect(matchesEligibilityRules(rules({ minPrice: 80 }), candidate({ price: 5000 }))).toBe(true);
    expect(matchesEligibilityRules(rules({ maxPrice: 80 }), candidate({ price: 5 }))).toBe(true);
  });

  it("matches an exact single price (min === max)", () => {
    const r = rules({ categoryIds: [EAR], minPrice: 100, maxPrice: 100 });
    expect(matchesEligibilityRules(r, candidate({ price: 100 }))).toBe(true);
    expect(matchesEligibilityRules(r, candidate({ price: 100.5 }))).toBe(false);
  });

  it("does not drift on prices float addition would round badly", () => {
    const r = rules({ minPrice: 79.99, maxPrice: 79.99 });
    expect(matchesEligibilityRules(r, candidate({ price: 79.99 }))).toBe(true);
  });
});

describe("matchesEligibilityRules — filters are AND'd across kinds", () => {
  const r = rules({ categoryIds: [EAR, NOSE], minPrice: 80, maxPrice: 120 });

  it("requires every filter to pass", () => {
    expect(matchesEligibilityRules(r, candidate({ categoryId: EAR, price: 100 }))).toBe(true);
    // Right category, wrong price.
    expect(matchesEligibilityRules(r, candidate({ categoryId: EAR, price: 300 }))).toBe(false);
    // Right price, wrong category.
    expect(matchesEligibilityRules(r, candidate({ categoryId: LIP, price: 100 }))).toBe(false);
  });
});

describe("matchesEligibilityRules — retired products", () => {
  const r = rules({ categoryIds: [EAR] });

  it("never matches a soft-deleted product", () => {
    expect(matchesEligibilityRules(r, candidate({ deleted: true }))).toBe(false);
  });

  it("never matches a hidden product", () => {
    expect(matchesEligibilityRules(r, candidate({ hidden: true }))).toBe(false);
  });
});

describe("matchesEligibilityRules — empty rules", () => {
  it("matches nothing rather than the whole catalogue", () => {
    expect(matchesEligibilityRules(emptyEligibilityRules(), candidate())).toBe(false);
  });
});

describe("validateEligibilityRules", () => {
  it("accepts a well-formed dynamic configuration", () => {
    expect(validateEligibilityRules("dynamic", rules({ categoryIds: [EAR], minPrice: 80, maxPrice: 120 }))).toBeNull();
  });

  it("accepts manual mode with no rules at all", () => {
    expect(validateEligibilityRules("manual", emptyEligibilityRules())).toBeNull();
  });

  it("refuses a dynamic mode that configures no rule", () => {
    expect(validateEligibilityRules("dynamic", emptyEligibilityRules())).toMatch(/at least one rule/i);
    expect(validateEligibilityRules("hybrid", emptyEligibilityRules())).toMatch(/at least one rule/i);
  });

  it("refuses an inverted price range", () => {
    expect(validateEligibilityRules("dynamic", rules({ minPrice: 120, maxPrice: 80 }))).toMatch(/not be greater/i);
  });

  it("accepts min === max", () => {
    expect(validateEligibilityRules("dynamic", rules({ minPrice: 100, maxPrice: 100 }))).toBeNull();
  });

  it("refuses negative bounds", () => {
    expect(validateEligibilityRules("dynamic", rules({ minPrice: -1 }))).toMatch(/0 or more/i);
    expect(validateEligibilityRules("dynamic", rules({ maxPrice: -1 }))).toMatch(/0 or more/i);
  });

  it("refuses a duplicated category", () => {
    expect(validateEligibilityRules("dynamic", rules({ categoryIds: [EAR, EAR] }))).toMatch(/more than once/i);
  });
});

describe("mergeEligiblePools", () => {
  const m = (id: string) => ({ productId: id });
  const MANUAL = [m("A"), m("B")];
  const DYNAMIC = [m("B"), m("C"), m("D")];

  it("manual mode ignores dynamic matches entirely", () => {
    const { products, sources } = mergeEligiblePools("manual", MANUAL, DYNAMIC);
    expect(products.map((p) => p.productId)).toEqual(["A", "B"]);
    expect(sources.get("B")).toBe("manual");
  });

  it("dynamic mode ignores the manual pool entirely", () => {
    const { products, sources } = mergeEligiblePools("dynamic", MANUAL, DYNAMIC);
    expect(products.map((p) => p.productId)).toEqual(["B", "C", "D"]);
    expect(sources.get("B")).toBe("dynamic");
  });

  it("hybrid is the union, manual first, deduplicated (scenario B)", () => {
    const { products } = mergeEligiblePools("hybrid", MANUAL, DYNAMIC);
    expect(products.map((p) => p.productId)).toEqual(["A", "B", "C", "D"]);
  });

  it("hybrid reports a product present in both as manual, keeping its manual position", () => {
    const { products, sources } = mergeEligiblePools("hybrid", MANUAL, DYNAMIC);
    expect(sources.get("B")).toBe("manual");
    expect(products.findIndex((p) => p.productId === "B")).toBe(1);
    expect(products.filter((p) => p.productId === "B")).toHaveLength(1);
  });

  it("preserves the caller's ordering within each half", () => {
    const manual = [m("Z"), m("Y")];
    const dynamic = [m("Q"), m("P")];
    expect(mergeEligiblePools("hybrid", manual, dynamic).products.map((p) => p.productId)).toEqual([
      "Z",
      "Y",
      "Q",
      "P",
    ]);
  });

  it("drops duplicates inside the manual half too", () => {
    const { products } = mergeEligiblePools("manual", [m("A"), m("A"), m("B")], []);
    expect(products.map((p) => p.productId)).toEqual(["A", "B"]);
  });

  it("returns an empty pool when neither half has anything", () => {
    expect(mergeEligiblePools("hybrid", [], []).products).toEqual([]);
  });

  it("carries the caller's own row shape through unchanged", () => {
    const rows = [{ productId: "A", name: "Flower Stud", stock: 3 }];
    const { products } = mergeEligiblePools("manual", rows, []);
    expect(products[0]).toEqual({ productId: "A", name: "Flower Stud", stock: 3 });
  });
});
