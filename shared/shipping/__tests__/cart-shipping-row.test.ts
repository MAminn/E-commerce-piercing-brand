import { describe, expect, it } from "vitest";
import { cartSummaryShipping, deriveShippingLine, isShippingWaived } from "../checkout-shipping";
import type { ShippingQuoteResponse } from "../quote";

/**
 * The cart page's shipping row: "Free" as soon as a destination-independent
 * free-shipping benefit is in the cart, otherwise exactly what it said before.
 */
const pendingZones: ShippingQuoteResponse = {
  mode: "zones",
  quote: { available: false, provider: "manual_zone", reason: "destination_required", governorateCode: null, governorateName: null },
};
const cairo: ShippingQuoteResponse = {
  mode: "zones",
  quote: {
    available: true,
    provider: "manual_zone",
    method: "standard",
    amount: 70,
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

const row = (response: ShippingQuoteResponse | null, waivers: { bundleFreeShipping?: boolean; promoFreeShipping?: boolean }, offers: { freeShipping: boolean }[] = []) =>
  cartSummaryShipping(
    deriveShippingLine(response, offers, waivers),
    response?.mode ?? "flat",
    isShippingWaived(offers, waivers),
  );

describe("isShippingWaived", () => {
  it("a valid free-shipping set, a qualifying free-shipping code or a free-shipping offer each waive it", () => {
    expect(isShippingWaived([], { bundleFreeShipping: true })).toBe(true);
    expect(isShippingWaived([], { promoFreeShipping: true })).toBe(true);
    expect(isShippingWaived([{ freeShipping: true }])).toBe(true);
  });

  it("nothing qualifying → not waived", () => {
    expect(isShippingWaived([{ freeShipping: false }], { bundleFreeShipping: false, promoFreeShipping: false })).toBe(false);
  });
});

describe("cartSummaryShipping", () => {
  it("valid PICK6, no governorate yet → Free (0, waived), not 'Calculated at checkout'", () => {
    expect(row(pendingZones, { bundleFreeShipping: true })).toEqual({ shipping: 0, shippingStatus: "waived" });
  });

  it("the same while the first quote is still loading", () => {
    expect(row(null, { bundleFreeShipping: true })).toEqual({ shipping: 0, shippingStatus: "waived" });
  });

  it("the set stops qualifying (5/6, PICK3) → back to pending", () => {
    expect(row(pendingZones, { bundleFreeShipping: false })).toEqual({ shipping: undefined, shippingStatus: "pending" });
  });

  it("a normal cart → pending until a governorate is quoted, then the fee", () => {
    expect(row(pendingZones, {})).toEqual({ shipping: undefined, shippingStatus: "pending" });
    expect(row(cairo, {})).toEqual({ shipping: 70, shippingStatus: "quoted" });
  });

  it("a quoted destination with PICK6 is the existing quoted Free", () => {
    expect(row(cairo, { bundleFreeShipping: true })).toEqual({ shipping: 0, shippingStatus: "quoted" });
  });

  it("an unavailable destination stays unavailable — no free-shipping promise there", () => {
    expect(row(sinaiUnavailable, { bundleFreeShipping: true })).toEqual({ shipping: undefined, shippingStatus: "unavailable" });
    expect(row(sinaiUnavailable, { promoFreeShipping: true }, [{ freeShipping: true }]).shippingStatus).toBe("unavailable");
  });
});
