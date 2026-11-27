import { describe, expect, it } from "vitest";
import { compareAtDisplay, discountPercent, saleDisplay } from "#root/shared/pricing/sale-display";

describe("saleDisplay", () => {
  it("shows the paid price, the struck regular price and the percent off", () => {
    expect(saleDisplay(120, 96)).toEqual({ paid: 96, compareAt: 120, percentOff: 20 });
    expect(saleDisplay("150.00", "75.00")).toEqual({ paid: 75, compareAt: 150, percentOff: 50 });
  });

  it("rounds to the nearest whole percent, halves up", () => {
    expect(saleDisplay(175, 123).percentOff).toBe(30); // 29.71%
    expect(saleDisplay(175, 122).percentOff).toBe(30); // 30.29%
    expect(saleDisplay(225, 113).percentOff).toBe(50); // 49.78%
    expect(saleDisplay(225, 158).percentOff).toBe(30); // 29.78%
    expect(saleDisplay(175, 88).percentOff).toBe(50); // 49.71%
    expect(saleDisplay(200, 199).percentOff).toBe(1); // exactly 0.5% → up
    expect(saleDisplay(130, 91).percentOff).toBe(30);
    expect(saleDisplay(280, 224).percentOff).toBe(20);
  });

  it("is immune to float noise (computed in minor units)", () => {
    expect(discountPercent(0.3, 0.2)).toBe(33);
    expect(discountPercent(100.1, 80.08)).toBe(20);
  });

  it("no discount, an empty one, or an invalid one shows the regular price only", () => {
    const none = { paid: 120, compareAt: null, percentOff: null };
    expect(saleDisplay(120, null)).toEqual(none);
    expect(saleDisplay(120, undefined)).toEqual(none);
    expect(saleDisplay(120, "")).toEqual(none);
    expect(saleDisplay(120, 120)).toEqual(none); // equal is not a sale
    expect(saleDisplay(120, 130)).toEqual(none); // above the price is misconfigured
    expect(saleDisplay(120, -5)).toEqual(none);
    expect(saleDisplay(120, "abc")).toEqual(none);
  });

  it("a real discount that rounds to 0% keeps its strike but has no badge", () => {
    expect(saleDisplay(1000, 999.99)).toEqual({ paid: 999.99, compareAt: 1000, percentOff: null });
  });

  it("a free item is 100% off", () => {
    expect(saleDisplay(120, 0)).toEqual({ paid: 0, compareAt: 120, percentOff: 100 });
  });
});

describe("compareAtDisplay", () => {
  it("compares line prices as given (e.g. with option modifiers)", () => {
    expect(compareAtDisplay(146, 170)).toEqual({ paid: 146, compareAt: 170, percentOff: 14 });
    expect(compareAtDisplay(120, undefined)).toEqual({ paid: 120, compareAt: null, percentOff: null });
    expect(compareAtDisplay(120, 120)).toEqual({ paid: 120, compareAt: null, percentOff: null });
  });
});
