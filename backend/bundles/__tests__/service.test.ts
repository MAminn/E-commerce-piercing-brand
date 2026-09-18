import { describe, expect, it } from "vitest";
import {
  bundleSlugSchema,
  createBundleCampaignSchema,
  toBundleCampaignConfig,
  updateBundleCampaignSchema,
} from "../service";

const PRODUCT_IDS = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004",
  "00000000-0000-4000-8000-000000000005",
  "00000000-0000-4000-8000-000000000006",
];

const validInput = {
  internalName: "Sept stack promo",
  title: "Build Your Stack",
  slug: "build-your-stack",
  requiredQuantity: 6,
  fixedBundlePrice: 480,
  eligibleProductIds: PRODUCT_IDS,
};

describe("createBundleCampaignSchema — request validation", () => {
  it("accepts valid fixed-total bundle data and fills defaults", () => {
    const parsed = createBundleCampaignSchema.parse(validInput);
    expect(parsed).toMatchObject({
      type: "build_your_stack",
      pricingType: "fixed_total",
      isActive: false,
      allowDuplicates: false,
      isRepeatable: false,
      offerStacking: "exclusive",
      sortOrder: 0,
      requiredQuantity: 6,
      fixedBundlePrice: 480,
    });
  });

  it("rejects an invalid required quantity (0, negative, fractional)", () => {
    for (const requiredQuantity of [0, -1, 2.5]) {
      const result = createBundleCampaignSchema.safeParse({ ...validInput, requiredQuantity });
      expect(result.success, `requiredQuantity=${requiredQuantity}`).toBe(false);
    }
  });

  it("rejects an invalid bundle price (0, negative, sub-piaster precision)", () => {
    for (const fixedBundlePrice of [0, -480, 480.001]) {
      const result = createBundleCampaignSchema.safeParse({ ...validInput, fixedBundlePrice });
      expect(result.success, `fixedBundlePrice=${fixedBundlePrice}`).toBe(false);
    }
    expect(createBundleCampaignSchema.safeParse({ ...validInput, fixedBundlePrice: 479.5 }).success).toBe(true);
  });

  it("rejects an end date before the start date", () => {
    const result = createBundleCampaignSchema.safeParse({
      ...validInput,
      startsAt: "2026-10-01T00:00:00Z",
      endsAt: "2026-09-01T00:00:00Z",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "endsAt")).toBe(true);
    }
  });

  it("coerces ISO strings to dates for the schedule", () => {
    const parsed = createBundleCampaignSchema.parse({
      ...validInput,
      startsAt: "2026-09-01T00:00:00Z",
      endsAt: "2026-10-01T00:00:00Z",
    });
    expect(parsed.startsAt).toBeInstanceOf(Date);
    expect(parsed.endsAt).toBeInstanceOf(Date);
  });

  it("rejects maxPerProduct when duplicates are disabled", () => {
    const result = createBundleCampaignSchema.safeParse({ ...validInput, allowDuplicates: false, maxPerProduct: 2 });
    expect(result.success).toBe(false);
    expect(createBundleCampaignSchema.safeParse({ ...validInput, allowDuplicates: true, maxPerProduct: 2 }).success).toBe(true);
  });

  it("rejects non-uuid or duplicated eligible product ids", () => {
    expect(createBundleCampaignSchema.safeParse({ ...validInput, eligibleProductIds: ["not-a-uuid"] }).success).toBe(false);
    expect(
      createBundleCampaignSchema.safeParse({ ...validInput, eligibleProductIds: [PRODUCT_IDS[0], PRODUCT_IDS[0]] }).success,
    ).toBe(false);
  });

  it("allows a draft with no eligible products (activation is enforced by the service)", () => {
    const parsed = createBundleCampaignSchema.parse({ ...validInput, eligibleProductIds: undefined });
    expect(parsed.eligibleProductIds).toEqual([]);
  });

  it("only accepts the pricing/campaign types that exist", () => {
    expect(createBundleCampaignSchema.safeParse({ ...validInput, pricingType: "percentage_off" }).success).toBe(false);
    expect(createBundleCampaignSchema.safeParse({ ...validInput, type: "mystery_box" }).success).toBe(false);
    // Phase 3 added curated stacks — both campaign types are now valid.
    expect(createBundleCampaignSchema.safeParse({ ...validInput, type: "build_your_stack" }).success).toBe(true);
    expect(
      createBundleCampaignSchema.safeParse({
        internalName: "Golden ear stack",
        title: "Golden Ear Stack",
        slug: "golden-ear-stack",
        type: "curated_stack",
        fixedBundlePrice: 450,
        composition: [{ productId: PRODUCT_IDS[0], quantity: 2 }],
      }).success,
    ).toBe(true);
  });
});

describe("bundleSlugSchema", () => {
  it("accepts lowercase hyphenated slugs", () => {
    expect(bundleSlugSchema.safeParse("build-your-stack").success).toBe(true);
    expect(bundleSlugSchema.safeParse("stack6").success).toBe(true);
  });

  it("rejects uppercase, spaces, leading/trailing or doubled hyphens", () => {
    for (const bad of ["Build-Your-Stack", "build your stack", "-stack", "stack-", "build--stack", ""]) {
      expect(bundleSlugSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe("updateBundleCampaignSchema", () => {
  it("is a partial patch keyed by id — a lone isActive toggle is a valid request", () => {
    const parsed = updateBundleCampaignSchema.parse({ id: PRODUCT_IDS[0], isActive: true });
    expect(parsed).toEqual({ id: PRODUCT_IDS[0], isActive: true });
  });

  it("does not inject defaults for omitted fields (so a patch can't silently reset them)", () => {
    const parsed = updateBundleCampaignSchema.parse({ id: PRODUCT_IDS[0], title: "New title" });
    expect("offerStacking" in parsed).toBe(false);
    expect("sortOrder" in parsed).toBe(false);
  });

  it("still validates the fields it does receive", () => {
    expect(updateBundleCampaignSchema.safeParse({ id: PRODUCT_IDS[0], requiredQuantity: 0 }).success).toBe(false);
    expect(updateBundleCampaignSchema.safeParse({ id: PRODUCT_IDS[0], fixedBundlePrice: -1 }).success).toBe(false);
    expect(updateBundleCampaignSchema.safeParse({ id: "nope" }).success).toBe(false);
  });
});

describe("toBundleCampaignConfig", () => {
  it("converts the DB's decimal string price to a number for the domain rules", () => {
    const config = toBundleCampaignConfig(
      {
        type: "build_your_stack",
        requiredQuantity: 6,
        pricingType: "fixed_total",
        fixedBundlePrice: "480.00",
        allowDuplicates: false,
        maxPerProduct: null,
        isRepeatable: false,
      },
      PRODUCT_IDS,
    );
    expect(config.fixedBundlePrice).toBe(480);
    expect(config.eligibleProductIds).toBe(PRODUCT_IDS);
  });
});
