import { describe, expect, it } from "vitest";
import type { BundleCampaignRow } from "#root/shared/database/drizzle/schema";
import type { CuratedCompositionLine } from "#root/shared/bundles/evaluate";
import { toPurchasableOptionGroups, type PurchasableOptionGroup } from "#root/shared/products/options";
import { type SelectionProductRow, validateBundleSelection } from "../selection";

/**
 * Phase 7 — option-aware ("variant") validation. Pure: the loader is
 * exercised by the integration suites; here the option groups are passed in.
 *
 * Model under test: options are per-product GROUPS, a variant is one value per
 * group, price = (discountPrice ?? price) + Σ modifiers, stock is the
 * PRODUCT's. Campaign rules (eligibility, duplicates, max) are product-level.
 */

const NOW = new Date("2026-09-17T12:00:00Z");
const PAST = new Date("2026-09-01T00:00:00Z");

const ids = (n: number) => Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-0000000000${(i + 10).toString(16)}`);
const POOL = ids(10);
const [A, B, C, D] = POOL as [string, string, string, string];

const campaign = (overrides: Partial<BundleCampaignRow> = {}): BundleCampaignRow => ({
  id: "10000000-0000-4000-8000-000000000001",
  internalName: "Ear stack",
  title: "Build Your Ear Stack",
  slug: "build-your-ear-stack",
  subtitle: null,
  description: null,
  badgeText: null,
  imageId: null,
  type: "build_your_stack",
  isActive: true,
  requiredQuantity: 3,
  pricingType: "fixed_total",
  fixedBundlePrice: "150.00",
  allowDuplicates: false,
  maxPerProduct: null,
  isRepeatable: false,
  offerStacking: "exclusive",
  eligibilityMode: "manual",
  eligibilityMinPrice: null,
  eligibilityMaxPrice: null,
  sortOrder: 0,
  startsAt: null,
  endsAt: null,
  createdAt: PAST,
  updatedAt: PAST,
  ...overrides,
});

const productRow = (id: string, overrides: Partial<SelectionProductRow> = {}): SelectionProductRow => ({
  id,
  name: `Product ${id.slice(-2)}`,
  price: "100.00",
  discountPrice: null,
  stock: 10,
  deleted: false,
  hidden: false,
  categoryId: null,
  imageUrl: null,
  ...overrides,
});

const products = POOL.map((id) => productRow(id));

/** A: Color Gold(+20)/Silver — B: Size 6mm/8mm(+10)/Large(+35) — C, D: simple. */
const optionGroups = new Map<string, PurchasableOptionGroup[]>([
  [A, toPurchasableOptionGroups([{ name: "Color", values: [{ value: "Gold", priceModifier: 20 }, { value: "Silver" }] }])],
  [
    B,
    toPurchasableOptionGroups([
      { name: "Size", values: [{ value: "6mm" }, { value: "8mm", priceModifier: 10 }, { value: "Large", priceModifier: 35 }] },
    ]),
  ],
]);

const base = { campaign: campaign(), poolProductIds: POOL, products, optionGroups, now: NOW };
const line = (productId: string, selectedOptions?: Record<string, string>, quantity = 1) => ({ productId, quantity, selectedOptions });

describe("variant identity — server resolves, never trusts", () => {
  it("prices the exact selected lines: A/Gold 120 + B/Large 135 + C 100 = 355 regular, tier 150", () => {
    const check = validateBundleSelection({
      ...base,
      requested: [line(A, { Color: "Gold" }), line(B, { Size: "Large" }), line(C)],
    });
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.bundle.regularTotal).toBe(355);
    expect(check.bundle.bundleTotal).toBe(150);
    expect(check.bundle.savings).toBe(205);
    expect(check.bundle.items.map((i) => i.unitPrice)).toEqual([120, 135, 100]);
    expect(check.bundle.items[0]).toMatchObject({ price: 100, discountPrice: null, priceModifier: 20, optionsLabel: "Color: Gold" });
    expect(check.bundle.items[2]).toMatchObject({ selectedOptions: {}, optionsLabel: null, priceModifier: 0 });
  });

  it("uses discountPrice + modifier when the product is discounted", () => {
    const discounted = products.map((p) => (p.id === A ? { ...p, discountPrice: "60.00" } : p));
    const check = validateBundleSelection({ ...base, products: discounted, requested: [line(A, { Color: "Gold" }), line(C), line(D)] });
    expect(check.ok && check.bundle.items[0]?.unitPrice).toBe(80);
    expect(check.ok && check.bundle.items[0]?.discountPrice).toBe(60);
  });

  it("negative difference stays truthful with variant prices (regular 285 < tier 300)", () => {
    const check = validateBundleSelection({
      ...base,
      campaign: campaign({ fixedBundlePrice: "300.00" }),
      requested: [line(A, { Color: "Silver" }), line(B, { Size: "6mm" }), line(C, undefined)],
      products: products.map((p) => (p.id === C ? { ...p, price: "85.00" } : p)),
    });
    expect(check.ok && check.bundle.regularTotal).toBe(285);
    expect(check.ok && check.bundle.bundleTotal).toBe(300);
    expect(check.ok && check.bundle.savings).toBe(-15);
  });

  it("rejects a product with options but no chosen value as option_required (never counts a generic unit)", () => {
    const check = validateBundleSelection({ ...base, requested: [line(A), line(C), line(D)] });
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.code).toBe("option_required");
    expect(check.detail).toMatchObject({ productId: A, productName: "Product 0a", optionName: "Color" });
    expect(check.message).toContain("Color");
  });

  it("rejects an invented option value as option_not_found", () => {
    const check = validateBundleSelection({ ...base, requested: [line(A, { Color: "Platinum" }), line(C), line(D)] });
    expect(!check.ok && check.code).toBe("option_not_found");
  });

  it("rejects a struck-through value as option_unavailable", () => {
    const struck = new Map(optionGroups);
    struck.set(A, toPurchasableOptionGroups([{ name: "Color", values: [{ value: "Gold" }, { value: "Silver" }] }], { Color: ["Gold"] }));
    const check = validateBundleSelection({ ...base, optionGroups: struck, requested: [line(A, { Color: "Gold" }), line(C), line(D)] });
    expect(!check.ok && check.code).toBe("option_unavailable");
    expect(!check.ok && check.detail?.value).toBe("Gold");
  });

  it("uses the canonical variant, not spoofed display keys: extra keys dropped, product's own group names kept", () => {
    const check = validateBundleSelection({
      ...base,
      requested: [line(A, { color: "Gold", Engraving: "free", Price: "1" }), line(C), line(D)],
    });
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.bundle.items[0]?.selectedOptions).toEqual({ Color: "Gold" });
    expect(check.bundle.items[0]?.unitPrice).toBe(120);
  });

  it("an option sent for a simple product is ignored — nothing is invented", () => {
    const check = validateBundleSelection({ ...base, requested: [line(C, { Color: "Gold" }), line(D), line(A, { Color: "Silver" })] });
    expect(check.ok && check.bundle.items[0]?.selectedOptions).toEqual({});
    expect(check.ok && check.bundle.items[0]?.unitPrice).toBe(100);
  });

  it("simple-product regression: no option groups at all behaves exactly as before", () => {
    const check = validateBundleSelection({ ...base, optionGroups: undefined, requested: [line(A), line(B), line(C)] });
    expect(check.ok && check.bundle.regularTotal).toBe(300);
    expect(check.ok && check.bundle.items.every((i) => i.optionsLabel === null && i.priceModifier === 0)).toBe(true);
  });
});

describe("duplicate rules stay PRODUCT-level across variants", () => {
  it("allowDuplicates=false: A/Gold + A/Silver → duplicates_not_allowed", () => {
    const check = validateBundleSelection({
      ...base,
      requested: [line(A, { Color: "Gold" }), line(A, { Color: "Silver" }), line(C)],
    });
    expect(!check.ok && check.code).toBe("duplicates_not_allowed");
  });

  it("allowDuplicates=true, maxPerProduct=2: A/Gold + A/Silver allowed; a third A unit exceeds", () => {
    const c = campaign({ allowDuplicates: true, maxPerProduct: 2, requiredQuantity: 3 });
    const ok = validateBundleSelection({ ...base, campaign: c, requested: [line(A, { Color: "Gold" }), line(A, { Color: "Silver" }), line(C)] });
    expect(ok.ok).toBe(true);
    expect(ok.ok && ok.bundle.regularTotal).toBe(320);

    const tooMany = validateBundleSelection({
      ...base,
      campaign: campaign({ allowDuplicates: true, maxPerProduct: 2, requiredQuantity: 4 }),
      requested: [line(A, { Color: "Gold" }, 2), line(A, { Color: "Silver" }), line(C)],
    });
    expect(!tooMany.ok && tooMany.code).toBe("max_per_product_exceeded");
  });

  it("mixed stack: simple + variant + variant + simple prices, counts and validates as one stack", () => {
    const c = campaign({ requiredQuantity: 4, fixedBundlePrice: "400.00" });
    const check = validateBundleSelection({
      ...base,
      campaign: c,
      requested: [line(C), line(A, { Color: "Gold" }), line(B, { Size: "8mm" }), line(D)],
    });
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.bundle.regularTotal).toBe(430);
    expect(check.bundle.items).toHaveLength(4);
    expect(check.evaluation.lines.map((l) => l.countedQuantity)).toEqual([1, 1, 1, 1]);
  });
});

describe("stock is product-level across variants", () => {
  const c = campaign({ allowDuplicates: true, maxPerProduct: null, requiredQuantity: 3 });
  const lowStock = products.map((p) => (p.id === A ? { ...p, stock: 3 } : p));

  it("A stock 3: Gold ×1 + Silver ×2 is fine", () => {
    const check = validateBundleSelection({ ...base, campaign: c, products: lowStock, requested: [line(A, { Color: "Gold" }), line(A, { Color: "Silver" }, 2)] });
    expect(check.ok).toBe(true);
  });

  it("A stock 3: Gold ×2 + Silver ×2 → out_of_stock (4 units of one product)", () => {
    const check = validateBundleSelection({
      ...base,
      campaign: campaign({ allowDuplicates: true, requiredQuantity: 4 }),
      products: lowStock,
      requested: [line(A, { Color: "Gold" }, 2), line(A, { Color: "Silver" }, 2)],
    });
    expect(!check.ok && check.code).toBe("out_of_stock");
    expect(!check.ok && check.detail?.productId).toBe(A);
  });
});

describe("curated stacks fix the exact variant", () => {
  const curated = campaign({ type: "curated_stack", requiredQuantity: 3, fixedBundlePrice: "300.00" });
  const composition: CuratedCompositionLine[] = [
    { productId: A, quantity: 1, selectedOptions: { Color: "Gold" } },
    { productId: B, quantity: 2, selectedOptions: { Size: "8mm" } },
  ];

  it("prices the composition's fixed variants and ignores whatever the client sends", () => {
    const check = validateBundleSelection({
      ...base,
      campaign: curated,
      poolProductIds: [A, B],
      composition,
      // Client tries to swap variants and add a product.
      requested: [line(A, { Color: "Silver" }), line(B, { Size: "Large" }, 5), line(C)],
    });
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.bundle.items.map((i) => [i.productId, i.selectedOptions, i.quantity, i.unitPrice])).toEqual([
      [A, { Color: "Gold" }, 1, 120],
      [B, { Size: "8mm" }, 2, 110],
    ]);
    expect(check.bundle.regularTotal).toBe(340);
    expect(check.bundle.bundleTotal).toBe(300);
  });

  it("a composition line whose product has options but none fixed → composition_incomplete (never guesses)", () => {
    const check = validateBundleSelection({
      ...base,
      campaign: curated,
      poolProductIds: [A, B],
      composition: [{ productId: A, quantity: 1 }, { productId: B, quantity: 2, selectedOptions: { Size: "8mm" } }],
      requested: [],
    });
    expect(!check.ok && check.code).toBe("composition_incomplete");
    expect(!check.ok && check.message).not.toContain("choose");
  });

  it("a fixed variant that was since removed → composition_incomplete", () => {
    const check = validateBundleSelection({
      ...base,
      campaign: curated,
      poolProductIds: [A, B],
      composition: [{ productId: A, quantity: 1, selectedOptions: { Color: "Rose" } }, { productId: B, quantity: 2, selectedOptions: { Size: "8mm" } }],
      requested: [],
    });
    expect(!check.ok && check.code).toBe("composition_incomplete");
  });

  it("current product stock is checked against the fixed quantity", () => {
    const check = validateBundleSelection({
      ...base,
      campaign: curated,
      poolProductIds: [A, B],
      composition,
      products: products.map((p) => (p.id === B ? { ...p, stock: 1 } : p)),
      requested: [],
    });
    expect(!check.ok && check.code).toBe("out_of_stock");
  });

  it("simple curated regression: no options anywhere behaves as Phase 6", () => {
    const check = validateBundleSelection({
      ...base,
      optionGroups: undefined,
      campaign: curated,
      poolProductIds: [C, D],
      composition: [{ productId: C, quantity: 1 }, { productId: D, quantity: 2 }],
      requested: [],
    });
    expect(check.ok && check.bundle.regularTotal).toBe(300);
    expect(check.ok && check.bundle.items.every((i) => i.selectedOptions && Object.keys(i.selectedOptions).length === 0)).toBe(true);
  });
});
