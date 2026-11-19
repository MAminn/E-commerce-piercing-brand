import { describe, expect, it } from "vitest";
import { DEFAULT_SHIPPING_RULES, type ShippingRulesConfig } from "../rules";
import { buildShippingPolicyFacts } from "../shipping-policy";

/**
 * A config shaped like production's (2026-11-19, as reported): zone rates by
 * governorate, four governorates explicitly unavailable, a post-discount
 * free-shipping minimum of EGP 800.01, and the product-page delivery text.
 */
const zones: ShippingRulesConfig = {
  version: 1,
  mode: "zones",
  currency: "EGP",
  rates: { CAI: 70, GIZ: 70, ALX: 80, QNA: null, ASW: null, RSA: null, NVL: null },
  fallbackFee: 95,
  freeShippingMinimumAfterDiscounts: 800.01,
};
const deliveryText =
  "Cairo: 3–4 days. Alexandria: 3–5 days. Other available governorates: 5–7 days.";

describe("buildShippingPolicyFacts", () => {
  it("reads every fact from the live settings", () => {
    const facts = buildShippingPolicyFacts({
      rules: zones,
      flatFee: 0,
      shippingText: deliveryText,
      shippingTextAr: "",
      cashOnDelivery: true,
    });
    expect(facts.fee).toEqual({ kind: "by_governorate" });
    expect(facts.freeShippingMinimum).toBe(800.01);
    expect(facts.unavailableGovernorates.map((g) => g.nameEn)).toEqual([
      "Qena",
      "Aswan",
      "Red Sea",
      "New Valley",
    ]);
    // Verbatim admin text; Arabic falls back to it when blank.
    expect(facts.deliveryText).toEqual({ en: deliveryText, ar: deliveryText });
    expect(facts.cashOnDelivery).toBe(true);
  });

  it("treats an unlisted governorate with no fallback fee as unavailable — as checkout does", () => {
    const facts = buildShippingPolicyFacts({
      rules: { ...zones, rates: { CAI: 70 }, fallbackFee: null },
      flatFee: 0,
      cashOnDelivery: true,
    });
    expect(facts.unavailableGovernorates).toHaveLength(26);
    expect(facts.unavailableGovernorates.map((g) => g.code)).not.toContain("CAI");
    expect(facts.fee).toEqual({ kind: "single", amount: 70 });
  });

  it("states a single fee when every deliverable governorate pays the same", () => {
    const facts = buildShippingPolicyFacts({
      rules: { ...zones, rates: { QNA: null }, fallbackFee: 60 },
      flatFee: 0,
      cashOnDelivery: true,
    });
    expect(facts.fee).toEqual({ kind: "single", amount: 60 });
  });

  it("flat mode: one fee, no unavailable governorates", () => {
    const facts = buildShippingPolicyFacts({
      rules: { ...DEFAULT_SHIPPING_RULES, freeShippingMinimumAfterDiscounts: null },
      flatFee: 50,
      cashOnDelivery: false,
    });
    expect(facts.fee).toEqual({ kind: "single", amount: 50 });
    expect(facts.unavailableGovernorates).toEqual([]);
    expect(facts.freeShippingMinimum).toBeNull();
    expect(facts.cashOnDelivery).toBe(false);
  });

  it("does not mention a free-shipping minimum when delivery is free anyway", () => {
    const facts = buildShippingPolicyFacts({ rules: DEFAULT_SHIPPING_RULES, flatFee: 0, cashOnDelivery: true });
    expect(facts.fee).toEqual({ kind: "free" });
    expect(facts.freeShippingMinimum).toBeNull();
  });

  it("omits delivery times when the admin wrote none", () => {
    const facts = buildShippingPolicyFacts({ rules: zones, flatFee: 0, shippingText: "  ", cashOnDelivery: true });
    expect(facts.deliveryText).toBeNull();
  });
});
