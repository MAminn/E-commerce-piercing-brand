import { CategoryBundlesSection } from "#root/components/bundles/CategoryBundlesSection";
import { useState, useMemo, useCallback } from "react";
import { Search, ChevronRight, ChevronLeft } from "lucide-react";
import { Link } from "#root/components/utils/Link";
import {
  MinimalProductCard,
  type MinimalProduct,
} from "#root/components/template-system/minimal/MinimalProductCard";
import { QuickViewDialog } from "#root/components/template-system/minimal/QuickViewDialog";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import {
  minimalCategoryT,
  type MinimalCategoryKey,
} from "#root/lib/i18n/minimal-category-translations";
import { cn } from "#root/lib/utils";
import { MinimalTestimonialsSection } from "#root/components/template-system/minimal/MinimalTestimonials";

/* ── Types ──────────────────────────────────────────────────────────── */

export interface MinimalCategoryProduct extends MinimalProduct {}

export interface MinimalCategoryPageProps {
  products: MinimalCategoryProduct[];
  categoryName?: string;
  /** When known, live bundle campaigns placed on this category render below the grid. */
  categoryId?: string;
  isLoading?: boolean;
  totalProducts: number;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onSortChange: (sort: string) => void;
  onSearchChange: (search: string) => void;
  currentSort: string;
  currentSearch: string;
  onQuickView?: (product: MinimalProduct) => void;
}

/* ── Constants ──────────────────────────────────────────────────────── */

const PRODUCTS_PER_PAGE = 12; // 3 rows × 4 cols

/* ── Helper: translate with locale ──────────────────────────────────── */

function useCategoryT() {
  const { locale } = useMinimalI18n();
  const ct = useCallback(
    (key: MinimalCategoryKey, replacements?: Record<string, string | number>) => {
      const lang = locale === "ar" ? "ar" : "en";
      let value: string = minimalCategoryT[lang][key] ?? key;
      if (replacements) {
        for (const [k, v] of Object.entries(replacements)) {
          value = value.replace(`{${k}}`, String(v));
        }
      }
      return value;
    },
    [locale],
  );
  return ct;
}

/* ── Sort options ───────────────────────────────────────────────────── */

function useSortOptions() {
  const ct = useCategoryT();
  return useMemo(
    () => [
      { value: "featured", label: ct("sort.featured") },
      { value: "newest", label: ct("sort.newest") },
      { value: "price-asc", label: ct("sort.price_asc") },
      { value: "price-desc", label: ct("sort.price_desc") },
    ],
    [ct],
  );
}

/* ── Breadcrumbs ─────────────────────────────────────────────────────── */

function CategoryBreadcrumbs({
  categoryName,
}: {
  categoryName?: string;
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

/* ── Pagination ──────────────────────────────────────────────────────── */

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
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
      <button
        type="button"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="inline-flex min-h-11 items-center gap-1.5 border border-perce-line-strong px-4 text-[length:var(--perce-text-small)] font-medium text-perce-ink-secondary transition-colors hover:border-perce-ink hover:text-perce-ink disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronLeft aria-hidden className={cn("w-4 h-4", locale === "ar" && "rotate-180")} />
        {ct("pagination.previous")}
      </button>

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
            <button
              key={page}
              type="button"
              onClick={() => onPageChange(page)}
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
              )}
            >
              {page}
            </button>
          ),
        )}
      </div>

      {/* Mobile page indicator */}
      <span className="sm:hidden text-[length:var(--perce-text-small)] text-perce-ink-muted">
        {ct("pagination.page_of", { current: currentPage, total: totalPages })}
      </span>

      {/* Next */}
      <button
        type="button"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="inline-flex min-h-11 items-center gap-1.5 border border-perce-line-strong px-4 text-[length:var(--perce-text-small)] font-medium text-perce-ink-secondary transition-colors hover:border-perce-ink hover:text-perce-ink disabled:cursor-not-allowed disabled:opacity-30"
      >
        {ct("pagination.next")}
        <ChevronRight aria-hidden className={cn("w-4 h-4", locale === "ar" && "rotate-180")} />
      </button>
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

export function MinimalCategoryPage({
  products,
  categoryName,
  categoryId,
  isLoading,
  totalProducts,
  currentPage,
  totalPages,
  onPageChange,
  onSortChange,
  onSearchChange,
  currentSort,
  currentSearch,
  onQuickView,
}: MinimalCategoryPageProps) {
  const ct = useCategoryT();
  const { locale } = useMinimalI18n();
  const sortOptions = useSortOptions();
  const [quickViewProduct, setQuickViewProduct] = useState<MinimalProduct | null>(null);

  const handleQuickView = useCallback((product: MinimalProduct) => {
    if (onQuickView) {
      onQuickView(product);
    } else {
      setQuickViewProduct(product);
    }
  }, [onQuickView]);

  // Two different empty states. A search that matched nothing is the
  // shopper's problem to fix and gets a control to fix it; a collection with
  // no products at all is the store's state and gets no advice the shopper
  // cannot act on.
  const isFiltering = currentSearch.trim().length > 0;

  return (
    <div className="perce-header-offset min-h-screen bg-perce-bg">
      {/* Breadcrumbs */}
      <CategoryBreadcrumbs categoryName={categoryName} />

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
            {/* Result count is read from the API's own total, never estimated.
                Hidden while loading so the number never counts up from a
                stale page. */}
            {!isLoading && totalProducts > 0 && (
              <p
                aria-live="polite"
                className="perce-eyebrow mt-2">
                {ct("results.count", { count: totalProducts })}
              </p>
            )}
          </div>

          {/* Toolbar: search + sort */}
          {/* Toolbar. Search and sort only — both are backed by real
              `product.search` parameters. No price/brand/rating facets: the
              product schema has no fields behind them, and a filter that
              filters nothing is worse than no filter. */}
          <div className="mb-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-4">
            {/* Search */}
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
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
                value={currentSearch}
                onChange={(e) => onSearchChange(e.target.value)}
                className="min-h-11 w-full border border-perce-line-strong bg-perce-surface-raised pe-4 ps-10 text-[length:var(--perce-text-body)] text-perce-ink placeholder:text-perce-ink-subtle focus:border-perce-ink focus:outline-none"
              />
            </div>

            {/* Sort */}
            <div className="flex min-w-0 items-center gap-3">
              <label
                htmlFor="minimal-cat-sort"
                className="perce-eyebrow whitespace-nowrap"
              >
                {ct("sort.label")}
              </label>
              <select
                id="minimal-cat-sort"
                value={currentSort}
                onChange={(e) => onSortChange(e.target.value)}
                className="min-h-11 min-w-0 flex-1 border border-perce-line-strong bg-perce-surface-raised px-3 text-[length:var(--perce-text-body)] text-perce-ink focus:border-perce-ink focus:outline-none sm:flex-none sm:w-52 sm:px-4"
              >
                {sortOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Product grid */}
          {isLoading ? (
            <GridSkeleton />
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 lg:py-24">
              <div className="max-w-md text-center">
                <h2 className="perce-section-title">
                  {isFiltering ? ct("empty.title") : ct("empty.catalogue.title")}
                </h2>
                <p className="mt-2 text-[length:var(--perce-text-body)] text-perce-ink-muted">
                  {isFiltering
                    ? ct("empty.subtitle")
                    : ct("empty.catalogue.subtitle")}
                </p>
                {isFiltering ? (
                  <button
                    type="button"
                    onClick={() => onSearchChange("")}
                    className="perce-underline mt-6 inline-flex min-h-11 items-center text-[length:var(--perce-text-small)] font-medium text-perce-ink">
                    {ct("empty.clear_search")}
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
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8 sm:gap-x-6">
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
                onPageChange={onPageChange}
              />
            </>
          )}
        </div>
      </div>

      {/* Bundles placed on this category (merchant-controlled) */}
      {categoryId && <CategoryBundlesSection categoryId={categoryId} />}

      {/* Testimonials */}
      <MinimalTestimonialsSection />

      {/* Quick View Dialog */}
      <QuickViewDialog
        product={quickViewProduct}
        open={!!quickViewProduct}
        onClose={() => setQuickViewProduct(null)}
      />
    </div>
  );
}

export { PRODUCTS_PER_PAGE };
