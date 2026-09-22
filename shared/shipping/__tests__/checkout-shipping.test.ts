import { describe, expect, it } from "vitest";
import { canPlaceOrderWithShipping, deriveShippingLine } from "../checkout-shipping";
import type { ShippingQuoteResponse } from "../quote";
import { computeCartTotals } from "#root/shared/bundles/cart-pricing";

/**
 * The cart context's shipping pipeline, end to end and pure: server quote →
 * summary line → totals. This is exactly what the checkout page renders from,
 * so "the total updates when a governorate is picked" is provable here
 * without a DOM.
 */

const pendingZones: ShippingQuoteResponse = {
  mode: "zones",
  quote: { available: false, provider: "manual_zone", reason: "destination_required", governorateCode: null, governorateName: null },
};
const cairoQuoted: ShippingQuoteResponse = {
  mode: "zones",
  quote: {
    available: true,
    provider: "manual_zone",
    method: "standard",
    amount: 60,
    currency: "EGP",
    rateSource: "governorate_rate",
    governorateCode: "CAI",
    governorateName: "Cairo",
  },
};
const sinaiUnavailable: ShippingQuoteResponse = {
  mode: "zones",
  quote: { available: false, provider: "manual_zone", reason: "destination_unavailable", governorateCode: "SSI", governorateName: "South Sinai" },
};
const flatQuoted: ShippingQuoteResponse = {
  mode: "flat",
  quote: { available: true, provider: "flat", method: "standard", amount: 45, currency: "EGP", rateSource: "flat", governorateCode: null, governorateName: null },
};

const noOffers: { freeShipping: boolean }[] = [];
const freeShippingOffer = [{ freeShipping: true }];

const goods = { regularLines: [{ id: "p1", name: "Stud", quantity: 2, price: 150 }], bundles: [], offerDiscount: 0, promo: null };

describe("deriveShippingLine", () => {
  it("no quote yet → pending, fee 0", () => {
    expect(deriveShippingLine(null, noOffers)).toEqual({ status: "pending", fee: 0, baseFee: 0 });
    expect(deriveShippingLine(undefined, noOffers)).toEqual({ status: "pending", fee: 0, baseFee: 0 });
  });

  it("zones mode before a destination → pending ('Calculated at checkout')", () => {
    expect(deriveShippingLine(pendingZones, noOffers)).toEqual({ status: "pending", fee: 0, baseFee: 0 });
  });

  it("a quoted destination → the exact fee", () => {
    expect(deriveShippingLine(cairoQuoted, noOffers)).toEqual({
      status: "quoted",
      baseFee: 60,
      fee: 60,
      freeShipping: false,
      governorateName: "Cairo",
    });
  });

  it("a free-shipping offer zeroes the charged fee but keeps the rule fee", () => {
    expect(deriveShippingLine(cairoQuoted, freeShippingOffer)).toEqual({
      status: "quoted",
      baseFee: 60,
      fee: 0,
      freeShipping: true,
      governorateName: "Cairo",
    });
  });

  it("a free-shipping offer on a 0 rate is not reported as 'free shipping applied'", () => {
    const zeroRate: ShippingQuoteResponse = { ...cairoQuoted, quote: { ...cairoQuoted.quote, amount: 0 } as never };
    expect(deriveShippingLine(zeroRate, freeShippingOffer)).toMatchObject({ fee: 0, freeShipping: false });
  });

  it("an unavailable destination → unavailable, and ordering is blocked", () => {
    const line = deriveShippingLine(sinaiUnavailable, noOffers);
    expect(line).toEqual({ status: "unavailable", fee: 0, baseFee: 0, governorateName: "South Sinai" });
    expect(canPlaceOrderWithShipping(line)).toBe(false);
  });

  it("flat mode is quoted immediately with no destination (old cart behaviour)", () => {
    expect(deriveShippingLine(flatQuoted, noOffers)).toMatchObject({ status: "quoted", fee: 45, governorateName: null });
  });

  it("only a quoted line allows ordering", () => {
    expect(canPlaceOrderWithShipping(deriveShippingLine(pendingZones, noOffers))).toBe(false);
    expect(canPlaceOrderWithShipping(deriveShippingLine(cairoQuoted, noOffers))).toBe(true);
    expect(canPlaceOrderWithShipping(deriveShippingLine(cairoQuoted, freeShippingOffer))).toBe(true);
  });
});

describe("checkout totals follow the governorate selection", () => {
  const totalsFor = (response: ShippingQuoteResponse | null, offers: { freeShipping: boolean }[]) => {
    const line = deriveShippingLine(response, offers);
    return {
      line,
      totals: computeCartTotals({ ...goods, baseShippingFee: line.baseFee, freeShipping: offers.some((o) => o.freeShipping) }),
    };
  };

  it("before a destination the total is the goods total and the line is pending", () => {
    const { line, totals } = totalsFor(pendingZones, noOffers);
    expect(line.status).toBe("pending");
    expect(totals.shipping).toBe(0);
    expect(totals.total).toBe(300);
  });

  it("selecting Cairo adds the exact fee to the total immediately", () => {
    const { line, totals } = totalsFor(cairoQuoted, noOffers);
    expect(line.status).toBe("quoted");
    expect(totals.shipping).toBe(60);
    expect(totals.total).toBe(360);
  });

  it("switching to an unavailable governorate drops the fee and blocks ordering", () => {
    const { line, totals } = totalsFor(sinaiUnavailable, noOffers);
    expect(line.status).toBe("unavailable");
    expect(totals.total).toBe(300);
    expect(canPlaceOrderWithShipping(line)).toBe(false);
  });

  it("a free-shipping offer overrides the zone fee in the total", () => {
    const { totals } = totalsFor(cairoQuoted, freeShippingOffer);
    expect(totals.shipping).toBe(0);
    expect(totals.total).toBe(300);
  });
});
