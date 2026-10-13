import { describe, expect, it } from "vitest";
import { deriveShippingLine } from "#root/shared/shipping/checkout-shipping";
import type { ShippingQuoteResponse } from "#root/shared/shipping/quote";
import { type CartPromoInput, computeCartTotals, type PricingBundle, type PricingRegularLine } from "../cart-pricing";
import { parseStoredBundleInstances } from "../cart-instance";

/**
 * Pick Your Set free shipping: a qualifying set waives the order's shipping
 * as part of its own benefit — percentage sets are exclusive, so no offer or
 * promo code could otherwise grant it. Only ever zeroes an available quote.
 */
const CAIRO_FEE = 70;

/** A PICK6-style percentage set: 6 pieces worth 1,075, charged 913.75. */
const pick6Set = (freeShipping: boolean | undefined): PricingBundle => ({
  instanceId: "s6",
  offerStacking: "exclusive",
  regularTotal: 1075,
  bundleTotal: 913.75,
  freeShipping,
  items: [
    { productId: "e1", name: "e1", quantity: 2, unitPrice: 150 },
    { productId: "e2", name: "e2", quantity: 1, unitPrice: 175 },
    { productId: "e3", name: "e3", quantity: 3, unitPrice: 200 },
  ],
});
/** A PICK3-style set without free shipping. */
const pick3Set: PricingBundle = {
  instanceId: "s3",
  offerStacking: "exclusive",
  regularTotal: 300,
  bundleTotal: 240,
  freeShipping: false,
  items: [{ productId: "e4", name: "e4", quantity: 3, unitPrice: 100 }],
};
const ring: PricingRegularLine = { id: "ring", name: "ring", quantity: 1, price: 200 };

const totals = (bundles: PricingBundle[], regularLines: PricingRegularLine[] = [], extra: Partial<Parameters<typeof computeCartTotals>[0]> = {}) =>
  computeCartTotals({
    regularLines,
    bundles,
    offerDiscount: 0,
    promo: null,
    baseShippingFee: CAIRO_FEE,
    freeShipping: false,
    ...extra,
  });

describe("Pick Your Set free shipping — cart totals", () => {
  it("free shipping OFF (PICK3-style) → normal governorate shipping", () => {
    const t = totals([pick3Set]);
    expect(t.bundleFreeShipping).toBe(false);
    expect(t.shipping).toBe(CAIRO_FEE);
    expect(t.total).toBe(240 + CAIRO_FEE);
  });

  it("free shipping ON (PICK6-style percentage set) → shipping 0, attributed to the set", () => {
    const t = totals([pick6Set(true)]);
    expect(t.bundleFreeShipping).toBe(true);
    expect(t.freeShippingSource).toBe("bundle");
    expect(t.shipping).toBe(0);
    expect(t.bundleSavings).toBe(161.25);
    expect(t.total).toBe(913.75);
  });

  it("existing campaigns (flag absent) keep normal shipping", () => {
    expect(totals([pick6Set(undefined)]).shipping).toBe(CAIRO_FEE);
  });

  it("removing the set removes the free shipping", () => {
    expect(totals([pick6Set(true)]).shipping).toBe(0);
    expect(totals([], [ring]).shipping).toBe(CAIRO_FEE);
  });

  it("mixed cart: the whole deliverable order ships free, unrelated items keep their price", () => {
    const t = totals([pick6Set(true)], [ring]);
    expect(t.shipping).toBe(0);
    expect(t.merchandiseSubtotal).toBe(200);
    expect(t.total).toBe(913.75 + 200);
  });

  it("several free-shipping sources zero shipping exactly once and change nothing else", () => {
    const pick6Code: CartPromoInput = {
      discountType: "percentage",
      discountValue: 15,
      quantityRule: { minQuantity: 1, maxQuantity: 1 },
      freeShipping: true,
    };
    const t = totals([pick6Set(true)], [ring], { freeShipping: true, promo: pick6Code });
    expect(t.shipping).toBe(0);
    expect(t.freeShippingSource).toBe("bundle");
    // 913.75 set + 200 ring − 30 (15% of the ring via the code) + 0 shipping
    expect(t.total).toBe(913.75 + 200 - 30);
    expect(t.subtotal - t.bundleSavings - t.offerDiscount - t.promoDiscount + t.shipping).toBe(t.total);
  });
});

describe("Pick Your Set free shipping — shipping line", () => {
  const cairo: ShippingQuoteResponse = {
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
  };
  const sinai: ShippingQuoteResponse = {
    mode: "zones",
    quote: {
      available: false,
      provider: "manual_zone",
      reason: "destination_unavailable",
      governorateCode: "SSI",
      governorateName: "South Sinai",
    },
  };

  it("zeroes a deliverable governorate's fee", () => {
    expect(deriveShippingLine(cairo, [], { bundleFreeShipping: true })).toMatchObject({
      status: "quoted",
      baseFee: CAIRO_FEE,
      fee: 0,
      freeShipping: true,
    });
  });

  it("never makes an unavailable governorate deliverable", () => {
    expect(deriveShippingLine(sinai, [], { bundleFreeShipping: true }).status).toBe("unavailable");
  });

  it("off → the governorate fee", () => {
    expect(deriveShippingLine(cairo, [], { bundleFreeShipping: false }).fee).toBe(CAIRO_FEE);
  });
});

describe("cart persistence", () => {
  it("keeps a stored set's free-shipping flag and defaults older carts to false", () => {
    const base = {
      instanceId: "i1",
      campaignId: "c1",
      campaignSlug: "pick-6",
      campaignTitle: "Pick 6",
      requiredQuantity: 1,
      bundlePrice: 100,
      offerStacking: "exclusive",
      items: [{ productId: "p", name: "p", quantity: 1, unitPrice: 100 }],
    };
    const [withFlag] = parseStoredBundleInstances(JSON.stringify([{ ...base, freeShipping: true }]));
    const [legacy] = parseStoredBundleInstances(JSON.stringify([base]));
    expect(withFlag?.freeShipping).toBe(true);
    expect(legacy?.freeShipping).toBeUndefined();
  });
});
