import { describe, expect, it } from "vitest";
import { formatItemCount } from "../item-count";
import { translations, type Locale } from "../translations";
import { cartUnitCount } from "#root/shared/bundles/cart-instance";

const label = (count: number, locale: Locale) =>
  formatItemCount(count, locale, (key) => translations[locale][key] ?? key);

const set = (pieces: number, qty = 1) => ({ items: Array.from({ length: pieces }, () => ({ quantity: qty })) });

describe("cartUnitCount — product units, sets included", () => {
  it("PICK6 only → 6", () => {
    expect(cartUnitCount([], [set(6)])).toBe(6);
  });
  it("PICK6 + a loose product ×2 → 8", () => {
    expect(cartUnitCount([{ quantity: 2 }], [set(6)])).toBe(8);
  });
  it("loose product ×2 → 2", () => {
    expect(cartUnitCount([{ quantity: 2 }], [])).toBe(2);
  });
  it("a set with a doubled piece counts both units; two sets add up", () => {
    expect(cartUnitCount([], [{ items: [{ quantity: 2 }, { quantity: 1 }] }, set(3)])).toBe(6);
  });
  it("empty → 0", () => {
    expect(cartUnitCount([], [])).toBe(0);
  });
});

describe("formatItemCount", () => {
  it("English singular / plural", () => {
    expect(label(0, "en")).toBe("0 items");
    expect(label(1, "en")).toBe("1 item");
    expect(label(6, "en")).toBe("6 items");
  });

  it("Arabic plural forms", () => {
    expect(label(0, "ar")).toBe("0 قطعة");
    expect(label(1, "ar")).toBe("قطعة واحدة");
    expect(label(2, "ar")).toBe("قطعتان");
    expect(label(3, "ar")).toBe("3 قطع");
    expect(label(6, "ar")).toBe("6 قطع");
    expect(label(8, "ar")).toBe("8 قطع");
    expect(label(11, "ar")).toBe("11 قطعة");
    expect(label(100, "ar")).toBe("100 قطعة");
  });

  it("always carries the number — never a bare 'ITEM'", () => {
    for (const locale of ["en", "ar"] as const) {
      for (const n of [0, 1, 2, 3, 6, 8, 11, 25, 100, Number.NaN, -1]) {
        const text = label(n, locale);
        expect(text.trim()).not.toBe("");
        expect(text).not.toContain("{count}");
        if (locale === "en") expect(text).toMatch(/^\d+ items?$/);
      }
    }
  });
});
