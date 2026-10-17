import { describe, expect, it } from "vitest";
import {
  DEFAULT_LISTING_STATE,
  activeFilterCount,
  clearFilters,
  hasActiveFilters,
  parseListingParams,
  serializeListingParams,
  withFilters,
  withPage,
  withSearch,
  withSort,
} from "../listing-params";

describe("parseListingParams", () => {
  it("reads every owned parameter", () => {
    const state = parseListingParams(
      "?category=ear-piercings,nose-piercings&minPrice=100&maxPrice=200&inStock=1&onSale=true&q=hoop&sort=price-asc&page=3",
    );
    expect(state).toEqual({
      categories: ["ear-piercings", "nose-piercings"],
      minPrice: 100,
      maxPrice: 200,
      inStock: true,
      onSale: true,
      q: "hoop",
      sort: "price-asc",
      page: 3,
    });
  });

  it("an empty URL is the default listing", () => {
    expect(parseListingParams("")).toEqual(DEFAULT_LISTING_STATE);
  });

  it.each([
    ["page=0", { page: 1 }],
    ["page=-4", { page: 1 }],
    ["page=abc", { page: 1 }],
    ["page=2.5", { page: 1 }],
    ["page=99999999", { page: 1 }],
    ["page=123456", { page: 9999 }],
    ["sort=best-selling", { sort: "featured" }],
    ["sort=", { sort: "featured" }],
    ["minPrice=-5", { minPrice: null }],
    ["minPrice=1e9", { minPrice: null }],
    ["minPrice=abc&maxPrice=", { minPrice: null, maxPrice: null }],
    ["minPrice=0", { minPrice: null }],
    ["maxPrice=99999999", { maxPrice: null }],
    ["inStock=yes&onSale=0", { inStock: false, onSale: false }],
    ["category=,,%20,", { categories: [] }],
  ])("fails safe on %s", (qs, expected) => {
    expect(parseListingParams(qs)).toMatchObject(expected);
  });

  it("swaps a reversed price range instead of returning nothing", () => {
    expect(parseListingParams("minPrice=300&maxPrice=100")).toMatchObject({
      minPrice: 100,
      maxPrice: 300,
    });
  });

  it("trims, collapses and caps the search term", () => {
    expect(parseListingParams(`q=${encodeURIComponent("  gold   hoop ")}`).q).toBe("gold hoop");
    expect(parseListingParams(`q=${"x".repeat(500)}`).q).toHaveLength(100);
  });

  it("dedupes and caps category refs", () => {
    const many = Array.from({ length: 40 }, (_, i) => `c${i}`).join(",");
    expect(parseListingParams("category=a,a,b").categories).toEqual(["a", "b"]);
    expect(parseListingParams(`category=${many}`).categories).toHaveLength(20);
  });

  it("ignores ?category= where the route owns the category", () => {
    expect(
      parseListingParams("category=ear-piercings&page=2", { allowCategories: false }),
    ).toMatchObject({ categories: [], page: 2 });
  });
});

describe("serializeListingParams", () => {
  it("writes nothing for the default listing", () => {
    expect(serializeListingParams(DEFAULT_LISTING_STATE)).toBe("");
  });

  it("round-trips a full state in a fixed order with a readable list separator", () => {
    const state = parseListingParams(
      "page=2&sort=newest&onSale=1&q=star&maxPrice=180&category=fake-piercings,lip-piercings&inStock=1",
    );
    const qs = serializeListingParams(state);
    expect(qs).toBe(
      "?category=fake-piercings,lip-piercings&maxPrice=180&inStock=1&onSale=1&q=star&sort=newest&page=2",
    );
    expect(parseListingParams(qs)).toEqual(state);
  });

  it("keeps parameters it does not own (section, ad attribution)", () => {
    const qs = serializeListingParams(
      { ...DEFAULT_LISTING_STATE, page: 4 },
      "?utm_source=meta&fbclid=abc123&section=offers&page=1",
    );
    expect(qs).toBe("?utm_source=meta&fbclid=abc123&section=offers&page=4");
  });

  it("drops owned parameters that went back to their defaults", () => {
    expect(serializeListingParams(DEFAULT_LISTING_STATE, "?page=3&sort=price-asc&inStock=1")).toBe("");
  });
});

describe("transitions", () => {
  const onPage3 = { ...DEFAULT_LISTING_STATE, page: 3, sort: "price-desc" as const, inStock: true };

  it("a filter change starts again from page 1 and keeps the sort", () => {
    expect(withFilters(onPage3, { onSale: true })).toMatchObject({
      page: 1,
      sort: "price-desc",
      inStock: true,
      onSale: true,
    });
  });

  it("a sort change keeps the filters and starts from page 1", () => {
    expect(withSort(onPage3, "newest")).toMatchObject({ page: 1, sort: "newest", inStock: true });
  });

  it("a search change starts from page 1", () => {
    expect(withSearch(onPage3, " ring ")).toMatchObject({ page: 1, q: "ring" });
  });

  it("a page change keeps everything else", () => {
    expect(withPage(onPage3, 5)).toEqual({ ...onPage3, page: 5 });
    expect(withPage(onPage3, 0).page).toBe(1);
  });

  it("clear all removes filters and search, keeps the sort", () => {
    const busy = { ...onPage3, q: "hoop", categories: ["nose-piercings"], minPrice: 90 };
    expect(clearFilters(busy)).toEqual({ ...DEFAULT_LISTING_STATE, sort: "price-desc" });
  });

  it("counts active filters (a price range is one)", () => {
    expect(
      activeFilterCount({ categories: ["a", "b"], minPrice: 10, maxPrice: 90, inStock: true, onSale: false }),
    ).toBe(4);
    expect(hasActiveFilters(DEFAULT_LISTING_STATE)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_LISTING_STATE, q: "x" })).toBe(true);
  });
});

describe("a listing whose default order is not Featured (New Arrivals)", () => {
  const opts = { defaultSort: "newest" as const };

  it("reads no sort as newest, and an explicit Featured as Featured", () => {
    expect(parseListingParams("section=newarrivals", opts).sort).toBe("newest");
    expect(parseListingParams("section=newarrivals&sort=featured", opts).sort).toBe("featured");
    expect(parseListingParams("section=newarrivals&sort=bogus", opts).sort).toBe("newest");
  });

  it("writes Featured explicitly and leaves the default out", () => {
    const base = parseListingParams("section=newarrivals", opts);
    expect(serializeListingParams(base, "?section=newarrivals", opts)).toBe("?section=newarrivals");
    expect(serializeListingParams(withSort(base, "featured"), "?section=newarrivals", opts)).toBe(
      "?section=newarrivals&sort=featured",
    );
  });
});
