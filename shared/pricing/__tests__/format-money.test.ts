import { describe, expect, it } from "vitest";
import { formatMoney, formatMoneyCompact, toMoneyNumber } from "../format-money";

// Intl joins code and amount with a no-break space so "EGP 270" never wraps.
const egp = (amount: string) => `EGP${String.fromCharCode(0xa0)}${amount}`;

describe("formatMoney", () => {
  it("renders whole-pound catalogue and bundle prices without decimals", () => {
    expect(formatMoney(270)).toBe(egp("270"));
    expect(formatMoney(340)).toBe(egp("340"));
    expect(formatMoney(480)).toBe(egp("480"));
  });

  it("keeps piasters when an amount is genuinely fractional", () => {
    expect(formatMoney(1234.5)).toBe(egp("1,234.50"));
    expect(formatMoney(12.25)).toBe(egp("12.25"));
  });

  it("accepts Postgres numeric strings and treats blanks as zero", () => {
    expect(formatMoney("480.00")).toBe(egp("480"));
    expect(formatMoney("19.90")).toBe(egp("19.90"));
    expect(formatMoney("")).toBe(egp("0"));
    expect(formatMoney(null)).toBe(egp("0"));
    expect(formatMoney(undefined)).toBe(egp("0"));
    expect(formatMoney(Number.NaN)).toBe(egp("0"));
  });

  it("never converts — the numeric value is preserved exactly", () => {
    expect(formatMoney(270.004)).toBe(egp("270"));
    expect(formatMoney(269.996)).toBe(egp("270"));
    expect(formatMoney(270.01)).toBe(egp("270.01"));
  });

  it("can force two decimals for tabular admin views", () => {
    expect(formatMoney(270, { alwaysShowFraction: true })).toBe(egp("270.00"));
  });

  it("formats the Arabic UI with the Egyptian pound label and Latin digits", () => {
    const out = formatMoney(270, { locale: "ar" });
    expect(out).toContain("270");
    expect(out).toContain("ج.م");
    expect(out).not.toMatch(/[٠-٩]/);
    expect(out).not.toContain("ر.س");
  });

  it("always uses EGP, never a dollar sign or another code", () => {
    for (const amount of [0, 1, 99.5, 270, 12345]) {
      const out = formatMoney(amount);
      expect(out).toContain("EGP");
      expect(out).not.toContain("$");
      expect(out).not.toContain("USD");
    }
  });
});

describe("formatMoneyCompact", () => {
  it("abbreviates thousands for dashboard tiles", () => {
    expect(formatMoneyCompact(12400)).toBe(egp("12.4K"));
  });

  it("falls back to the exact amount below a thousand", () => {
    expect(formatMoneyCompact(999)).toBe(egp("999"));
  });
});

describe("toMoneyNumber", () => {
  it("coerces strings and guards against non-finite input", () => {
    expect(toMoneyNumber("270")).toBe(270);
    expect(toMoneyNumber(Number.POSITIVE_INFINITY)).toBe(0);
    expect(toMoneyNumber("abc")).toBe(0);
  });
});
