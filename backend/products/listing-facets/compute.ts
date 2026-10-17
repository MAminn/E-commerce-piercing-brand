/**
 * Facet counts for a storefront listing, computed in memory from the
 * listing's scoped rows. Pure, so it is tested without a database.
 *
 * Every count is "what you would get if you also applied this": it applies
 * all the OTHER active filters, never its own — ticking "Nose" must not zero
 * out the count next to "Ear". Price bounds come from the scope alone (route
 * category + search + section), so the slider's range stays put while the
 * shopper narrows other facets.
 */

export interface FacetRow {
  id: string;
  /** Price the shopper pays, EGP. */
  price: number;
  stock: number;
  onSale: boolean;
  /** Every category the product belongs to (primary FK and junction). */
  categoryIds: readonly string[];
}

export interface FacetCategory {
  id: string;
  parentId: string | null;
}

export interface FacetFilters {
  /** Already expanded: a main category's id plus all of its children's. */
  filterCategoryIds?: readonly string[];
  minPrice?: number | null;
  maxPrice?: number | null;
  inStock?: boolean;
  onSale?: boolean;
}

export interface ListingFacets {
  /** Products matching every active filter. */
  total: number;
  /** Whole-EGP bounds of the scope; null when the scope is empty. */
  price: { min: number; max: number } | null;
  /** `count` in stock, of `of` products matching the other filters. */
  inStock: { count: number; of: number };
  onSale: { count: number };
  /** Matching products per category id; a main category counts its subcategories' too. */
  categories: Record<string, number>;
}

type Facet = "category" | "price" | "inStock" | "onSale";

export function computeListingFacets(
  rows: readonly FacetRow[],
  categories: readonly FacetCategory[],
  filters: FacetFilters,
): ListingFacets {
  const selected = new Set(filters.filterCategoryIds ?? []);
  const { minPrice = null, maxPrice = null } = filters;

  const matches = (row: FacetRow, except?: Facet) =>
    (except === "category" ||
      selected.size === 0 ||
      row.categoryIds.some((id) => selected.has(id))) &&
    (except === "price" ||
      ((minPrice === null || row.price >= minPrice) &&
        (maxPrice === null || row.price <= maxPrice))) &&
    (except === "inStock" || !filters.inStock || row.stock > 0) &&
    (except === "onSale" || !filters.onSale || row.onSale);

  let total = 0;
  let stockOf = 0;
  let stockCount = 0;
  let saleCount = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  // A main category's listing is itself plus its children, so a product in
  // a subcategory also counts towards that subcategory's main category.
  const groupsOf = new Map<string, string[]>();
  for (const c of categories) {
    groupsOf.set(c.id, c.parentId ? [c.id, c.parentId] : [c.id]);
  }
  const categoryCounts: Record<string, number> = {};

  for (const row of rows) {
    if (row.price < min) min = row.price;
    if (row.price > max) max = row.price;
    if (matches(row)) total++;
    if (matches(row, "inStock")) {
      stockOf++;
      if (row.stock > 0) stockCount++;
    }
    if (matches(row, "onSale") && row.onSale) saleCount++;
    if (matches(row, "category")) {
      // Each product counts once per category, even when it sits in a main
      // category and one of its subcategories at the same time.
      const counted = new Set<string>();
      for (const id of row.categoryIds) {
        for (const groupId of groupsOf.get(id) ?? [id]) counted.add(groupId);
      }
      for (const id of counted) categoryCounts[id] = (categoryCounts[id] ?? 0) + 1;
    }
  }

  return {
    total,
    price: rows.length > 0 ? { min: Math.floor(min), max: Math.ceil(max) } : null,
    inStock: { count: stockCount, of: stockOf },
    onSale: { count: saleCount },
    categories: categoryCounts,
  };
}
