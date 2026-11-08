import { CategoryBundlesSection } from "#root/components/bundles/CategoryBundlesSection";
import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Search, ChevronDown } from "lucide-react";
import { Link } from "#root/components/utils/Link";
import {
  MinimalProductCard,
  type MinimalProduct,
} from "#root/components/template-system/minimal/MinimalProductCard";
import { QuickViewDialog } from "#root/components/template-system/minimal/QuickViewDialog";
import { cn } from "#root/lib/utils";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { buttonClass } from "#root/components/storefront/Button";
import { BundleEntryTile } from "#root/components/storefront/promo/PromoLayer";
import {
  ActiveFilterChips,
  DesktopFilterBar,
  FilterButton,
  type FilterModel,
  MobileFilterDrawer,
  hasFilterGroups,
} from "#root/components/template-system/minimal/listing/ListingFilters";
import { useCategoryT } from "#root/components/template-system/minimal/listing/useCategoryT";
import {
  type ListingSort,
  activeFilterCount,
  normalizeSearch,
} from "#root/shared/products/listing-params";
import { MinimalTestimonialsSection } from "#root/components/template-system/minimal/MinimalTestimonials";
import type {
  CategoryNodeLike,
  StorefrontCategoryNav,
} from "#root/shared/categories/tree";
import type { PlacementChip } from "#root/shared/categories/placements";

/* ── Types ──────────────────────────────────────────────────────────── */

export interface MinimalCategoryProduct extends MinimalProduct {}

export interface MinimalCategoryPageProps {
  products: MinimalCategoryProduct[];
  categoryName?: string;
  /** Optional line under the heading (the category's admin description). */
  categoryDescription?: string | null;
  /** The main category, when the page shows one of its subcategories. */
  parentCategory?: { name: string; href: string };
  /**
   * The placement chip row under the title and count (see
   * shared/categories/placements#placementChips). Nothing renders without
   * at least two chips.
   */
  placementChips?: PlacementChip[];
  /** When known, live bundle campaigns placed on this category render below the grid. */
  categoryId?: string;
  /** Nothing to show yet (first load of this listing). */
  isLoading?: boolean;
  /** The previous results stay on screen, dimmed, while new ones load. */
  isRefreshing?: boolean;
  loadFailed?: boolean;
  onRetry?: () => void;
  totalProducts: number;
  currentPage: number;
  totalPages: number;
  /** Real hrefs for the pagination links (shareable, open-in-new-tab). */
  pageHref?: (page: number) => string;
  onPageChange: (page: number) => void;
  onSortChange: (sort: ListingSort) => void;
  /** Called with the committed (debounced, trimmed) search term. */
  onSearchChange: (search: string) => void;
  currentSort: ListingSort;
  /** The committed search term (from the URL). */
  currentSearch: string;
  /** Filter UI; omitted, the page shows search and sort only. */
  filters?: FilterModel;
  onQuickView?: (product: MinimalProduct) => void;
}

/* ── Constants ──────────────────────────────────────────────────────── */

const PRODUCTS_PER_PAGE = 12; // whole rows at 2, 3 and 4 columns

/**
 * Listing grid, photo first: 2 columns running nearly edge to edge on phones,
 * 3 large columns from 768px, 4 only once a screen is wide enough to keep them
 * large (1700px).
 */
const GRID_CLASS =
  "-mx-2 grid grid-cols-2 gap-x-2 gap-y-6 md:mx-0 md:grid-cols-3 md:gap-x-3 md:gap-y-10 min-[106.25rem]:grid-cols-4";

/* ── Sort options ───────────────────────────────────────────────────── */

function useSortOptions() {
  const ct = useCategoryT();
  return useMemo(
    () => [
      { value: "featured" as const, label: ct("sort.featured") },
      { value: "newest" as const, label: ct("sort.newest") },
      { value: "price-asc" as const, label: ct("sort.price_asc") },
      { value: "price-desc" as const, label: ct("sort.price_desc") },
    ],
    [ct],
  );
}

/* ── Breadcrumbs ─────────────────────────────────────────────────────── */

function CategoryBreadcrumbs({
  categoryName,
  parentCategory,
}: {
  categoryName?: string;
  parentCategory?: { name: string; href: string };
}) {
  const ct = useCategoryT();

  return (
    <div className="hidden bg-bg md:block">
      <div className="perce-container pt-4">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 overflow-x-auto whitespace-nowrap t-small text-ink-2 scrollbar-hide">
          <Link
            href="/"
            className="perce-underline-hover transition-colors hover:text-perce-ink">
            {ct("breadcrumb.home")}
          </Link>
          <span aria-hidden="true">/</span>
          <Link
            href="/shop"
            className="perce-underline-hover transition-colors hover:text-perce-ink">
            {ct("breadcrumb.shop")}
          </Link>
          {parentCategory && (
            <>
              <span aria-hidden="true">/</span>
              <Link
                href={parentCategory.href}
                className="perce-underline-hover truncate transition-colors hover:text-perce-ink">
                {parentCategory.name}
              </Link>
            </>
          )}
          {categoryName && (
            <>
              <span aria-hidden="true">/</span>
              <span aria-current="page" className="truncate text-ink">
                {categoryName}
              </span>
            </>
          )}
        </nav>
      </div>
    </div>
  );
}

/* ── Placement chips ─────────────────────────────────────────────────── */

/**
 * "All · Ear · Nose" on /shop; "All · Daith · Rook · Flat back" inside a
 * placement — the browsing spine, right under the title and count. Square
 * chips on a hairline border, the current one ink-filled. Real links
 * (shareable, crawlable, back-button friendly), not filter state. Scrolls
 * sideways on a phone instead of wrapping.
 */
function PlacementChipRow({ chips }: { chips: PlacementChip[] }) {
  const ct = useCategoryT();
  if (chips.length < 2) return null;
  return (
    <nav
      aria-label={ct("subnav.label")}
      data-testid="placement-chips"
      className="-mx-[var(--perce-gutter)] mt-3 overflow-x-auto scrollbar-hide sm:mx-0 lg:mt-0 lg:shrink-0">
      <ul className="flex w-max gap-2 px-[var(--perce-gutter)] sm:px-0">
        {chips.map((chip) => (
          <li key={chip.id}>
            {/* A plain <a>: the shared Link component drops aria-current, and
                Vike routes plain links client-side anyway. */}
            <a
              href={chip.href}
              aria-current={chip.active ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center whitespace-nowrap border px-4 t-label transition-colors duration-[var(--perce-duration-fast)]",
                chip.active ? "border-ink bg-ink text-bg" : "border-line text-ink hover:border-ink",
              )}>
              {chip.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/* ── Pagination ──────────────────────────────────────────────────────── */

const pagerButtonClass = buttonClass({ variant: "secondary", size: "md" });

/**
 * A page control. With an href it is a real link — middle-click and "open in
 * new tab" work, and crawlers see the pages — whose plain clicks are handled
 * here (`data-vike="false"` keeps Vike's router out of it; see
 * useListingUrlState for why a page turn is not a Vike navigation).
 */
function PageControl({
  page,
  href,
  onNavigate,
  disabled,
  className,
  children,
  ...aria
}: {
  page: number;
  href?: string;
  onNavigate: (page: number) => void;
  disabled?: boolean;
  className: string;
  children: ReactNode;
  "aria-label"?: string;
  "aria-current"?: "page";
}) {
  if (disabled) {
    return (
      <span aria-disabled="true" className={cn(className, "pointer-events-none border-line text-ink-3")} {...aria}>
        {children}
      </span>
    );
  }
  if (!href) {
    return (
      <button type="button" onClick={() => onNavigate(page)} className={className} {...aria}>
        {children}
      </button>
    );
  }
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onNavigate(page);
  };
  return (
    <a href={href} data-vike="false" onClick={onClick} className={className} {...aria}>
      {children}
    </a>
  );
}

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  pageHref,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageHref?: (page: number) => string;
}) {
  const ct = useCategoryT();

  if (totalPages <= 1) return null;

  // Build page numbers: show up to 5 pages around current
  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push("...");
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-4 border-t border-line pt-6 mt-12 sm:justify-center">
      {/* Previous */}
      <PageControl
        page={currentPage - 1}
        href={pageHref?.(currentPage - 1)}
        onNavigate={onPageChange}
        disabled={currentPage <= 1}
        className={pagerButtonClass}>
        {ct("pagination.previous")}
      </PageControl>

      {/* Page numbers */}
      <div className="hidden items-center sm:flex">
        {pages.map((page, idx) =>
          page === "..." ? (
            <span
              key={`ellipsis-${idx}`}
              aria-hidden
              className="px-2 t-label text-ink-2">
              …
            </span>
          ) : (
            <PageControl
              key={page}
              page={page}
              href={pageHref?.(page)}
              onNavigate={onPageChange}
              aria-current={page === currentPage ? "page" : undefined}
              aria-label={ct("pagination.page_of", {
                current: page,
                total: totalPages,
              })}
              className={cn(
                "flex h-11 min-w-11 items-center justify-center t-label tabular-nums transition-colors",
                page === currentPage
                  ? "text-ink underline decoration-1 underline-offset-[6px]"
                  : "text-ink-2 hover:text-ink",
              )}>
              {page}
            </PageControl>
          ),
        )}
      </div>

      {/* Mobile page indicator */}
      <span className="t-label tabular-nums text-ink sm:hidden">
        <span aria-hidden="true">
          {currentPage} / {totalPages}
        </span>
        <span className="sr-only">{ct("pagination.page_of", { current: currentPage, total: totalPages })}</span>
      </span>

      {/* Next */}
      <PageControl
        page={currentPage + 1}
        href={pageHref?.(currentPage + 1)}
        onNavigate={onPageChange}
        disabled={currentPage >= totalPages}
        className={pagerButtonClass}>
        {ct("pagination.next")}
      </PageControl>
    </nav>
  );
}

/* ── Skeleton loader ─────────────────────────────────────────────────── */

function GridSkeleton() {
  return (
    <div className={GRID_CLASS}>
      {[...Array(PRODUCTS_PER_PAGE)].map((_, i) => (
        <div key={i} className="flex flex-col">
          {/* 4:5 to match MinimalProductCard. A square skeleton reflowed the
              whole grid the moment the real cards arrived. */}
          <div className="aspect-[4/5] animate-pulse bg-surface-2" />
          <div className="space-y-2 pt-3">
            <div className="h-4 w-3/4 animate-pulse bg-surface-2" />
            <div className="h-4 w-1/3 animate-pulse bg-surface-2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────────────── */

const SEARCH_DEBOUNCE_MS = 350;

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth";
}

export function MinimalCategoryPage({
  products,
  categoryName,
  categoryDescription,
  parentCategory,
  placementChips,
  categoryId,
  isLoading,
  isRefreshing,
  loadFailed,
  onRetry,
  totalProducts,
  currentPage,
  totalPages,
  pageHref,
  onPageChange,
  onSortChange,
  onSearchChange,
  currentSort,
  currentSearch,
  filters,
  onQuickView,
}: MinimalCategoryPageProps) {
  const ct = useCategoryT();
  const { t } = useMinimalI18n();
  const sortOptions = useSortOptions();
  const [quickViewProduct, setQuickViewProduct] = useState<MinimalProduct | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  /** Top of the toolbar + grid: where a page turn or a new filter lands. */
  const resultsRef = useRef<HTMLDivElement>(null);

  const handleQuickView = useCallback((product: MinimalProduct) => {
    if (onQuickView) {
      onQuickView(product);
    } else {
      setQuickViewProduct(product);
    }
  }, [onQuickView]);

  // Search box: local text, committed to the URL after a pause, and re-synced
  // when the URL's term changes on its own (Back/Forward, a chip, "Clear
  // all"). Mounting commits nothing — the old debounce fired on mount and
  // reset a restored page to 1.
  const [searchText, setSearchText] = useState(currentSearch);
  const committedSearch = useRef(currentSearch);
  const onSearchChangeRef = useRef(onSearchChange);
  onSearchChangeRef.current = onSearchChange;
  useEffect(() => {
    if (currentSearch === committedSearch.current) return;
    committedSearch.current = currentSearch;
    setSearchText(currentSearch);
  }, [currentSearch]);
  useEffect(() => {
    const next = normalizeSearch(searchText);
    if (next === committedSearch.current) return;
    const timer = setTimeout(() => {
      committedSearch.current = next;
      onSearchChangeRef.current(next);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchText]);

  /** After narrowing from far down the page, bring the first results into view. */
  const revealResults = useCallback(() => {
    const el = resultsRef.current;
    if (el && el.getBoundingClientRect().top < 0) {
      el.scrollIntoView({ block: "start", behavior: scrollBehavior() });
    }
  }, []);

  const handlePageChange = useCallback(
    (page: number) => {
      onPageChange(page);
      resultsRef.current?.scrollIntoView({ block: "start", behavior: scrollBehavior() });
    },
    [onPageChange],
  );

  const filterModel = useMemo<FilterModel | undefined>(
    () =>
      filters && {
        ...filters,
        onChange: (next) => {
          filters.onChange(next);
          revealResults();
        },
        onClearAll: () => {
          filters.onClearAll();
          revealResults();
        },
      },
    [filters, revealResults],
  );
  const showFilters = !!filterModel && hasFilterGroups(filterModel);
  // The Filters trigger is drawn from the first render whenever this listing
  // has a filter model, disabled until the facets say there is something to
  // filter by — it used to appear only once `product.facets` answered, which
  // re-flowed the toolbar on every phone visit.
  const filtersPending = !!filterModel && !showFilters;
  const filterCount = filters ? activeFilterCount(filters.filters) : 0;

  // Two different empty states. Filters or a search that matched nothing are
  // the shopper's to undo and get a control to undo them; a collection with
  // no products at all is the store's state and gets no advice the shopper
  // cannot act on.
  const isFiltering = filterCount > 0 || currentSearch.length > 0;
  const searchOnly = filterCount === 0 && currentSearch.length > 0;
  const clearFiltering = () => {
    if (filterModel) filterModel.onClearAll();
    else onSearchChange("");
  };

  return (
    <div className="perce-header-offset min-h-screen bg-bg">
      {/* Breadcrumbs */}
      <CategoryBreadcrumbs
        categoryName={categoryName}
        parentCategory={parentCategory}
      />

      <div className="bg-bg">
        <div className="perce-container pb-12 pt-4 lg:pb-16 lg:pt-4">
          {/* Page heading. /shop and /categories/[slug] previously rendered no
              <h1> at all — the first heading on the page was an <h3> inside a
              product card, so assistive tech and crawlers had nothing naming
              the page. Uses the category name when browsing one. */}
          <div className="mb-3 lg:mb-3 lg:flex lg:items-end lg:justify-between lg:gap-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3">
            <h1 className="t-h1 text-ink">
              {categoryName || ct("breadcrumb.shop")}
            </h1>
            {/* Result count is read from the API's own total, never estimated.
                Blank while loading so the number never counts up from a stale
                page — but the line itself is always there, so the count
                arriving does not push the toolbar and grid down. */}
            <p
              aria-live="polite"
              data-testid="results-count"
              className="t-small tabular-nums text-ink-2">
              {!isLoading && !loadFailed && totalProducts > 0
                ? totalProducts === 1
                  ? ct("results.count_one")
                  : ct("results.count", { count: totalProducts })
                : "\u00A0" /* keeps the line's height while empty */}
            </p>
            </div>
            {categoryDescription?.trim() && (
              <p className="mt-2 max-w-prose t-body text-ink-2">
                {categoryDescription}
              </p>
            )}
          </div>
          {placementChips && <PlacementChipRow chips={placementChips} />}
          </div>

          <div
            ref={resultsRef}
            className="scroll-mt-[calc(var(--perce-header-offset)+1rem)]">
            {/* Toolbar. Filters (left, desktop) only expose dimensions backed
                by real product fields — see backend/products/listing-facets.
                Below lg the filters live in a drawer behind one button. */}
            <div className="mb-3 space-y-3 lg:mb-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
                {showFilters && filterModel && (
                  <div className="hidden lg:block">
                    <DesktopFilterBar model={filterModel} />
                  </div>
                )}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:ms-auto">
                  {/* Search. Phones reach search from the header, so the first
                      photos stay high on the screen. */}
                  <div className="relative hidden min-w-0 sm:block sm:flex-1 lg:w-64 lg:flex-none">
                    <label htmlFor="minimal-cat-search" className="sr-only">
                      {ct("search.placeholder")}
                    </label>
                    <Search
                      aria-hidden
                      className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-2"
                    />
                    <input
                      id="minimal-cat-search"
                      type="search"
                      placeholder={ct("search.placeholder")}
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      className="h-11 w-full border border-line-input bg-surface pe-4 ps-10 t-body text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none"
                    />
                  </div>

                  <div className="flex min-w-0 items-center gap-3">
                    {(showFilters || filtersPending) && (
                      <FilterButton
                        count={filterCount}
                        onClick={() => setDrawerOpen(true)}
                        disabled={filtersPending}
                        className="flex-1 sm:flex-none lg:hidden"
                      />
                    )}
                    {/* Sort */}
                    <label
                      htmlFor="minimal-cat-sort"
                      className="sr-only whitespace-nowrap t-small text-ink-2 lg:not-sr-only"
                    >
                      {ct("sort.label")}
                    </label>
                    {/* Text-style sort: the native select (so phones get the
                        platform picker), drawn as an underlined label. */}
                    <div className="relative min-w-0 flex-1 sm:flex-none">
                      <select
                        id="minimal-cat-sort"
                        value={currentSort}
                        onChange={(e) => onSortChange(e.target.value as ListingSort)}
                        className="h-11 w-full min-w-0 appearance-none border-0 bg-transparent pe-6 t-label text-ink underline decoration-1 underline-offset-4 focus:outline-none"
                      >
                        {sortOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        aria-hidden
                        size={16}
                        strokeWidth={1.5}
                        className="pointer-events-none absolute end-0 top-1/2 -translate-y-1/2 text-ink-2"
                      />
                    </div>
                  </div>
                </div>
              </div>
              {filterModel && <ActiveFilterChips model={filterModel} />}
            </div>

            {/* Product grid */}
            {isLoading ? (
              <GridSkeleton />
            ) : loadFailed ? (
              <div role="alert" className="flex flex-col items-center justify-center py-16 lg:py-24">
                <div className="max-w-md text-center">
                  <h2 className="t-h2 text-ink">{ct("error.title")}</h2>
                  <p className="mt-2 t-body text-ink-2">
                    {ct("error.subtitle")}
                  </p>
                  {onRetry && (
                    <button
                      type="button"
                      onClick={onRetry}
                      className="perce-underline mt-6 inline-flex min-h-11 items-center t-label text-ink">
                      {ct("error.retry")}
                    </button>
                  )}
                </div>
              </div>
            ) : products.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 lg:py-24">
                <div className="max-w-md text-center">
                  <h2 className="t-h2 text-ink">
                    {isFiltering ? ct("empty.title") : ct("empty.catalogue.title")}
                  </h2>
                  <p className="mt-2 t-body text-ink-2">
                    {!isFiltering
                      ? ct("empty.catalogue.subtitle")
                      : searchOnly
                        ? ct("empty.subtitle")
                        : ct("empty.filtered.subtitle")}
                  </p>
                  {isFiltering ? (
                    <button
                      type="button"
                      onClick={clearFiltering}
                      className="perce-underline mt-6 inline-flex min-h-11 items-center t-label text-ink">
                      {searchOnly ? ct("empty.clear_search") : ct("empty.clear_filters")}
                    </button>
                  ) : (
                    <Link
                      href="/"
                      className="perce-underline mt-6 inline-flex min-h-11 items-center t-label text-ink">
                      {ct("empty.catalogue.action")}
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Names the grid so the card titles (h3) sit under an h2. */}
                <h2 className="sr-only">{t("nav.search_products")}</h2>
                <div
                  aria-busy={isRefreshing || undefined}
                  data-testid="product-grid"
                  className={cn(
                    GRID_CLASS,
                    "transition-opacity duration-[var(--perce-duration)]",
                    isRefreshing && "opacity-50",
                  )}>
                  {/* Promotional Pick Your Set tile (shared/config/promo-layer,
                      off) — first page only, product-card footprint. */}
                  {currentPage === 1 && <BundleEntryTile />}
                  {products.map((product) => (
                    <MinimalProductCard
                      key={product.id}
                      product={product}
                      onQuickView={handleQuickView}
                    />
                  ))}
                </div>

                {/* Pagination */}
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={handlePageChange}
                  pageHref={pageHref}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bundles placed on this category (merchant-controlled) */}
      {categoryId && <CategoryBundlesSection categoryId={categoryId} />}

      {/* Testimonials */}
      <MinimalTestimonialsSection />

      {showFilters && filterModel && (
        <MobileFilterDrawer model={filterModel} open={drawerOpen} onOpenChange={setDrawerOpen} />
      )}

      {/* Quick View Dialog */}
      <QuickViewDialog
        product={quickViewProduct}
        open={!!quickViewProduct}
        onClose={() => setQuickViewProduct(null)}
      />
    </div>
  );
}

/**
 * Heading and breadcrumb props for a resolved category (see
 * storefrontCategoryNav). The placement chips come from placementChips.
 */
export function categoryNavProps(
  nav: StorefrontCategoryNav<CategoryNodeLike & { description?: string | null }> | undefined,
): Pick<MinimalCategoryPageProps, "categoryDescription" | "parentCategory"> {
  if (!nav) return {};
  const href = (slug: string) => `/categories/${encodeURIComponent(slug)}`;
  const isSub = nav.current.id !== nav.main.id;
  return {
    categoryDescription: nav.current.description,
    parentCategory: isSub ? { name: nav.main.name, href: href(nav.main.slug) } : undefined,
  };
}

export { PRODUCTS_PER_PAGE };
