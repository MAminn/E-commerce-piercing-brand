import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHIPPING_RULES,
  MAX_SHIPPING_FEE,
  countConfiguredRates,
  parseShippingRules,
  resolveZoneRate,
  shippingRulesConfigSchema,
  validateShippingRules,
  type ShippingRulesConfig,
} from "../rules";

const zones = (overrides: Partial<ShippingRulesConfig> = {}): ShippingRulesConfig => ({
  version: 1,
  mode: "zones",
  currency: "EGP",
  rates: { CAI: 60, ALX: 75 },
  fallbackFee: 90,
  ...overrides,
});

describe("parseShippingRules — what the jsonb column resolves to", () => {
  it("NULL / missing → the flat default (pre-zones behaviour)", () => {
    expect(parseShippingRules(null)).toEqual(DEFAULT_SHIPPING_RULES);
    expect(parseShippingRules(undefined)).toEqual(DEFAULT_SHIPPING_RULES);
    expect(DEFAULT_SHIPPING_RULES.mode).toBe("flat");
  });

  it("garbage → the flat default rather than a crash", () => {
    expect(parseShippingRules("zones")).toEqual(DEFAULT_SHIPPING_RULES);
    expect(parseShippingRules({ mode: "zones" })).toEqual(DEFAULT_SHIPPING_RULES);
    expect(parseShippingRules({ ...zones(), rates: { NOPE: 5 } })).toEqual(DEFAULT_SHIPPING_RULES);
  });

  it("a valid zones config round-trips", () => {
    expect(parseShippingRules(zones())).toEqual(zones());
  });
});

describe("shippingRulesConfigSchema — fee constraints", () => {
  it("rejects negative, over-ceiling and sub-piaster fees", () => {
    expect(shippingRulesConfigSchema.safeParse(zones({ rates: { CAI: -1 } })).success).toBe(false);
    expect(shippingRulesConfigSchema.safeParse(zones({ rates: { CAI: MAX_SHIPPING_FEE + 1 } })).success).toBe(false);
    expect(shippingRulesConfigSchema.safeParse(zones({ rates: { CAI: 12.345 } })).success).toBe(false);
    expect(shippingRulesConfigSchema.safeParse(zones({ fallbackFee: -5 })).success).toBe(false);
  });

  it("accepts 0, two-decimal fees, explicit null (unavailable) and a null fallback", () => {
    expect(shippingRulesConfigSchema.safeParse(zones({ rates: { CAI: 0, GIZ: 12.25, SSI: null } })).success).toBe(true);
    expect(shippingRulesConfigSchema.safeParse(zones({ fallbackFee: null })).success).toBe(true);
  });

  it("only accepts EGP", () => {
    expect(shippingRulesConfigSchema.safeParse({ ...zones(), currency: "USD" }).success).toBe(false);
  });
});

describe("validateShippingRules — the zones-mode gate", () => {
  it("refuses zones mode with no rates AND no fallback (no order could be placed)", () => {
    const problem = validateShippingRules(zones({ rates: {}, fallbackFee: null }));
    expect(problem).toMatch(/at least one governorate rate or a fee for other governorates/i);
  });

  it("refuses zones mode when every rate is 'unavailable' and there is no fallback", () => {
    expect(validateShippingRules(zones({ rates: { CAI: null, ALX: null }, fallbackFee: null }))).not.toBeNull();
  });

  it("allows zones mode with one rate and no fallback", () => {
    expect(validateShippingRules(zones({ rates: { CAI: 60 }, fallbackFee: null }))).toBeNull();
  });

  it("allows zones mode with no rates but a fallback", () => {
    expect(validateShippingRules(zones({ rates: {}, fallbackFee: 90 }))).toBeNull();
  });

  it("never gates flat mode", () => {
    expect(validateShippingRules({ ...DEFAULT_SHIPPING_RULES })).toBeNull();
    expect(validateShippingRules(zones({ mode: "flat", rates: {}, fallbackFee: null }))).toBeNull();
  });

  it("countConfiguredRates ignores unavailable entries", () => {
    expect(countConfiguredRates(zones({ rates: { CAI: 60, ALX: null, GIZ: 0 } }))).toBe(2);
  });
});

describe("resolveZoneRate — per-governorate lookup", () => {
  it("returns the governorate's own rate when set", () => {
    expect(resolveZoneRate(zones(), "CAI")).toEqual({ kind: "governorate_rate", fee: 60 });
    expect(resolveZoneRate(zones(), "ALX")).toEqual({ kind: "governorate_rate", fee: 75 });
  });

  it("a 0 rate is a real (free) rate, not 'absent'", () => {
    expect(resolveZoneRate(zones({ rates: { CAI: 0 } }), "CAI")).toEqual({ kind: "governorate_rate", fee: 0 });
  });

  it("falls back to the explicit fallback fee for an unlisted governorate", () => {
    expect(resolveZoneRate(zones(), "ASW")).toEqual({ kind: "fallback", fee: 90 });
  });

  it("an unlisted governorate with a null fallback is unavailable", () => {
    expect(resolveZoneRate(zones({ fallbackFee: null }), "ASW")).toEqual({
      kind: "unavailable",
      reason: "no_fallback",
    });
  });

  it("an explicitly null governorate is unavailable even when a fallback exists", () => {
    expect(resolveZoneRate(zones({ rates: { SSI: null } }), "SSI")).toEqual({
      kind: "unavailable",
      reason: "governorate_unavailable",
    });
  });
});
