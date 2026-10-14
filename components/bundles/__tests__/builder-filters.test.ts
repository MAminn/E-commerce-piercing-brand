import { describe, expect, it } from "vitest";
import { builderFilterCategories, filterBuilderPool } from "../builder-filters";

const flat = { id: "c-flat", name: "Flat Back" };
const nose = { id: "c-nose", name: "Nose" };
const fake = { id: "c-fake", name: "Fake Piercings" };

const pool = [
  { productId: "a", name: "Mini Flower Stud", categories: [flat] },
  { productId: "b", name: "Crystal L-Shape Stud", categories: [nose] },
  { productId: "c", name: "Crystal Curved Barbell", categories: [flat, nose] },
  { productId: "d", name: "Triple Band Star Ear Cuff", categories: [fake] },
  { productId: "e", name: "Plain Ring" }, // no category data at all
];

describe("builder search", () => {
  it("matches the product name, case- and accent-insensitively", () => {
    expect(filterBuilderPool(pool, { search: "crystal", categoryId: null }).map((p) => p.productId)).toEqual(["b", "c"]);
    expect(filterBuilderPool(pool, { search: "  CRÝSTAL  ", categoryId: null }).map((p) => p.productId)).toEqual(["b", "c"]);
  });

  it("every word must appear, in any order", () => {
    expect(filterBuilderPool(pool, { search: "stud crystal", categoryId: null }).map((p) => p.productId)).toEqual(["b"]);
  });

  it("an empty search shows the whole pool", () => {
    expect(filterBuilderPool(pool, { search: "", categoryId: null })).toHaveLength(5);
  });

  it("no match → empty (the builder then offers to clear)", () => {
    expect(filterBuilderPool(pool, { search: "necklace", categoryId: null })).toEqual([]);
  });
});

describe("builder category filters", () => {
  it("chips come only from categories the pool really carries, most-populated first", () => {
    expect(builderFilterCategories(pool)).toEqual([
      { id: "c-flat", name: "Flat Back", count: 2 },
      { id: "c-nose", name: "Nose", count: 2 },
      { id: "c-fake", name: "Fake Piercings", count: 1 },
    ]);
  });

  it("filters by a category, including products in several categories", () => {
    expect(filterBuilderPool(pool, { search: "", categoryId: "c-nose" }).map((p) => p.productId)).toEqual(["b", "c"]);
  });

  it("combines with search", () => {
    expect(filterBuilderPool(pool, { search: "barbell", categoryId: "c-flat" }).map((p) => p.productId)).toEqual(["c"]);
  });

  it("a pool without category data produces no chips (nothing is inferred from names)", () => {
    expect(builderFilterCategories([{ name: "Gold Hoop" }, { name: "Silver Hoop" }])).toEqual([]);
  });
});
