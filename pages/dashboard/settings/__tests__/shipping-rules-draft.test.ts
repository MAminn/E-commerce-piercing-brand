import { describe, expect, it, vi } from "vitest";

// The card module pulls in the tRPC client and sonner for the live component;
// only the pure draft → rules builder is exercised here.
vi.mock("#root/shared/trpc/client", () => ({ trpc: {} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { buildRulesFromDraft, freeShippingMinimumDraftFromRules } from "../ShippingSettingsCard";
import { DEFAULT_SHIPPING_RULES } from "#root/shared/shipping/rules";
import { EGYPT_GOVERNORATES, type GovernorateCode } from "#root/shared/shipping/egypt-governorates";

type Row = { fee: string; unavailable: boolean };
const blankRates = () => {
  const rates = {} as Record<GovernorateCode, Row>;
  for (const g of EGYPT_GOVERNORATES) rates[g.code] = { fee: "", unavailable: false };
  return rates;
};
const withRows = (rows: Partial<Record<GovernorateCode, Row>>) => ({ ...blankRates(), ...rows });

describe("admin shipping card — draft validation", () => {
  it("refuses zones mode with every row blank and no 'other governorates' fee", () => {
    const built = buildRulesFromDraft({ mode: "zones", rates: blankRates(), fallback: { fee: "", unavailable: false } });
    expect(built).toHaveProperty("error");
    expect((built as { error: string }).error).toMatch(/at least one governorate rate or a fee for other governorates/i);
  });

  it("refuses zones mode when the fallback is marked unavailable and no row has a rate", () => {
    const built = buildRulesFromDraft({
      mode: "zones",
      rates: withRows({ CAI: { fee: "", unavailable: true } }),
      fallback: { fee: "", unavailable: true },
    });
    expect(built).toHaveProperty("error");
  });

  it("accepts zones mode with a single governorate rate", () => {
    const built = buildRulesFromDraft({
      mode: "zones",
      rates: withRows({ CAI: { fee: "60", unavailable: false } }),
      fallback: { fee: "", unavailable: true },
    });
    expect(built).toEqual({
      rules: { version: 1, mode: "zones", currency: "EGP", rates: { CAI: 60 }, fallbackFee: null },
    });
  });

  it("accepts zones mode with only an 'other governorates' fee", () => {
    const built = buildRulesFromDraft({ mode: "zones", rates: blankRates(), fallback: { fee: "90", unavailable: false } });
    expect(built).toEqual({ rules: { version: 1, mode: "zones", currency: "EGP", rates: {}, fallbackFee: 90 } });
  });

  it("maps blank → absent (fallback), 'not available' → null, number → rate", () => {
    const built = buildRulesFromDraft({
      mode: "zones",
      rates: withRows({
        CAI: { fee: "60", unavailable: false },
        ALX: { fee: "75.50", unavailable: false },
        SSI: { fee: "", unavailable: true },
        GIZ: { fee: "", unavailable: false },
      }),
      fallback: { fee: "90", unavailable: false },
    });
    expect(built).toEqual({
      rules: { version: 1, mode: "zones", currency: "EGP", rates: { CAI: 60, ALX: 75.5, SSI: null }, fallbackFee: 90 },
    });
  });

  it("rejects a negative, absurd or sub-piaster fee and names the row", () => {
    for (const bad of ["-5", "99999", "12.345", "abc"]) {
      const built = buildRulesFromDraft({
        mode: "zones",
        rates: withRows({ DKH: { fee: bad, unavailable: false } }),
        fallback: { fee: "90", unavailable: false },
      });
      expect(built).toHaveProperty("error");
      expect((built as { error: string }).error).toContain("Dakahlia");
    }
    const badFallback = buildRulesFromDraft({ mode: "zones", rates: blankRates(), fallback: { fee: "-1", unavailable: false } });
    expect((badFallback as { error: string }).error).toContain("Other governorates");
  });

  it("flat mode never trips the zones gate but still keeps the drafted rates", () => {
    const built = buildRulesFromDraft({
      mode: "flat",
      rates: withRows({ CAI: { fee: "60", unavailable: false } }),
      fallback: { fee: "", unavailable: true },
    });
    expect(built).toEqual({ rules: { version: 1, mode: "flat", currency: "EGP", rates: { CAI: 60 }, fallbackFee: null } });
    expect(buildRulesFromDraft({ mode: "flat", rates: blankRates(), fallback: { fee: "", unavailable: true } })).toHaveProperty("rules");
  });
});

describe("admin shipping card — free shipping minimum after discounts", () => {
  const zonesDraft = {
    mode: "zones" as const,
    rates: withRows({ CAI: { fee: "70", unavailable: false } }),
    fallback: { fee: "", unavailable: true },
  };

  it("loads the default 1,000 (enabled) from a config saved before the setting existed", () => {
    expect(freeShippingMinimumDraftFromRules(DEFAULT_SHIPPING_RULES)).toEqual({ enabled: true, amount: "1000" });
  });

  it("loads a stored minimum, and a switched-off one as disabled", () => {
    const stored = { ...DEFAULT_SHIPPING_RULES, freeShippingMinimumAfterDiscounts: 1250.5 };
    expect(freeShippingMinimumDraftFromRules(stored)).toEqual({ enabled: true, amount: "1250.5" });
    const off = { ...DEFAULT_SHIPPING_RULES, freeShippingMinimumAfterDiscounts: null };
    expect(freeShippingMinimumDraftFromRules(off)).toEqual({ enabled: false, amount: "1000" });
  });

  it("saves the minimum explicitly when enabled", () => {
    const built = buildRulesFromDraft({ ...zonesDraft, freeShippingMinimum: { enabled: true, amount: "1000" } });
    expect(built).toEqual({
      rules: { version: 1, mode: "zones", currency: "EGP", rates: { CAI: 70 }, fallbackFee: null, freeShippingMinimumAfterDiscounts: 1000 },
    });
  });

  it("saves null when switched off, whatever the amount box holds", () => {
    const built = buildRulesFromDraft({ ...zonesDraft, freeShippingMinimum: { enabled: false, amount: "" } });
    expect(built).toHaveProperty("rules.freeShippingMinimumAfterDiscounts", null);
  });

  it("saves in flat mode too — the minimum applies to both modes", () => {
    const built = buildRulesFromDraft({
      mode: "flat",
      rates: blankRates(),
      fallback: { fee: "", unavailable: true },
      freeShippingMinimum: { enabled: true, amount: "800" },
    });
    expect(built).toHaveProperty("rules.freeShippingMinimumAfterDiscounts", 800);
  });

  it("refuses a blank, zero, negative or sub-piaster minimum while enabled", () => {
    for (const bad of ["", "0", "-5", "999.999", "abc"]) {
      const built = buildRulesFromDraft({ ...zonesDraft, freeShippingMinimum: { enabled: true, amount: bad } });
      expect(built).toHaveProperty("error");
      expect((built as { error: string }).error).toMatch(/Free shipping minimum after discounts/);
    }
  });
});
