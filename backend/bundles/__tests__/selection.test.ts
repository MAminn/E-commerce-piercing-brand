import { describe, expect, it } from "vitest";
import type { BundleCampaignRow } from "#root/shared/database/drizzle/schema";
import { type SelectionProductRow, validateBundleSelection } from "../selection";

const NOW = new Date("2026-09-17T12:00:00Z");
const PAST = new Date("2026-09-01T00:00:00Z");
const FUTURE = new Date("2026-10-01T00:00:00Z");

const ids = (n: number) => Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-0000000000${(i + 10).toString(16)}`);
const POOL = ids(10);

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
  requiredQuantity: 6,
  pricingType: "fixed_total",
  fixedBundlePrice: "480.00",
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
const pick = (list: string[], quantity = 1) => list.map((productId) => ({ productId, quantity }));
const six = POOL.slice(0, 6);

describe("validateBundleSelection — server authority", () => {
  it("accepts a complete, eligible, in-stock stack and prices it from the server rows", () => {
    const check = validateBundleSelection({ campaign: campaign(), poolProductIds: POOL, products, requested: pick(six), now: NOW });
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.bundle.regularTotal).toBe(600);
    expect(check.bundle.bundleTotal).toBe(480);
    expect(check.bundle.savings).toBe(120);
    expect(check.bundle.items.every((i) => i.unitPrice === 100)).toBe(true);
    expect(check.campaign).not.toHaveProperty("internalName");
  });

  it("uses discountPrice ?? price per product exactly like checkout does", () => {
    const discounted = products.map((p, i) => (i === 0 ? { ...p, discountPrice: "60.00" } : p));
    const check = validateBundleSelection({ campaign: campaign(), poolProductIds: POOL, products: discounted, requested: pick(six), now: NOW });
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.bundle.regularTotal).toBe(560);
    expect(check.bundle.savings).toBe(80);
  });

  it("ignores any client idea of product price — there is simply no price in the request", () => {
    // A client that thinks a product is 1 EGP changes nothing: prices come from rows.
    const requested = pick(six).map((r) => ({ ...r, unitPrice: 1, price: 1 })) as unknown as { productId: string; quantity: number }[];
    const check = validateBundleSelection({ campaign: campaign(), poolProductIds: POOL, products, requested, now: NOW });
    expect(check.ok && check.bundle.regularTotal).toBe(600);
  });

  it("rejects a spoofed bundle price as price_changed (and still never charges it)", () => {
    const check = validateBundleSelection({
      campaign: campaign(),
      poolProductIds: POOL,
      products,
      requested: pick(six),
      expectedBundleTotal: 1,
      now: NOW,
    });
    expect(check.ok).toBe(false);
    expect(check.code).toBe("price_changed");
    expect(check.evaluation?.bundleTotal).toBe(480);
  });

  it("uses the altered campaign price when the merchant changed it after the stack was built", () => {
    const check = validateBundleSelection({
      campaign: campaign({ fixedBundlePrice: "450.00" }),
      poolProductIds: POOL,
      products,
      requested: pick(six),
      expectedBundleTotal: 480,
      now: NOW,
    });
    expect(check.ok).toBe(false);
    expect(check.code).toBe("price_changed");
    // Without an expectation (or with the right one) the server price wins.
    const fresh = validateBundleSelection({ campaign: campaign({ fixedBundlePrice: "450.00" }), poolProductIds: POOL, products, requested: pick(six), now: NOW });
    expect(fresh.ok && fresh.bundle.bundleTotal).toBe(450);
  });

  it("rejects inactive, scheduled and expired campaigns as campaign_not_live", () => {
    for (const c of [campaign({ isActive: false }), campaign({ startsAt: FUTURE }), campaign({ endsAt: PAST })]) {
      const check = validateBundleSelection({ campaign: c, poolProductIds: POOL, products, requested: pick(six), now: NOW });
      expect(check.ok).toBe(false);
      expect(check.code).toBe("campaign_not_live");
      expect(check.message).toMatch(/not available right now/);
    }
  });

  it("rejects a missing campaign", () => {
    const check = validateBundleSelection({ campaign: null, poolProductIds: [], products: [], requested: pick(six), now: NOW });
    expect(check.code).toBe("campaign_not_found");
  });

  it("rejects a product outside the pool as product_not_eligible", () => {
    const outsider = "00000000-0000-4000-8000-0000000000ff";
    const check = validateBundleSelection({
      campaign: campaign(),
      poolProductIds: POOL,
      products: [...products, productRow(outsider)],
      requested: pick([...POOL.slice(0, 5), outsider]),
      now: NOW,
    });
    expect(check.code).toBe("product_not_eligible");
  });

  it("rejects deleted, hidden and unknown products as product_unavailable", () => {
    const deleted = products.map((p, i) => (i === 0 ? { ...p, deleted: true } : p));
    expect(validateBundleSelection({ campaign: campaign(), poolProductIds: POOL, products: deleted, requested: pick(six), now: NOW }).code).toBe("product_unavailable");
    const hidden = products.map((p, i) => (i === 0 ? { ...p, hidden: true } : p));
    expect(validateBundleSelection({ campaign: campaign(), poolProductIds: POOL, products: hidden, requested: pick(six), now: NOW }).code).toBe("product_unavailable");
    expect(validateBundleSelection({ campaign: campaign(), poolProductIds: POOL, products: products.slice(1), requested: pick(six), now: NOW }).code).toBe("product_unavailable");
  });

  it("rejects when a product's stock can't cover the requested quantity (summed across lines)", () => {
    const low = products.map((p, i) => (i === 0 ? { ...p, stock: 1 } : p));
    const dupes = campaign({ allowDuplicates: true });
    const check = validateBundleSelection({
      campaign: dupes,
      poolProductIds: POOL,
      products: low,
      requested: [{ productId: POOL[0]!, quantity: 1 }, { productId: POOL[0]!, quantity: 1 }, ...pick(POOL.slice(1, 5))],
      now: NOW,
    });
    expect(check.code).toBe("out_of_stock");
  });

  it("reports an incomplete stack with progress so the builder can show it", () => {
    const check = validateBundleSelection({ campaign: campaign(), poolProductIds: POOL, products, requested: pick(POOL.slice(0, 4)), now: NOW });
    expect(check.ok).toBe(false);
    expect(check.code).toBe("not_enough_units");
    expect(check.evaluation?.remainingUnitsNeeded).toBe(2);
  });

  it("enforces duplicate and max-per-product rules from the campaign, not the client", () => {
    const dup = validateBundleSelection({
      campaign: campaign(),
      poolProductIds: POOL,
      products,
      requested: [{ productId: POOL[0]!, quantity: 2 }, ...pick(POOL.slice(1, 5))],
      now: NOW,
    });
    expect(dup.code).toBe("duplicates_not_allowed");

    const capped = validateBundleSelection({
      campaign: campaign({ allowDuplicates: true, maxPerProduct: 2 }),
      poolProductIds: POOL,
      products,
      requested: [{ productId: POOL[0]!, quantity: 3 }, ...pick(POOL.slice(1, 4))],
      now: NOW,
    });
    expect(capped.code).toBe("max_per_product_exceeded");

    const ok = validateBundleSelection({
      campaign: campaign({ allowDuplicates: true, maxPerProduct: 3 }),
      poolProductIds: POOL,
      products,
      requested: [{ productId: POOL[0]!, quantity: 3 }, { productId: POOL[1]!, quantity: 3 }],
      now: NOW,
    });
    expect(ok.ok).toBe(true);
  });

  it("rejects a campaign whose fixed price is missing as invalid_pricing", () => {
    const check = validateBundleSelection({ campaign: campaign({ fixedBundlePrice: null }), poolProductIds: POOL, products, requested: pick(six), now: NOW });
    expect(check.code).toBe("invalid_pricing");
  });

  it("only exposes the public campaign summary (no admin fields)", () => {
    const check = validateBundleSelection({ campaign: campaign({ isActive: false }), poolProductIds: POOL, products, requested: [], now: NOW });
    expect(check.campaign).toEqual({
      id: "10000000-0000-4000-8000-000000000001",
      slug: "build-your-ear-stack",
      title: "Build Your Ear Stack",
      type: "build_your_stack",
      // No tier rows were supplied here; the domain falls back to the legacy
      // requiredQuantity/fixedBundlePrice pair for pricing.
      tiers: [],
      requiredQuantity: 6,
      fixedBundlePrice: 480,
      allowDuplicates: false,
      maxPerProduct: null,
      isRepeatable: false,
      offerStacking: "exclusive",
    });
  });
});

// ─── Curated stacks: the merchant owns the composition ────────────────────────

const CURATED_IDS = POOL.slice(0, 4);
/** A×1, B×1, C×2, D×1 — 5 units. */
const CURATED_COMPOSITION = [
  { productId: CURATED_IDS[0]!, quantity: 1 },
  { productId: CURATED_IDS[1]!, quantity: 1 },
  { productId: CURATED_IDS[2]!, quantity: 2 },
  { productId: CURATED_IDS[3]!, quantity: 1 },
];

const curatedCampaign = (overrides: Partial<BundleCampaignRow> = {}): BundleCampaignRow =>
  campaign({
    type: "curated_stack",
    title: "Golden Ear Stack",
    slug: "golden-ear-stack",
    requiredQuantity: 5,
    fixedBundlePrice: "450.00",
    allowDuplicates: true,
    ...overrides,
  });

/** The composition's products at 100 each → 5 units = 500 regular. */
const curatedProducts = CURATED_IDS.map((id) => productRow(id));

const validateCurated = (overrides: Partial<Parameters<typeof validateBundleSelection>[0]> = {}) =>
  validateBundleSelection({
    campaign: curatedCampaign(),
    poolProductIds: CURATED_IDS,
    composition: CURATED_COMPOSITION,
    products: curatedProducts,
    requested: [],
    now: NOW,
    ...overrides,
  });

describe("validateBundleSelection — curated stacks", () => {
  it("prices the stored composition when the client sends no items at all", () => {
    const check = validateCurated();
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.bundle.items).toHaveLength(4);
    expect(check.bundle.items.map((i) => i.quantity)).toEqual([1, 1, 2, 1]);
    expect(check.bundle.regularTotal).toBe(500);
    expect(check.bundle.bundleTotal).toBe(450);
    expect(check.bundle.savings).toBe(50);
    // Snapshot records the composition's real unit count.
    expect(check.bundle.requiredQuantity).toBe(5);
  });

  it("ignores a client that tries to REPLACE the composition with other products", () => {
    const outsider = POOL[9]!;
    const check = validateCurated({
      poolProductIds: [...CURATED_IDS, outsider],
      products: [...curatedProducts, productRow(outsider, { price: "5.00" })],
      requested: [{ productId: outsider, quantity: 1 }],
    });
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    // The smuggled product is absent; the stored set is what gets priced.
    expect(check.bundle.items.map((i) => i.productId)).toEqual(CURATED_IDS);
    expect(check.bundle.regularTotal).toBe(500);
  });

  it("ignores a client that tries to inflate or shrink the quantities", () => {
    const check = validateCurated({
      requested: [
        { productId: CURATED_IDS[0]!, quantity: 99 },
        { productId: CURATED_IDS[2]!, quantity: 1 },
      ],
    });
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.bundle.items.map((i) => i.quantity)).toEqual([1, 1, 2, 1]);
  });

  it("re-derives unit prices from product rows, discountPrice first", () => {
    const discounted = curatedProducts.map((p, i) => (i === 2 ? { ...p, discountPrice: "60.00" } : p));
    const check = validateCurated({ products: discounted });
    expect(check.ok && check.bundle.regularTotal).toBe(420); // 100 + 100 + (60 × 2) + 100
    expect(check.ok && check.bundle.savings).toBe(-30); // 450 fixed is now dearer — reported, not hidden
  });

  it("rejects a spoofed bundle price and never charges it", () => {
    const check = validateCurated({ expectedBundleTotal: 1 });
    expect(check.ok).toBe(false);
    expect(check.code).toBe("price_changed");
    expect(check.evaluation?.bundleTotal).toBe(450);
  });

  it("checks stock against each line's quantity, not just presence", () => {
    // The ×2 line with only 1 in stock must fail.
    const low = curatedProducts.map((p, i) => (i === 2 ? { ...p, stock: 1 } : p));
    expect(validateCurated({ products: low }).code).toBe("out_of_stock");
    const exact = curatedProducts.map((p, i) => (i === 2 ? { ...p, stock: 2 } : p));
    expect(validateCurated({ products: exact }).ok).toBe(true);
  });

  it("rejects a composition product that is hidden, deleted or missing", () => {
    expect(validateCurated({ products: curatedProducts.map((p, i) => (i === 0 ? { ...p, hidden: true } : p)) }).code).toBe(
      "product_unavailable",
    );
    expect(validateCurated({ products: curatedProducts.map((p, i) => (i === 1 ? { ...p, deleted: true } : p)) }).code).toBe(
      "product_unavailable",
    );
    expect(validateCurated({ products: curatedProducts.slice(1) }).code).toBe("product_unavailable");
  });

  it("rejects a curated campaign with an empty composition", () => {
    expect(validateCurated({ composition: [], poolProductIds: [] }).code).toBe("invalid_pricing");
  });

  it("rejects draft, scheduled and expired curated campaigns", () => {
    for (const c of [
      curatedCampaign({ isActive: false }),
      curatedCampaign({ startsAt: FUTURE }),
      curatedCampaign({ endsAt: PAST }),
    ]) {
      expect(validateCurated({ campaign: c }).code).toBe("campaign_not_live");
    }
  });

  it("exposes the campaign type so callers can tell the two models apart", () => {
    expect(validateCurated().campaign?.type).toBe("curated_stack");
  });
});
