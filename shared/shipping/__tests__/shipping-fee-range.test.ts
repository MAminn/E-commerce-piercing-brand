import { describe, expect, it } from "vitest";
import { DEFAULT_SHIPPING_RULES, type ShippingRulesConfig } from "../rules";
import { EGYPT_GOVERNORATES } from "../egypt-governorates";
import { resolveShippingFeeRange } from "../shipping-policy";
import { formatShippingFeeRange } from "#root/shared/config/storefront";

/**
 * The product page / bag delivery-fee span comes from the live shipping rules
 * — the same per-governorate resolution /shipping-policy and checkout use —
 * never from a constant.
 */

/** Shaped like production on 2026-11-19: lowest 80 (CAI/GIZ), highest 150, four governorates unavailable. */
const live: ShippingRulesConfig = {
  version: 1,
  mode: "zones",
  currency: "EGP",
  rates: {
    CAI: 80,
    GIZ: 80,
    ALX: 100,
    LXR: 150,
    MTR: 150,
    NSI: 150,
    SSI: 150,
    ASW: null,
    NVL: null,
    QNA: null,
    RSA: null,
  },
  fallbackFee: 120,
  freeShippingMinimumAfterDiscounts: 800.01,
};

describe("resolveShippingFeeRange", () => {
  it("zone rules with unavailable governorates → min/max of what deliverable destinations pay", () => {
    expect(resolveShippingFeeRange(live, 0)).toEqual({ min: 80, max: 150 });
  });

  it("ignores null (unavailable) governorates entirely", () => {
    const rules = { ...live, rates: { CAI: 90, ALX: 110, QNA: null }, fallbackFee: null };
    expect(resolveShippingFeeRange(rules, 0)).toEqual({ min: 90, max: 110 });
  });

  it("counts the fallback fee when unlisted governorates actually pay it", () => {
    const rules = { ...live, rates: { CAI: 80 }, fallbackFee: 200 };
    expect(resolveShippingFeeRange(rules, 0)).toEqual({ min: 80, max: 200 });
  });

  it("does not count a fallback fee that no governorate reaches", () => {
    // Every governorate listed explicitly → the fallback is never charged.
    const rates = Object.fromEntries(EGYPT_GOVERNORATES.map((g) => [g.code, 70])) as ShippingRulesConfig["rates"];
    const rules: ShippingRulesConfig = { ...live, rates, fallbackFee: 999 };
    expect(resolveShippingFeeRange(rules, 0)).toEqual({ min: 70, max: 70 });
  });

  it("flat mode → the flat fee", () => {
    expect(resolveShippingFeeRange(DEFAULT_SHIPPING_RULES, 60)).toEqual({ min: 60, max: 60 });
  });

  it("no fee charged anywhere → null (the line is hidden)", () => {
    expect(resolveShippingFeeRange(DEFAULT_SHIPPING_RULES, 0)).toBeNull();
  });

  it("no deliverable destination → null", () => {
    const rules = { ...live, rates: { CAI: null }, fallbackFee: null };
    expect(resolveShippingFeeRange(rules, 0)).toBeNull();
  });
});

describe("formatShippingFeeRange", () => {
  it("formats a span in both languages", () => {
    expect(formatShippingFeeRange({ min: 80, max: 150 }, "en")).toBe("EGP 80–150");
    expect(formatShippingFeeRange({ min: 80, max: 150 }, "ar")).toBe("80–150 ج.م");
  });

  it("states one amount when every destination pays the same", () => {
    expect(formatShippingFeeRange({ min: 60, max: 60 })).toBe("EGP 60");
  });

  it("keeps piasters when a fee has them", () => {
    expect(formatShippingFeeRange({ min: 79.5, max: 150 })).toBe("EGP 79.50–150");
  });
});
