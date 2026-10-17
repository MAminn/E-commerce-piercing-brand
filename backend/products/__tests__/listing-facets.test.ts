import { describe, expect, it } from "vitest";
import { computeListingFacets, type FacetRow } from "../listing-facets/compute";

const EAR = "ear";
const HELIX = "helix"; // subcategory of EAR
const NOSE = "nose";
const categories = [
  { id: EAR, parentId: null },
  { id: HELIX, parentId: EAR },
  { id: NOSE, parentId: null },
];

const row = (id: string, price: number, over: Partial<FacetRow> = {}): FacetRow => ({
  id,
  price,
  stock: 3,
  onSale: false,
  categoryIds: [EAR],
  ...over,
});

const rows: FacetRow[] = [
  row("a", 75),
  row("b", 100, { categoryIds: [EAR, HELIX] }),
  row("c", 150, { categoryIds: [HELIX], stock: 0 }),
  row("d", 90, { categoryIds: [NOSE], onSale: true }),
  row("e", 225.5, { categoryIds: [NOSE], stock: 0, onSale: true }),
];

describe("computeListingFacets", () => {
  it("with no filters, counts everything and spans the whole price range", () => {
    const f = computeListingFacets(rows, categories, {});
    expect(f.total).toBe(5);
    expect(f.price).toEqual({ min: 75, max: 226 });
    expect(f.inStock).toEqual({ count: 3, of: 5 });
    expect(f.onSale).toEqual({ count: 2 });
    // A main category counts its subcategory's products, once each.
    expect(f.categories).toEqual({ [EAR]: 3, [HELIX]: 2, [NOSE]: 2 });
  });

  it("a facet's own count ignores its own filter but applies the others", () => {
    const f = computeListingFacets(rows, categories, {
      filterCategoryIds: [NOSE],
      inStock: true,
    });
    expect(f.total).toBe(1); // d
    // Category counts apply inStock but not the category filter itself.
    expect(f.categories).toEqual({ [EAR]: 2, [HELIX]: 1, [NOSE]: 1 });
    // inStock counts apply the category filter but not inStock itself.
    expect(f.inStock).toEqual({ count: 1, of: 2 });
    expect(f.onSale).toEqual({ count: 1 });
  });

  it("price bounds stay put while other filters narrow the result", () => {
    const f = computeListingFacets(rows, categories, { onSale: true, minPrice: 100 });
    expect(f.price).toEqual({ min: 75, max: 226 });
    expect(f.total).toBe(1); // e
  });

  it("filters by the price the shopper pays, inclusive at both ends", () => {
    expect(computeListingFacets(rows, categories, { minPrice: 90, maxPrice: 150 }).total).toBe(3);
  });

  it("an empty scope has no price range and zero counts", () => {
    expect(computeListingFacets([], categories, {})).toEqual({
      total: 0,
      price: null,
      inStock: { count: 0, of: 0 },
      onSale: { count: 0 },
      categories: {},
    });
  });
});
