import { describe, expect, it } from "vitest";
import {
  EGYPT_GOVERNORATES,
  GOVERNORATE_CODES,
  getGovernorate,
  governorateLabel,
  isGovernorateCode,
} from "../egypt-governorates";

/**
 * The canonical list is the store's destination vocabulary. Orders store the
 * code, the admin rate table iterates the list, the checkout selector renders
 * it — so its shape is a contract, not an implementation detail.
 */
describe("EGYPT_GOVERNORATES", () => {
  it("lists exactly the 27 governorates of Egypt", () => {
    expect(EGYPT_GOVERNORATES).toHaveLength(27);
  });

  it("has unique, stable, uppercase 3-letter codes", () => {
    const codes = EGYPT_GOVERNORATES.map((g) => g.code);
    expect(new Set(codes).size).toBe(27);
    for (const code of codes) expect(code).toMatch(/^[A-Z]{3}$/);
    expect(GOVERNORATE_CODES).toEqual(codes);
  });

  it("has unique English and Arabic names, none blank", () => {
    const en = EGYPT_GOVERNORATES.map((g) => g.nameEn);
    const ar = EGYPT_GOVERNORATES.map((g) => g.nameAr);
    expect(new Set(en).size).toBe(27);
    expect(new Set(ar).size).toBe(27);
    for (const g of EGYPT_GOVERNORATES) {
      expect(g.nameEn.trim()).not.toBe("");
      expect(g.nameAr.trim()).not.toBe("");
      // Arabic script, not a transliteration left in the Arabic slot.
      expect(g.nameAr).toMatch(/[؀-ۿ]/);
    }
  });

  it("includes the governorates a rate table must be able to price", () => {
    const en = EGYPT_GOVERNORATES.map((g) => g.nameEn);
    for (const expected of ["Cairo", "Giza", "Alexandria", "Dakahlia", "Asyut", "Luxor", "Aswan", "New Valley"]) {
      expect(en).toContain(expected);
    }
  });

  it("does not smuggle in non-governorate destinations", () => {
    const en = EGYPT_GOVERNORATES.map((g) => g.nameEn.toLowerCase());
    for (const notAGovernorate of ["north coast", "new cairo", "6th of october", "sheikh zayed", "el gouna"]) {
      expect(en).not.toContain(notAGovernorate);
    }
  });

  it("carries Bosta aliases only as hints — every entry has at least its own English name", () => {
    for (const g of EGYPT_GOVERNORATES) {
      expect(g.bostaCityAliases.length).toBeGreaterThan(0);
      expect(g.bostaCityAliases).toContain(g.nameEn);
    }
  });

  it("isGovernorateCode / getGovernorate accept codes and nothing else", () => {
    expect(isGovernorateCode("CAI")).toBe(true);
    expect(isGovernorateCode("Cairo")).toBe(false);
    expect(isGovernorateCode("cai")).toBe(false);
    expect(isGovernorateCode("")).toBe(false);
    expect(isGovernorateCode(null)).toBe(false);
    expect(getGovernorate("ALX")?.nameEn).toBe("Alexandria");
    expect(getGovernorate("XXX")).toBeUndefined();
  });

  it("governorateLabel picks the language", () => {
    const cairo = getGovernorate("CAI")!;
    expect(governorateLabel(cairo, "en")).toBe("Cairo");
    expect(governorateLabel(cairo, "ar")).toBe("القاهرة");
  });
});
