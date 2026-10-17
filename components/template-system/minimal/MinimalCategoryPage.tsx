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
import { Search, ChevronRight, ChevronLeft } from "lucide-react";
import { Link } from "#root/components/utils/Link";
import {
  MinimalProductCard,
  type MinimalProduct,
} from "#root/components/template-system/minimal/MinimalProductCard";
import { QuickViewDialog } from "#root/components/template-system/minimal/QuickViewDialog";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { cn } from "#root/lib/utils";
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

/* ── Types ──────────────────────────────────────────────────────────── */

export interface MinimalCategoryProduct extends MinimalProduct {}

export interface SubcategoryNavItem {
  id: string;
  name: string;
  href: string;
}

export interface SubcategoryNav {
  /** Link back to the whole main category ("All"). */
  allHref: string;
  /** The subcategory being viewed; omitted on the main category itself. */
  activeId?: string;
  items: SubcategoryNavItem[];
}

export interface MinimalCategoryPageProps {
  products: MinimalCategoryProduct[];
  categoryName?: string;
  /** Optional line under the heading (the category's admin description). */
  categoryDescription?: string | null;
  /** The main category, when the page shows one of its subcategories. */
  parentCategory?: { name: string; href: string };
  /** Subcategory tabs. Nothing renders unless there is at least one item. */
  subcategoryNav?: SubcategoryNav;
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

const PRODUCTS_PER_PAGE = 12; // 3 rows × 4 cols

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
  const { locale } = useMinimalI18n();

  return (
    <div className="border-b border-perce-line bg-perce-bg">
      <div className="perce-container py-4">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-[length:var(--perce-text-small)] text-perce-ink-muted">
          <Link
            href="/"
            className="perce-underline-hover transition-colors hover:text-perce-ink">
            {ct("breadcrumb.home")}
          </Link>
          <ChevronRight
            aria-hidden
            className={cn("w-3.5 h-3.5 shrink-0", locale === "ar" && "rotate-180")}
          />
          <Link
            href="/shop"
            className="perce-underline-hover transition-colors hover:text-perce-ink">
            {ct("breadcrumb.shop")}
          </Link>
          {parentCategory && (
            <>
              <ChevronRight
                aria-hidden
                className={cn("w-3.5 h-3.5 shrink-0", locale === "ar" && "rotate-180")}
              />
              <Link
                href={parentCategory.href}
                className="perce-underline-hover truncate transition-colors hover:text-perce-ink">
                {parentCategory.name}
              </Link>
            </>
          )}
          {categoryName && (
            <>
              <ChevronRight
                aria-hidden
                className={cn("w-3.5 h-3.5 shrink-0", locale === "ar" && "rotate-180")}
              />
              <span aria-current="page" className="truncate text-perce-ink">
                {categoryName}
              </span>
            </>
          )}
        </nav>
      </div>
    </div>
  );
}

/* ── Subcategory tabs ────────────────────────────────────────────────── */

/**
 * "All · Lobe · Helix · Daith" — a quiet text tab row under the heading.
 * Real links (shareable, crawlable, back-button friendly), not filter state.
 * Scrolls sideways on a phone instead of wrapping into a block of pills; the
 * active tab carries the 1px ink rule the rest of the site uses for links.
 */
function SubcategoryTabs({ nav }: { nav: SubcategoryNav }) {
  const ct = useCategoryT();
  if (nav.items.length === 0) return null;

  const tabs = [
    { id: "__all", name: ct("subnav.all"), href: nav.allHref, active: !nav.activeId },
    ...nav.items.map((item) => ({ ...item, active: item.id === nav.activeId })),
  ];

  return (
    <nav
      aria-label={ct("subnav.label")}
      // The hairline is an inset shadow, not a border: the row scrolls
      // (overflow-x), which would clip a tab border overlapping a real one,
      // and children paint over an inset shadow — so the active tab's rule
      // sits exactly on the hairline.
      className="-mx-[var(--perce-gutter)] mb-6 overflow-x-auto scrollbar-hide shadow-[inset_0_-1px_0_var(--perce-border)] sm:mx-0 sm:mb-8">
      <ul className="flex w-max gap-6 px-[var(--perce-gutter)] sm:gap-8 sm:px-0">
        {tabs.map((tab) => (
          <li key={tab.id}>
            {/* A plain <a>: the shared Link component drops aria-current, and
                Vike routes plain links client-side anyway. */}
            <a
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center whitespace-nowrap border-b text-[length:var(--perce-text-small)] font-medium transition-colors",
                tab.active
                  ? "border-perce-ink text-perce-ink"
                  : "border-transparent text-perce-ink-muted hover:text-perce-ink",
              )}>
              {tab.name}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/* ── Pagination ──────────────────────────────────────────────────────── */

const pagerButtonClass =
  "inline-flex min-h-11 items-center gap-1.5 border border-perce-line-strong px-4 text-[length:var(--perce-text-small)] font-medium text-perce-ink-secondary transition-colors hover:border-perce-ink hover:text-perce-ink";

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
      <span aria-disabled="true" className={cn(className, "pointer-events-none opacity-30")} {...aria}>
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
  const { locale } = useMinimalI18n();

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
      className="flex items-center justify-center gap-2 pt-12 pb-4">
      {/* Previous */}
      <PageControl
        page={currentPage - 1}
        href={pageHref?.(currentPage - 1)}
        onNavigate={onPageChange}
        disabled={currentPage <= 1}
        className={pagerButtonClass}>
        <ChevronLeft aria-hidden className={cn("w-4 h-4", locale === "ar" && "rotate-180")} />
        {ct("pagination.previous")}
      </PageControl>

      {/* Page numbers */}
      <div className="hidden sm:flex items-center gap-1">
        {pages.map((page, idx) =>
          page === "..." ? (
            <span
              key={`ellipsis-${idx}`}
              aria-hidden
              className="px-2 text-perce-ink-subtle">
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
                "flex h-11 w-11 items-center justify-center text-[length:var(--perce-text-small)] font-medium transition-colors",
                page === currentPage
                  ? "bg-perce-cta text-perce-ink-inverse"
                  : "text-perce-ink-secondary hover:bg-perce-surface",
              )}>
              {page}
            </PageControl>
          ),
        )}
      </div>

      {/* Mobile page indicator */}
      <span className="sm:hidden text-[length:var(--perce-text-small)] text-perce-ink-muted">
        {ct("pagination.page_of", { current: currentPage, total: totalPages })}
      </span>

      {/* Next */}
      <PageControl
        page={currentPage + 1}
        href={pageHref?.(currentPage + 1)}
        onNavigate={onPageChange}
        disabled={currentPage >= totalPages}
        className={pagerButtonClass}>
        {ct("pagination.next")}
        <ChevronRight aria-hidden className={cn("w-4 h-4", locale === "ar" && "rotate-180")} />
      </PageControl>
    </nav>
  );
}

/* ── Skeleton loader ─────────────────────────────────────────────────── */

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8 sm:gap-x-6">
      {[...Array(PRODUCTS_PER_PAGE)].map((_, i) => (
        <div key={i} className="flex flex-col">
          {/* 4:5 to match MinimalProductCard. A square skeleton reflowed the
              whole grid the moment the real cards arrived. */}
          <div className="aspect-[4/5] animate-pulse bg-perce-surface" />
          <div className="space-y-2 pt-3">
            <div className="h-4 w-3/4 animate-pulse bg-perce-surface" />
            <div className="h-4 w-1/3 animate-pulse bg-perce-surface" />
            <div className="h-4 w-1/2 animate-pulse bg-perce-surface" />
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
  subcategoryNav,
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
    <div className="perce-header-offset min-h-screen bg-perce-bg">
      {/* Breadcrumbs */}
      <CategoryBreadcrumbs
        categoryName={categoryName}
        parentCategory={parentCategory}
      />

      <div className="bg-perce-bg">
        <div className="perce-container py-6">
          {/* Page heading. /shop and /categories/[slug] previously rendered no
              <h1> at all — the first heading on the page was an <h3> inside a
              product card, so assistive tech and crawlers had nothing naming
              the page. Uses the category name when browsing one. */}
          <div className="mb-6 sm:mb-8">
            <h1 className="perce-section-title">
              {categoryName || ct("breadcrumb.shop")}
            </h1>
            {categoryDescription?.trim() && (
              <p className="mt-2 max-w-prose text-[length:var(--perce-text-body)] text-perce-ink-muted">
                {categoryDescription}
              </p>
            )}
            {/* Result count is read from the API's own total, never estimated.
                Hidden while loading so the number never counts up from a
                stale page. */}
            {!isLoading && !loadFailed && totalProducts > 0 && (
              <p
                aria-live="polite"
                className="perce-eyebrow mt-2">
                {totalProducts === 1
                  ? ct("results.count_one")
                  : ct("results.count", { count: totalProducts })}
              </p>
            )}
          </div>

          {subcategoryNav && <SubcategoryTabs nav={subcategoryNav} />}

          <div
            ref={resultsRef}
            className="scroll-mt-[calc(var(--perce-header-offset)+1rem)]">
            {/* Toolbar. Filters (left, desktop) only expose dimensions backed
                by real product fields — see backend/products/listing-facets.
                Below lg the filters live in a drawer behind one button. */}
            <div className="mb-8 space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
                {showFilters && filterModel && (
                  <div className="hidden lg:block">
                    <DesktopFilterBar model={filterModel} />
                  </div>
                )}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:ms-auto">
                  {/* Search */}
                  <div className="relative min-w-0 sm:flex-1 lg:w-64 lg:flex-none">
                    <label htmlFor="minimal-cat-search" className="sr-only">
                      {ct("search.placeholder")}
                    </label>
                    <Search
                      aria-hidden
                      className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-perce-ink-subtle"
                    />
                    <input
                      id="minimal-cat-search"
                      type="search"
                      placeholder={ct("search.placeholder")}
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      className="min-h-11 w-full border border-perce-line-strong bg-perce-surface-raised pe-4 ps-10 text-[length:var(--perce-text-body)] text-perce-ink placeholder:text-perce-ink-subtle focus:border-perce-ink focus:outline-none"
                    />
                  </div>

                  <div className="flex min-w-0 items-center gap-3">
                    {showFilters && (
                      <FilterButton
                        count={filterCount}
                        onClick={() => setDrawerOpen(true)}
                        className="flex-1 sm:flex-none lg:hidden"
                      />
                    )}
                    {/* Sort */}
                    <label
                      htmlFor="minimal-cat-sort"
                      className="perce-eyebrow sr-only whitespace-nowrap lg:not-sr-only"
                    >
                      {ct("sort.label")}
                    </label>
                    <select
                      id="minimal-cat-sort"
                      value={currentSort}
                      onChange={(e) => onSortChange(e.target.value as ListingSort)}
                      className="min-h-11 min-w-0 flex-1 border border-perce-line-strong bg-perce-surface-raised px-3 text-[length:var(--perce-text-body)] text-perce-ink focus:border-perce-ink focus:outline-none sm:w-52 sm:flex-none sm:px-4"
                    >
                      {sortOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
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
                  <h2 className="perce-section-title">{ct("error.title")}</h2>
                  <p className="mt-2 text-[length:var(--perce-text-body)] text-perce-ink-muted">
                    {ct("error.subtitle")}
                  </p>
                  {onRetry && (
                    <button
                      type="button"
                      onClick={onRetry}
                      className="perce-underline mt-6 inline-flex min-h-11 items-center text-[length:var(--perce-text-small)] font-medium text-perce-ink">
                      {ct("error.retry")}
                    </button>
                  )}
                </div>
              </div>
            ) : products.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 lg:py-24">
                <div className="max-w-md text-center">
                  <h2 className="perce-section-title">
                    {isFiltering ? ct("empty.title") : ct("empty.catalogue.title")}
                  </h2>
                  <p className="mt-2 text-[length:var(--perce-text-body)] text-perce-ink-muted">
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
                      className="perce-underline mt-6 inline-flex min-h-11 items-center text-[length:var(--perce-text-small)] font-medium text-perce-ink">
                      {searchOnly ? ct("empty.clear_search") : ct("empty.clear_filters")}
                    </button>
                  ) : (
                    <Link
                      href="/"
                      className="perce-underline mt-6 inline-flex min-h-11 items-center text-[length:var(--perce-text-small)] font-medium text-perce-ink">
                      {ct("empty.catalogue.action")}
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div
                  aria-busy={isRefreshing || undefined}
                  data-testid="product-grid"
                  className={cn(
                    "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8 sm:gap-x-6 transition-opacity duration-[var(--perce-duration)]",
                    isRefreshing && "opacity-50",
                  )}>
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
 * Heading, breadcrumb and tab props for a resolved category (see
 * storefrontCategoryNav). Tabs always link to /categories/<slug>, whichever
 * route the shopper arrived on.
 */
export function categoryNavProps(
  nav: StorefrontCategoryNav<CategoryNodeLike & { description?: string | null }> | undefined,
): Pick<MinimalCategoryPageProps, "categoryDescription" | "parentCategory" | "subcategoryNav"> {
  if (!nav) return {};
  const href = (slug: string) => `/categories/${encodeURIComponent(slug)}`;
  const isSub = nav.current.id !== nav.main.id;
  return {
    categoryDescription: nav.current.description,
    parentCategory: isSub ? { name: nav.main.name, href: href(nav.main.slug) } : undefined,
    subcategoryNav: {
      allHref: href(nav.main.slug),
      activeId: isSub ? nav.current.id : undefined,
      items: nav.tabs.map((t) => ({ id: t.id, name: t.name, href: href(t.slug) })),
    },
  };
}

export { PRODUCTS_PER_PAGE };
