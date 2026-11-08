import { describe, expect, it } from "vitest";
import {
  computeCartTotals,
  meetsFreeShippingMinimumMinor,
  type PricingBundle,
  type PricingRegularLine,
} from "../cart-pricing";
import { deriveShippingLine } from "#root/shared/shipping/checkout-shipping";
import type { ShippingQuoteResponse } from "#root/shared/shipping/quote";

/**
 * Free shipping once the FINAL merchandise amount — after set/bundle pricing,
 * automatic offers and promo codes, excluding shipping — reaches the store's
 * minimum (EGP 1,000). One rule, in computeCartTotals, shared by the cart
 * preview and create-order.
 */

const MIN = 1000;
const CAIRO_FEE = 70;

const line = (id: string, quantity: number, price: number): PricingRegularLine => ({ id, name: id, quantity, price });

/** A percentage Pick Your Set as the server prices it: exclusive, charged regular × (1 − pct). */
const pctSet = (instanceId: string, regularTotal: number, percent: number, freeShipping = false): PricingBundle => ({
  instanceId,
  offerStacking: "exclusive",
  regularTotal,
  bundleTotal: Math.round(regularTotal * (100 - percent)) / 100,
  freeShipping,
  items: [{ productId: `${instanceId}-x`, name: "x", quantity: 1, unitPrice: regularTotal }],
});

/** A fixed-total set: 6 × 100 regular, charged 480. */
const fixedSet = (instanceId: string): PricingBundle => ({
  instanceId,
  offerStacking: "exclusive",
  regularTotal: 600,
  bundleTotal: 480,
  items: ["A", "B", "C", "D", "E", "F"].map((id) => ({ productId: id, name: id, quantity: 1, unitPrice: 100 })),
});

const base = {
  offerDiscount: 0,
  promo: null,
  baseShippingFee: CAIRO_FEE,
  freeShipping: false,
  freeShippingMinimumAfterDiscounts: MIN,
};

describe("free-shipping minimum — bundles / sets", () => {
  it("full value 1,000 but 20% off → 800 payable → shipping charged", () => {
    const t = computeCartTotals({ ...base, regularLines: [], bundles: [pctSet("s1", 1000, 20)] });
    expect(t.subtotal).toBe(1000); // the list value is NOT the basis
    expect(t.merchandiseTotalAfterDiscounts).toBe(800);
    expect(t.thresholdFreeShipping).toBe(false);
    expect(t.freeShippingSource).toBeNull();
    expect(t.shipping).toBe(CAIRO_FEE);
    expect(t.total).toBe(870);
  });

  it("an exclusive set is invisible to the offer base but counts toward the minimum at its charged price", () => {
    const t = computeCartTotals({ ...base, regularLines: [], bundles: [pctSet("s1", 1250, 20)] });
    expect(t.offerBase).toBe(0);
    expect(t.merchandiseTotalAfterDiscounts).toBe(1000);
    expect(t.thresholdFreeShipping).toBe(true);
    expect(t.freeShippingSource).toBe("threshold");
    expect(t.shipping).toBe(0);
    expect(t.total).toBe(1000);
  });

  it("two discounted sets totalling 1,600 → free shipping", () => {
    const t = computeCartTotals({ ...base, regularLines: [], bundles: [pctSet("s1", 1000, 20), pctSet("s2", 1000, 20)] });
    expect(t.merchandiseTotalAfterDiscounts).toBe(1600);
    expect(t.shipping).toBe(0);
    expect(t.total).toBe(1600);
  });

  it("two discounted sets whose list value passes 1,000 but payable value does not → shipping charged", () => {
    const t = computeCartTotals({ ...base, regularLines: [], bundles: [pctSet("s1", 600, 20), pctSet("s2", 600, 20)] });
    expect(t.subtotal).toBe(1200);
    expect(t.merchandiseTotalAfterDiscounts).toBe(960);
    expect(t.shipping).toBe(CAIRO_FEE);
    expect(t.total).toBe(1030);
  });

  it("a fixed-price set plus ordinary lines combine at what they cost (480 charged, not 600 regular)", () => {
    const t = computeCartTotals({ ...base, regularLines: [line("p1", 1, 520)], bundles: [fixedSet("s1")] });
    expect(t.merchandiseTotalAfterDiscounts).toBe(1000);
    expect(t.shipping).toBe(0);
    const under = computeCartTotals({ ...base, regularLines: [line("p1", 1, 519.99)], bundles: [fixedSet("s1")] });
    expect(under.shipping).toBe(CAIRO_FEE);
  });
});

describe("free-shipping minimum — promo codes", () => {
  it("1,100 before the code, 200 off → 900 → shipping charged", () => {
    const t = computeCartTotals({
      ...base,
      regularLines: [line("p1", 1, 1100)],
      bundles: [],
      promo: { discountType: "fixed_amount", discountValue: 200 },
    });
    expect(t.promoDiscount).toBe(200);
    expect(t.merchandiseTotalAfterDiscounts).toBe(900);
    expect(t.shipping).toBe(CAIRO_FEE);
    expect(t.total).toBe(970);
  });

  it("1,200 before the code, 10% off → 1,080 → free shipping", () => {
    const t = computeCartTotals({
      ...base,
      regularLines: [line("p1", 1, 1200)],
      bundles: [],
      promo: { discountType: "percentage", discountValue: 10 },
    });
    expect(t.merchandiseTotalAfterDiscounts).toBe(1080);
    expect(t.shipping).toBe(0);
    expect(t.freeShippingSource).toBe("threshold");
  });

  it("a set code (quantity rule, e.g. PICK3) that drops 1,200 to 960 removes eligibility", () => {
    const t = computeCartTotals({
      ...base,
      regularLines: [line("p1", 3, 400)],
      bundles: [],
      promo: { discountType: "percentage", discountValue: 20, quantityRule: { minQuantity: 3, maxQuantity: 3 } },
    });
    expect(t.promoPlan?.qualifies).toBe(true);
    expect(t.merchandiseTotalAfterDiscounts).toBe(960);
    expect(t.shipping).toBe(CAIRO_FEE);
  });
});

describe("free-shipping minimum — automatic offers", () => {
  it("an offer that takes 1,100 down to 950 → shipping charged", () => {
    const t = computeCartTotals({ ...base, regularLines: [line("p1", 1, 1100)], bundles: [], offerDiscount: 150 });
    expect(t.merchandiseTotalAfterDiscounts).toBe(950);
    expect(t.shipping).toBe(CAIRO_FEE);
  });

  it("an offer that leaves 1,100 → free shipping", () => {
    const t = computeCartTotals({ ...base, regularLines: [line("p1", 1, 1300)], bundles: [], offerDiscount: 200 });
    expect(t.merchandiseTotalAfterDiscounts).toBe(1100);
    expect(t.shipping).toBe(0);
  });

  it("offer + promo + a set together: the minimum sees every discount", () => {
    // 500 loose − 100 offer = 400; ordinary 10% code on that = 40 → 360; + 640 set (800 list, 20% off) = 1,000
    const t = computeCartTotals({
      ...base,
      regularLines: [line("p1", 1, 500)],
      bundles: [pctSet("s1", 800, 20)],
      offerDiscount: 100,
      promo: { discountType: "percentage", discountValue: 10 },
    });
    expect(t.merchandiseTotalAfterDiscounts).toBe(1000);
    expect(t.shipping).toBe(0);
  });
});

describe("free-shipping minimum — boundary (integer piasters)", () => {
  it("exactly 1,000.00 → free", () => {
    const t = computeCartTotals({ ...base, regularLines: [line("p1", 1, 1000)], bundles: [] });
    expect(t.shipping).toBe(0);
    expect(t.total).toBe(1000);
  });

  it("999.99 → charged", () => {
    const t = computeCartTotals({ ...base, regularLines: [line("p1", 1, 999.99)], bundles: [] });
    expect(t.thresholdFreeShipping).toBe(false);
    expect(t.shipping).toBe(CAIRO_FEE);
    expect(t.total).toBe(1069.99);
  });

  it("float noise cannot tip the comparison: 3 × 333.33 + 0.01 = 1,000.00 → free", () => {
    const t = computeCartTotals({ ...base, regularLines: [line("p1", 3, 333.33), line("p2", 1, 0.01)], bundles: [] });
    expect(t.merchandiseTotalAfterDiscounts).toBe(1000);
    expect(t.shipping).toBe(0);
  });

  it("meetsFreeShippingMinimumMinor compares in minor units and ignores an off / invalid minimum", () => {
    expect(meetsFreeShippingMinimumMinor(100_000, 1000)).toBe(true);
    expect(meetsFreeShippingMinimumMinor(99_999, 1000)).toBe(false);
    expect(meetsFreeShippingMinimumMinor(10_000_000, null)).toBe(false);
    expect(meetsFreeShippingMinimumMinor(10_000_000, undefined)).toBe(false);
    expect(meetsFreeShippingMinimumMinor(10_000_000, 0)).toBe(false);
  });
});

describe("free-shipping minimum — switched off / not supplied", () => {
  it("null minimum → shipping charged however large the cart", () => {
    const t = computeCartTotals({
      ...base,
      freeShippingMinimumAfterDiscounts: null,
      regularLines: [line("p1", 1, 5000)],
      bundles: [],
    });
    expect(t.shipping).toBe(CAIRO_FEE);
  });

  it("omitted minimum → the pre-existing behaviour", () => {
    const t = computeCartTotals({
      offerDiscount: 0,
      promo: null,
      baseShippingFee: CAIRO_FEE,
      freeShipping: false,
      regularLines: [line("p1", 1, 5000)],
      bundles: [],
    });
    expect(t.thresholdFreeShipping).toBe(false);
    expect(t.shipping).toBe(CAIRO_FEE);
  });
});

describe("existing free-shipping sources keep working, and shipping is zeroed once", () => {
  it("a free-shipping set below the minimum → free, source bundle", () => {
    const t = computeCartTotals({ ...base, regularLines: [], bundles: [pctSet("s1", 600, 20, true)] });
    expect(t.merchandiseTotalAfterDiscounts).toBe(480);
    expect(t.shipping).toBe(0);
    expect(t.freeShippingSource).toBe("bundle");
  });

  it("a free-shipping promo code below the minimum → free, source promo_code", () => {
    const t = computeCartTotals({
      ...base,
      regularLines: [line("p1", 1, 300)],
      bundles: [],
      promo: { discountType: "percentage", discountValue: 10, freeShipping: true },
    });
    expect(t.shipping).toBe(0);
    expect(t.freeShippingSource).toBe("promo_code");
  });

  it("a free-shipping automatic offer below the minimum → free, source offer", () => {
    const t = computeCartTotals({ ...base, regularLines: [line("p1", 1, 300)], bundles: [], freeShipping: true });
    expect(t.shipping).toBe(0);
    expect(t.freeShippingSource).toBe("offer");
  });

  it("a free-shipping set AND the minimum: shipping zeroed once, the set reported", () => {
    const t = computeCartTotals({ ...base, regularLines: [line("p1", 1, 900)], bundles: [pctSet("s1", 600, 20, true)] });
    expect(t.thresholdFreeShipping).toBe(true);
    expect(t.freeShippingSource).toBe("bundle");
    expect(t.total).toBe(1380);
  });
});

describe("cart / checkout preview agrees with the totals create-order computes", () => {
  const cairoQuote: ShippingQuoteResponse = {
    mode: "zones",
    quote: {
      available: true,
      provider: "manual_zone",
      method: "standard",
      amount: CAIRO_FEE,
      currency: "EGP",
      rateSource: "governorate_rate",
      governorateCode: "CAI",
      governorateName: "Cairo",
    },
    freeShippingMinimumAfterDiscounts: MIN,
  };
  const cases: [string, Parameters<typeof computeCartTotals>[0], number][] = [
    ["discounted single set below 1,000", { ...base, regularLines: [], bundles: [pctSet("s1", 1000, 20)] }, CAIRO_FEE],
    ["two sets above 1,000", { ...base, regularLines: [], bundles: [pctSet("s1", 1000, 20), pctSet("s2", 1000, 20)] }, 0],
    [
      "promo dropping below 1,000",
      { ...base, regularLines: [line("p1", 1, 1100)], bundles: [], promo: { discountType: "fixed_amount", discountValue: 200 } },
      CAIRO_FEE,
    ],
    ["exactly 1,000", { ...base, regularLines: [line("p1", 1, 1000)], bundles: [] }, 0],
  ];
  for (const [label, input, expectedFee] of cases) {
    it(`${label}: the checkout's shipping line equals totals.shipping (${expectedFee})`, () => {
      const t = computeCartTotals(input);
      const shown = deriveShippingLine(cairoQuote, [], { thresholdFreeShipping: t.thresholdFreeShipping });
      expect(t.shipping).toBe(expectedFee);
      expect(shown.fee).toBe(t.shipping);
    });
  }
});
