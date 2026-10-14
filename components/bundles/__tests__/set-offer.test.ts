import { describe, expect, it } from "vitest";
import { translations } from "#root/lib/i18n/translations";
import { builderForCode, describeSetOffer } from "../set-offer";

const en = (key: string) => translations.en[key] ?? key;
const ar = (key: string) => translations.ar[key] ?? key;

type Tier = { id: string | null; quantity: number; price: number | null; discountPercent: number | null; availability: "available"; valueRange: null };
const tier = (quantity: number, discountPercent: number | null, price: number | null = null): Tier => ({
  id: `t${quantity}`,
  quantity,
  price,
  discountPercent,
  availability: "available",
  valueRange: null,
});

const pick3 = {
  slug: "pick-your-3",
  tiers: [tier(3, 20)],
  pricingType: "percentage_discount" as const,
  freeShipping: false,
  requiredQuantity: 3,
  fixedBundlePrice: null,
  availability: "available" as const,
};
const pick6 = { ...pick3, slug: "pick-your-6", tiers: [tier(6, 15)], requiredQuantity: 6, freeShipping: true };

describe("describeSetOffer — what a Pick Your Set card says", () => {
  it("Pick Your 3: the campaign's own percentage, exact piece rule, piece-count CTA", () => {
    expect(describeSetOffer(pick3, en, "EGP")).toEqual({
      headline: "20% off",
      freeShipping: false,
      pieces: 3,
      rule: "Choose exactly 3 individual pieces.",
      cta: "Shop 3 pieces",
      soldOut: false,
    });
  });

  it("Pick Your 6: 15% off + free shipping, straight from the campaign flags", () => {
    const offer = describeSetOffer(pick6, en, "EGP");
    expect(offer.headline).toBe("15% off");
    expect(offer.freeShipping).toBe(true);
    expect(offer.cta).toBe("Shop 6 pieces");
    expect(offer.rule).toBe("Choose exactly 6 individual pieces.");
  });

  it("a fixed-total set quotes its real price", () => {
    const offer = describeSetOffer(
      { ...pick3, pricingType: "fixed_total" as const, tiers: [tier(3, null, 450)], fixedBundlePrice: 450 },
      en,
      "EGP",
    );
    expect(offer.headline).toMatch(/^3 for EGP\s?450$/);
  });

  it("a multi-size set states the span and the best percentage, never one size", () => {
    const offer = describeSetOffer({ ...pick3, tiers: [tier(3, 20), tier(6, 15)] }, en, "EGP");
    expect(offer).toMatchObject({ headline: "Up to 20% off", pieces: null, cta: "Build your set" });
    expect(offer.rule).toBe("Choose 3–6 individual pieces.");
  });

  it("a sold-out pool is reported, not hidden", () => {
    expect(describeSetOffer({ ...pick3, availability: "sold_out" as never }, en, "EGP").soldOut).toBe(true);
  });

  it("speaks Arabic", () => {
    const offer = describeSetOffer(pick6, ar, "EGP");
    expect(offer.headline).toBe("خصم 15%");
    expect(offer.cta).toBe("تسوّقي 6 قطع");
  });
});

describe("builderForCode — the builder a public promo code points to", () => {
  const code = (min: number | null, max: number | null, extra: Record<string, unknown> = {}) => ({
    discountType: "percentage" as const,
    discountValue: 20,
    eligibleMinQuantity: min,
    eligibleMaxQuantity: max,
    ...extra,
  });

  it("PICK3 (exactly 3) → the 3-piece set; PICK6 → the 6-piece set", () => {
    expect(builderForCode(code(3, 3), [pick3, pick6])?.slug).toBe("pick-your-3");
    expect(builderForCode(code(6, 6, { discountValue: 15, freeShipping: true }), [pick3, pick6])?.slug).toBe("pick-your-6");
  });

  it("prefers the set whose terms match the code when several share a size", () => {
    const fixed3 = { ...pick3, slug: "three-for-450", pricingType: "fixed_total" as const, tiers: [tier(3, null, 450)] };
    expect(builderForCode(code(3, 3), [fixed3, pick3])?.slug).toBe("pick-your-3");
  });

  it("no exact quantity rule, or no set of that size → no builder", () => {
    expect(builderForCode(code(null, null), [pick3, pick6])).toBeNull();
    expect(builderForCode(code(3, 6), [pick3, pick6])).toBeNull();
    expect(builderForCode(code(4, 4), [pick3, pick6])).toBeNull();
  });
});
