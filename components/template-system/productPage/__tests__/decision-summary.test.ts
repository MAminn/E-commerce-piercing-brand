import { describe, expect, it } from "vitest";
import { translations } from "#root/lib/i18n/translations";
import { isNoPiercingCategory, needsNoPiercing } from "#root/shared/products/no-piercing";
import { decisionSummaryRows } from "../ProductDecisionSummary";

const t = (key: string) => translations.en[key] ?? key;

describe("No piercing needed — from the category, never the title", () => {
  it.each(["Fake Piercings", "Fake", "fake-piercings", "Faux Septum", "Clip-on", "Clip On Rings", "No Piercing"])(
    "%s → no piercing needed",
    (name) => expect(isNoPiercingCategory(name)).toBe(true),
  );

  it.each(["Ear Piercings", "Nose", "Flat Back", "Daith", "Ear Cuffs", "Fakeroo", "", null])(
    "%s → not flagged",
    (name) => expect(isNoPiercingCategory(name as string | null)).toBe(false),
  );

  it("a product title alone never triggers it", () => {
    expect(needsNoPiercing({ categoryName: "Ear Cuffs", categories: [] })).toBe(false);
    expect(needsNoPiercing({ categoryName: "Ear", categories: [{ name: "Fake Piercings" }] })).toBe(true);
  });
});

describe("decision summary rows", () => {
  it("lists categories once and the piercing fact when the category says so", () => {
    expect(
      decisionSummaryRows({ categoryName: "Fake Piercings", categories: [{ name: "Fake Piercings" }, { name: "Ear" }] }, t),
    ).toEqual([
      { key: "category", label: "Category", value: "Fake Piercings · Ear" },
      { key: "piercing", label: "Piercing", value: "No piercing needed" },
    ]);
  });

  it("surfaces key specifications only when the product has them", () => {
    const rows = decisionSummaryRows(
      {
        categoryName: "Nose",
        specifications: [
          { label: "Material", value: "Titanium" },
          { label: "Gauge", value: "20G" },
          { label: "Finish", value: "Polished" },
        ],
      },
      t,
    );
    expect(rows.map((r) => `${r.label}: ${r.value}`)).toEqual(["Category: Nose", "Material: Titanium", "Gauge: 20G"]);
  });

  it("invents nothing for a product with no data", () => {
    expect(decisionSummaryRows({}, t)).toEqual([]);
  });
});
