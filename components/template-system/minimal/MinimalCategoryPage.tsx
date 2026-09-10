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
    <div className="border-b border-stone-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <nav className="flex items-center gap-2 text-sm text-stone-500">
          <Link href="/" className="hover:text-stone-900 transition-colors">
            {ct("breadcrumb.home")}
          </Link>
          <ChevronRight className={cn("w-3.5 h-3.5", locale === "ar" && "rotate-180")} />
          <Link href="/shop" className="hover:text-stone-900 transition-colors">
            {ct("breadcrumb.shop")}
          </Link>
          {categoryName && (
            <>
              <ChevronRight className={cn("w-3.5 h-3.5", locale === "ar" && "rotate-180")} />
              <span className="text-stone-900 font-medium">{categoryName}</span>
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
    <div className="flex items-center justify-center gap-2 pt-12 pb-4">
      {/* Previous */}
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-stone-700 border border-stone-300 hover:border-stone-900 hover:text-stone-900 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronLeft className={cn("w-4 h-4", locale === "ar" && "rotate-180")} />
        {ct("pagination.previous")}
      </button>

      {/* Page numbers */}
      <div className="hidden sm:flex items-center gap-1">
        {pages.map((page, idx) =>
          page === "..." ? (
            <span key={`ellipsis-${idx}`} className="px-2 text-stone-400">
              …
            </span>
          ) : (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              className={cn(
                "w-10 h-10 flex items-center justify-center text-sm font-medium transition-colors",
                page === currentPage
                  ? "bg-stone-900 text-white"
                  : "text-stone-600 hover:bg-stone-100",
              )}
            >
              {page}
            </button>
          ),
        )}
      </div>

      {/* Mobile page indicator */}
      <span className="sm:hidden text-sm text-stone-500">
        {ct("pagination.page_of", { current: currentPage, total: totalPages })}
      </span>

      {/* Next */}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-stone-700 border border-stone-300 hover:border-stone-900 hover:text-stone-900 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {ct("pagination.next")}
        <ChevronRight className={cn("w-4 h-4", locale === "ar" && "rotate-180")} />
      </button>
    </div>
  );
}

/* ── Skeleton loader ─────────────────────────────────────────────────── */

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8 sm:gap-x-6">
      {[...Array(PRODUCTS_PER_PAGE)].map((_, i) => (
        <div key={i} className="flex flex-col">
          <div className="aspect-square bg-stone-100 animate-pulse" />
          <div className="pt-3 space-y-2">
            <div className="h-4 w-3/4 bg-stone-100 rounded animate-pulse mx-auto" />
            <div className="h-4 w-1/3 bg-stone-100 rounded animate-pulse mx-auto" />
            <div className="h-10 w-full bg-stone-100 animate-pulse" />
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

  return (
    <div className="min-h-screen mt-25">
      {/* Breadcrumbs */}
      <CategoryBreadcrumbs categoryName={categoryName} />

      <div className="bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Toolbar: search + sort */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 mb-8">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                type="text"
                placeholder={ct("search.placeholder")}
                value={currentSearch}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full ps-10 pe-4 py-2.5 text-sm border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-transparent"
              />
            </div>

            {/* Sort */}
            <div className="flex items-center gap-3">
              <label
                htmlFor="minimal-cat-sort"
                className="text-sm font-medium text-stone-700 whitespace-nowrap"
              >
                {ct("sort.label")}
              </label>
              <select
                id="minimal-cat-sort"
                value={currentSort}
                onChange={(e) => onSortChange(e.target.value)}
                className="flex-1 sm:flex-none sm:w-52 px-4 py-2.5 text-sm border border-stone-300 bg-white hover:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-transparent"
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
              <div className="text-center max-w-md">
                <h3 className="text-lg font-medium text-stone-900 mb-2">
                  {ct("empty.title")}
                </h3>
                <p className="text-sm text-stone-600">
                  {ct("empty.subtitle")}
                </p>
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
