import { useCallback, useEffect, useLayoutEffect, useMemo } from "react";
import { trpc } from "#root/shared/trpc/client";
import { useCachedQuery } from "#root/hooks/useCachedQuery";
import { takePendingListingScroll, useListingUrlState } from "#root/hooks/useListingUrlState";
import { rememberListingOrigin } from "#root/lib/listing-origin";
import type { StorefrontCategory } from "#root/hooks/useStorefrontCategories";
import {
  buildCategoryTree,
  isGenericSubcategory,
  resolveCategoryRef,
  storefrontCategoryNav,
  visibleToShoppers,
} from "#root/shared/categories/tree";
import {
  type ListingFilters,
  type ListingSort,
  type ListingState,
  clearFilters,
  pickFilters,
  withFilters,
  withPage,
  withSearch,
  withSort,
} from "#root/shared/products/listing-params";
import type { ListingFacets } from "#root/backend/products/listing-facets/compute";
import type { FilterModel } from "#root/components/template-system/minimal/listing/ListingFilters";

/**
 * Everything a storefront product listing needs — /shop and every
 * /categories/<slug> page run on this one hook, so they cannot drift apart.
 *
 * State comes from the URL (useListingUrlState); data comes from
 * `product.search` (the page) and `product.facets` (the filter counts), both
 * through useCachedQuery so revisiting a state — Back, Forward, re-ticking a
 * filter — renders instantly without a request. Facets are keyed without
 * page and sort, so turning a page never refetches the counts.
 */

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface ListingProduct {
  id: string;
  slug: string | null;
  name: string;
  price: number;
  discountPrice: number | null;
  stock: number;
  imageUrl?: string;
  images: { url: string; isPrimary: boolean }[];
  categoryName: string | null;
  available: boolean;
}

/** The route's own narrowing, before the shopper's filters. */
export interface ListingScope {
  /** A category page's listing ids (the category and its subcategories). */
  categoryIds?: string[];
  /** A curated homepage section. */
  productIds?: string[];
  discountedOnly?: boolean;
  /** Sort used while the shopper keeps "Featured" (e.g. New arrivals). */
  defaultSort?: Exclude<ListingSort, "featured">;
}

export interface CategoryFacetOption {
  id: string;
  /** What goes in `?category=` — the slug, or the id when the slug is shared. */
  ref: string;
  name: string;
  count: number;
  children: CategoryFacetOption[];
}

export interface SelectedCategory {
  id: string;
  ref: string;
  name: string;
  listingIds: string[];
}

interface Options {
  /** null while the route scope is still resolving. */
  scope: ListingScope | null;
  /** Storefront categories (needed for /shop's Category filter). */
  categories: StorefrontCategory[] | null;
  categoriesFailed?: boolean;
  /** /shop: true. Category pages take their scope from the route. */
  allowCategories: boolean;
  pageSize: number;
  /** Send page/sort/filters to the server (the minimal template). */
  paged?: boolean;
  /** A category page's name, so a product opened from it can name it in its breadcrumb. */
  originName?: string;
}

type SearchInput = Parameters<typeof trpc.product.search.query>[0];
export type FacetsInput = Parameters<typeof trpc.product.facets.query>[0];

function toListingProduct(p: {
  id: string;
  slug: string | null;
  name: string;
  price: string | number;
  discountPrice: string | number | null;
  stock: number;
  imageUrl: string | null;
  images: { url: string; isPrimary: boolean }[];
  categoryName: string | null;
}): ListingProduct {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    price: Number(p.price),
    discountPrice: p.discountPrice ? Number(p.discountPrice) : null,
    stock: p.stock,
    imageUrl: p.imageUrl ?? undefined,
    images: p.images,
    categoryName: p.categoryName || null,
    available: p.stock > 0,
  };
}

/** Resolves `?category=` refs to categories a shopper may open; unknown or hidden refs drop out. */
export function resolveSelectedCategories(
  rows: readonly StorefrontCategory[] | null,
  refs: readonly string[],
): SelectedCategory[] {
  if (!rows || refs.length === 0) return [];
  const out: SelectedCategory[] = [];
  for (const ref of refs) {
    const nav = storefrontCategoryNav(rows, ref);
    if (!nav || out.some((s) => s.id === nav.current.id)) continue;
    out.push({ id: nav.current.id, ref, name: nav.current.name, listingIds: nav.listingIds });
  }
  return out;
}

/** The URL ref for a category: its slug, unless that slug resolves to another row. */
function categoryRef(rows: readonly StorefrontCategory[], row: StorefrontCategory): string {
  return resolveCategoryRef(rows, row.slug)?.id === row.id ? row.slug : row.id;
}

/** The /shop Category filter: visible main categories with their real subcategories. */
export function buildCategoryOptions(
  rows: readonly StorefrontCategory[] | null,
  counts: Record<string, number> | undefined,
  selectedIds: ReadonlySet<string>,
): CategoryFacetOption[] {
  if (!rows) return [];
  const visible = visibleToShoppers(rows);
  const keep = (id: string, count: number) => count > 0 || selectedIds.has(id);
  const options: CategoryFacetOption[] = [];
  for (const main of buildCategoryTree(visible)) {
    const count = counts?.[main.id] ?? 0;
    if (!keep(main.id, count)) continue;
    const children = main.children
      .filter((c) => !isGenericSubcategory(c, main))
      .map((c) => ({
        id: c.id,
        ref: categoryRef(rows, c),
        name: c.name,
        count: counts?.[c.id] ?? 0,
        children: [],
      }))
      .filter((c) => keep(c.id, c.count));
    options.push({ id: main.id, ref: categoryRef(rows, main), name: main.name, count, children });
  }
  return options;
}

export function useCatalogueListing({
  scope,
  categories,
  categoriesFailed = false,
  allowCategories,
  pageSize,
  paged = true,
  originName,
}: Options) {
  const url = useListingUrlState({ allowCategories, defaultSort: scope?.defaultSort });
  const { state: listing, setListing, hrefFor, pathname } = url;

  const selectedCategories = useMemo(
    () => (allowCategories ? resolveSelectedCategories(categories, listing.categories) : []),
    [allowCategories, categories, listing.categories],
  );
  const filterCategoryIds = useMemo(
    () => [...new Set(selectedCategories.flatMap((s) => s.listingIds))],
    [selectedCategories],
  );

  // A `?category=` link has to wait for the category list; everything else
  // can ask straight away.
  const ready =
    scope !== null &&
    (listing.categories.length === 0 || categories !== null || categoriesFailed);

  const searchInput: SearchInput | null = useMemo(() => {
    if (!ready || !scope) return null;
    // The URL state already carries this listing's default order (see
    // ParseOptions.defaultSort), so what the sort control shows is what the
    // server is asked for.
    const sort = listing.sort !== "featured" ? listing.sort : undefined;
    return {
      limit: pageSize,
      offset: paged ? (listing.page - 1) * pageSize : 0,
      includeOutOfStock: !(paged && listing.inStock),
      categoryIds: filterCategoryIds.length > 0 ? filterCategoryIds : scope.categoryIds,
      search: paged && listing.q ? listing.q : undefined,
      sortBy: paged ? sort : scope.defaultSort,
      productIds: scope.productIds?.length ? scope.productIds : undefined,
      discountedOnly: (paged && listing.onSale) || scope.discountedOnly || undefined,
      minPrice: paged ? (listing.minPrice ?? undefined) : undefined,
      maxPrice: paged ? (listing.maxPrice ?? undefined) : undefined,
    };
  }, [ready, scope, listing, pageSize, paged, filterCategoryIds]);

  const facetsInputFor = useCallback(
    (filters: ListingFilters): FacetsInput | null => {
      if (!ready || !scope || !paged) return null;
      const ids = allowCategories
        ? [...new Set(resolveSelectedCategories(categories, filters.categories).flatMap((s) => s.listingIds))]
        : [];
      return {
        categoryIds: scope.categoryIds,
        search: listing.q || undefined,
        productIds: scope.productIds?.length ? scope.productIds : undefined,
        discountedOnly: scope.discountedOnly || undefined,
        filterCategoryIds: ids.length > 0 ? ids : undefined,
        minPrice: filters.minPrice ?? undefined,
        maxPrice: filters.maxPrice ?? undefined,
        inStock: filters.inStock || undefined,
        onSale: filters.onSale || undefined,
      };
    },
    [ready, scope, paged, allowCategories, categories, listing.q],
  );

  const searchKey = searchInput ? `search:${JSON.stringify(searchInput)}` : null;
  const results = useCachedQuery(searchKey, async () => {
    const res = await trpc.product.search.query(searchInput as SearchInput);
    if (!res.success || !res.result) throw new Error("product search failed");
    return {
      products: res.result.items.map(toListingProduct),
      total: Number(res.result.total) || 0,
    };
  });

  const facetsQuery = useListingFacets(facetsInputFor(pickFilters(listing)));

  const shown = results.data ?? results.previous;
  const total = results.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // A page past the end (a stale link, a filter that shrank the results)
  // lands on the last real page instead of an empty grid.
  useEffect(() => {
    if (!paged || !results.data) return;
    const last = Math.max(1, Math.ceil(results.data.total / pageSize));
    if (listing.page > last) setListing(withPage(listing, last), { replace: true });
  }, [paged, results.data, listing, pageSize, setListing]);

  // Same-page Back/Forward: restore the scroll position once the restored
  // page is on screen (it usually already is — it comes from the cache).
  const hasData = !!results.data;
  useIsomorphicLayoutEffect(() => {
    if (!hasData) return;
    const pos = takePendingListingScroll(pathname);
    if (pos) window.scrollTo(pos.x, pos.y);
  }, [url.search, hasData, pathname]);

  // The product page's Shop breadcrumb returns here (lib/listing-origin.ts):
  // keep the latest state of this listing on record for this tab.
  useEffect(() => {
    rememberListingOrigin({ url: `${pathname}${url.search}`, categoryName: originName });
  }, [pathname, url.search, originName]);

  const actions = useMemo(
    () => ({
      setPage: (page: number) => setListing(withPage(listing, page)),
      setSort: (sort: ListingSort) => setListing(withSort(listing, sort)),
      // Typing replaces the current entry (no history entry per keystroke);
      // removing the search chip is a deliberate step and gets its own.
      setSearch: (q: string) => setListing(withSearch(listing, q), { replace: true }),
      clearSearch: () => setListing(withSearch(listing, "")),
      setFilters: (filters: ListingFilters) => setListing(withFilters(listing, filters)),
      clearAll: () => setListing(clearFilters(listing)),
    }),
    [listing, setListing],
  );

  const pageHref = useCallback((page: number) => hrefFor(withPage(listing, page)), [hrefFor, listing]);
  /** A sibling category's URL keeping sort, search and filters (not the page). */
  const carryHref = useCallback(
    (targetPathname: string) => hrefFor({ ...listing, page: 1, categories: [] }, targetPathname),
    [hrefFor, listing],
  );

  const refToId = useCallback(
    (ref: string) => resolveSelectedCategories(categories, [ref])[0]?.id,
    [categories],
  );
  const selectedIds = useMemo(() => new Set(selectedCategories.map((s) => s.id)), [selectedCategories]);
  const facets = facetsQuery.data ?? facetsQuery.previous ?? null;
  const categoryOptions = useMemo(
    () => (allowCategories ? buildCategoryOptions(categories, facets?.categories, selectedIds) : []),
    [allowCategories, categories, facets, selectedIds],
  );

  const filters = useMemo(() => pickFilters(listing), [listing]);
  const filterModel = useMemo<FilterModel | undefined>(
    () =>
      paged
        ? {
            filters,
            q: listing.q,
            facets,
            categoryOptions,
            selectedCategories,
            refToId,
            onChange: actions.setFilters,
            onClearAll: actions.clearAll,
            onClearSearch: actions.clearSearch,
            facetsInputFor,
          }
        : undefined,
    [paged, filters, listing.q, facets, categoryOptions, selectedCategories, refToId, actions, facetsInputFor],
  );

  return {
    listing,
    filterModel,
    products: shown?.products ?? [],
    total,
    totalPages,
    /** Nothing to show yet: first load of this listing. */
    isLoading: !shown && !results.failed,
    /** Showing the previous result while the new one loads. */
    isRefreshing: !!shown && !results.data && results.isLoading,
    failed: results.failed,
    retry: results.retry,
    facets,
    facetsInputFor,
    categoryOptions,
    selectedCategories,
    refToId,
    actions,
    pageHref,
    carryHref,
  };
}

/** Cached `product.facets`; null input asks nothing. */
export function useListingFacets(input: FacetsInput | null) {
  const key = input ? `facets:${JSON.stringify(input)}` : null;
  return useCachedQuery<ListingFacets>(key, async () => {
    const res = await trpc.product.facets.query(input as FacetsInput);
    if (!res.success || !res.result) throw new Error("listing facets failed");
    return res.result as ListingFacets;
  });
}

export type CatalogueListing = ReturnType<typeof useCatalogueListing>;
export type { ListingState };
