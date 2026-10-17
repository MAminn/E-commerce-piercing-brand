/**
 * Shop / category listing state as it lives in the URL — pure, shared by the
 * browser hooks and the tests.
 *
 * The URL is the only store for browsing state (page, sort, search, filters).
 * React state used to hold it, so opening a product and pressing Back
 * remounted the page on its defaults: page 1, "Featured", no search. With the
 * URL as the source of truth, Back, Forward, refresh and a shared link all
 * rebuild exactly the same listing.
 *
 *   /shop?category=ear-piercings,nose-piercings&minPrice=100&maxPrice=200
 *        &inStock=1&onSale=1&sort=price-asc&q=hoop&page=3
 *
 * Defaults are never written (`/shop` is page 1, Featured, unfiltered), and
 * parameters this module does not own — `section`, `utm_*`, `fbclid` — are
 * carried through untouched so ad attribution survives every filter click.
 * Anything malformed parses to its default rather than throwing.
 */

export const LISTING_SORTS = ["featured", "newest", "price-asc", "price-desc"] as const;
export type ListingSort = (typeof LISTING_SORTS)[number];

export interface ListingFilters {
  /** Category slugs (or ids, for a slug shared by two rows). /shop only. */
  categories: string[];
  /** Whole EGP, compared against the price the shopper pays. */
  minPrice: number | null;
  maxPrice: number | null;
  inStock: boolean;
  onSale: boolean;
}

export interface ListingState extends ListingFilters {
  page: number;
  sort: ListingSort;
  q: string;
}

export const LISTING_KEYS = {
  page: "page",
  sort: "sort",
  q: "q",
  categories: "category",
  minPrice: "minPrice",
  maxPrice: "maxPrice",
  inStock: "inStock",
  onSale: "onSale",
} as const;

const OWNED_KEYS: readonly string[] = Object.values(LISTING_KEYS);

export const EMPTY_FILTERS: ListingFilters = {
  categories: [],
  minPrice: null,
  maxPrice: null,
  inStock: false,
  onSale: false,
};

export const DEFAULT_LISTING_STATE: ListingState = {
  ...EMPTY_FILTERS,
  page: 1,
  sort: "featured",
  q: "",
};

/** Far beyond any real catalogue; keeps a hand-typed `page=1e9` harmless. */
const MAX_PAGE = 9999;
const MAX_PRICE = 1_000_000;
const MAX_SEARCH_LENGTH = 100;
const MAX_CATEGORIES = 20;
const MAX_CATEGORY_REF_LENGTH = 120;

function parsePage(raw: string | null): number {
  if (!raw || !/^\d{1,6}$/.test(raw)) return 1;
  const page = Number.parseInt(raw, 10);
  return page >= 1 ? Math.min(page, MAX_PAGE) : 1;
}

function parseSort(raw: string | null, defaultSort: ListingSort): ListingSort {
  return (LISTING_SORTS as readonly string[]).includes(raw ?? "")
    ? (raw as ListingSort)
    : defaultSort;
}

function parsePrice(raw: string | null): number | null {
  if (!raw || !/^\d{1,7}(\.\d{1,2})?$/.test(raw.trim())) return null;
  const value = Math.round(Number(raw));
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.min(value, MAX_PRICE);
}

function parseFlag(raw: string | null): boolean {
  return raw === "1" || raw === "true";
}

export function normalizeSearch(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_SEARCH_LENGTH);
}

function parseCategories(raw: string | null): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const ref = part.trim();
    if (!ref || ref.length > MAX_CATEGORY_REF_LENGTH || out.includes(ref)) continue;
    out.push(ref);
    if (out.length === MAX_CATEGORIES) break;
  }
  return out;
}

export interface ParseOptions {
  /** Category pages take their scope from the route; `?category=` is ignored there. */
  allowCategories?: boolean;
  /**
   * The order this listing has when the URL names none. "featured" almost
   * everywhere; a New Arrivals section without hand-picked products is
   * newest-first, and the sort control must say so.
   */
  defaultSort?: ListingSort;
}

export function parseListingParams(
  search: string | URLSearchParams,
  { allowCategories = true, defaultSort = "featured" }: ParseOptions = {},
): ListingState {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  let minPrice = parsePrice(params.get(LISTING_KEYS.minPrice));
  let maxPrice = parsePrice(params.get(LISTING_KEYS.maxPrice));
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }
  return {
    page: parsePage(params.get(LISTING_KEYS.page)),
    sort: parseSort(params.get(LISTING_KEYS.sort), defaultSort),
    q: normalizeSearch(params.get(LISTING_KEYS.q)),
    categories: allowCategories ? parseCategories(params.get(LISTING_KEYS.categories)) : [],
    minPrice,
    maxPrice,
    inStock: parseFlag(params.get(LISTING_KEYS.inStock)),
    onSale: parseFlag(params.get(LISTING_KEYS.onSale)),
  };
}

/**
 * The query string for `state`, keeping every parameter of `current` this
 * module does not own (in their original order) and writing only non-default
 * values, in a fixed order — so equal states always produce equal URLs.
 * Returns "" or a string starting with "?".
 */
export function serializeListingParams(
  state: ListingState,
  current: string | URLSearchParams = "",
  { defaultSort = "featured" }: Pick<ParseOptions, "defaultSort"> = {},
): string {
  const source = typeof current === "string" ? new URLSearchParams(current) : current;
  const params = new URLSearchParams();
  for (const [key, value] of source) {
    if (!OWNED_KEYS.includes(key)) params.append(key, value);
  }
  if (state.categories.length > 0) params.set(LISTING_KEYS.categories, state.categories.join(","));
  if (state.minPrice !== null) params.set(LISTING_KEYS.minPrice, String(state.minPrice));
  if (state.maxPrice !== null) params.set(LISTING_KEYS.maxPrice, String(state.maxPrice));
  if (state.inStock) params.set(LISTING_KEYS.inStock, "1");
  if (state.onSale) params.set(LISTING_KEYS.onSale, "1");
  if (state.q) params.set(LISTING_KEYS.q, state.q);
  // Written whenever it differs from this listing's default — so choosing
  // "Featured" on a newest-first listing is kept as `sort=featured`.
  if (state.sort !== defaultSort) params.set(LISTING_KEYS.sort, state.sort);
  if (state.page > 1) params.set(LISTING_KEYS.page, String(state.page));
  const qs = params.toString();
  // URLSearchParams encodes "," as %2C; the list separator reads better bare
  // and is legal in a query string.
  return qs ? `?${qs.replace(/%2C/gi, ",")}` : "";
}

/* ── Transitions ─────────────────────────────────────────────────────────
   Narrowing or re-ordering a result set starts it from page one; turning a
   page keeps everything else. */

export function withFilters(state: ListingState, patch: Partial<ListingFilters>): ListingState {
  return { ...state, ...patch, page: 1 };
}

export function withSort(state: ListingState, sort: ListingSort): ListingState {
  return { ...state, sort, page: 1 };
}

export function withSearch(state: ListingState, q: string): ListingState {
  return { ...state, q: normalizeSearch(q), page: 1 };
}

export function withPage(state: ListingState, page: number): ListingState {
  return { ...state, page: Math.max(1, Math.min(Math.trunc(page) || 1, MAX_PAGE)) };
}

/** "Clear all": every filter and the search go; the chosen sort stays. */
export function clearFilters(state: ListingState): ListingState {
  return { ...state, ...EMPTY_FILTERS, q: "", page: 1 };
}

/** What the Filter button's badge counts (search has its own field). */
export function activeFilterCount(filters: ListingFilters): number {
  return (
    filters.categories.length +
    (filters.minPrice !== null || filters.maxPrice !== null ? 1 : 0) +
    (filters.inStock ? 1 : 0) +
    (filters.onSale ? 1 : 0)
  );
}

export function hasActiveFilters(state: ListingState): boolean {
  return activeFilterCount(state) > 0 || state.q.length > 0;
}

export function pickFilters(state: ListingFilters): ListingFilters {
  return {
    categories: state.categories,
    minPrice: state.minPrice,
    maxPrice: state.maxPrice,
    inStock: state.inStock,
    onSale: state.onSale,
  };
}
