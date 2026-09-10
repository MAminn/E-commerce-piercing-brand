import React, { useState } from "react";
import { Skeleton } from "#root/components/ui/skeleton";
import {
  Search,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import type { SearchResultProduct } from "./SearchResultsGrid";
import { getProductUrl } from "#root/lib/utils/route-helpers";
import { EditorialChrome } from "../editorial/EditorialChrome";
import { Reveal } from "../motion/Reveal";
import { StaggerContainer, StaggerItem } from "../motion/Stagger";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface SearchResultsEditorialProps {
  searchQuery: string;
  products: SearchResultProduct[];
  totalResults?: number;
  isLoading?: boolean;
  searchTerm?: string;
  onSearchChange?: (value: string) => void;
  sortBy?: string;
  onSortChange?: (value: string) => void;
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  onFilterToggle?: () => void;
  showFilters?: boolean;
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
] as const;

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function safePrice(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? Number.parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

function formatPrice(v: number): string {
  return `EGP ${v.toFixed(2)}`;
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */

function ResultTile({ product }: { product: SearchResultProduct }) {
  const discount = safePrice(product.discountPrice);
  const hasDiscount = discount != null && discount < product.price;
  const isSoldOut = !product.available || (product.stock != null && product.stock <= 0);

  return (
    <a
      href={getProductUrl(product)}
      className="group block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-stone-900/25 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-50"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-stone-200">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs tracking-[0.28em] uppercase text-stone-400">
              No image
            </span>
          </div>
        )}
        {isSoldOut && (
          <span className="absolute top-3 start-3 text-[10px] tracking-[0.28em] uppercase text-stone-600 bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full">
            Sold Out
          </span>
        )}
      </div>
      <div className="mt-3">
        {product.categoryName && (
          <p className="text-[10px] tracking-[0.28em] uppercase text-stone-500">
            {product.categoryName}
          </p>
        )}
        <p className="mt-1 text-sm font-medium text-stone-900 line-clamp-2">
          {product.name}
        </p>
        <div className="mt-1 flex items-center gap-2 text-sm">
          {hasDiscount ? (
            <>
              <span className="font-medium text-stone-900">
                {formatPrice(discount)}
              </span>
              <span className="text-stone-500 line-through">
                {formatPrice(product.price)}
              </span>
            </>
          ) : (
            <span className="text-stone-700">{formatPrice(product.price)}</span>
          )}
        </div>
      </div>
    </a>
  );
}

function SkeletonTile() {
  return (
    <div>
      <Skeleton className="aspect-[4/5] w-full rounded-2xl" />
      <Skeleton className="mt-3 h-3 w-20 rounded" />
      <Skeleton className="mt-2 h-4 w-32 rounded" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                    */
/* ------------------------------------------------------------------ */

export function SearchResultsEditorial({
  searchQuery,
  products,
  totalResults,
  isLoading = false,
  searchTerm,
  onSearchChange,
  sortBy = "relevance",
  onSortChange,
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  onFilterToggle,
  showFilters,
  className = "",
}: SearchResultsEditorialProps) {
  const [localSearch, setLocalSearch] = useState(searchTerm ?? searchQuery);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearchChange?.(localSearch);
  };

  return (
    <EditorialChrome>
    <div className={`min-h-screen bg-stone-50 ${className}`}>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-10">
        {/* Header */}
        <Reveal variant="fadeUp">
        <div className="mb-10">
          <p className="text-xs tracking-[0.32em] uppercase text-stone-500">
            Search Results
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
            &ldquo;{searchQuery}&rdquo;
          </h1>
          {totalResults != null && (
            <p className="mt-2 text-sm text-stone-500">
              {totalResults} {totalResults === 1 ? "result" : "results"} found
            </p>
          )}
        </div>
        </Reveal>
        <div className="flex flex-wrap items-center gap-3 mb-8">
          {/* Search refinement */}
          {onSearchChange && (
            <form
              onSubmit={handleSearchSubmit}
              className="relative flex-1 min-w-[200px] max-w-sm"
            >
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
              <input
                type="text"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                placeholder="Refine search…"
                className="w-full h-9 rounded-full border border-stone-200 bg-white ps-9 pe-4 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/15"
              />
            </form>
          )}

          {/* Sort */}
          {onSortChange && (
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value)}
              className="h-9 rounded-full border border-stone-200 bg-white px-4 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-900/15 appearance-none cursor-pointer"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}

          {/* Filter toggle */}
          {onFilterToggle && (
            <button
              type="button"
              onClick={onFilterToggle}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors ${
                showFilters
                  ? "border-stone-900 bg-stone-900 text-white"
                  : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
            </button>
          )}
        </div>

        {/* ============================================================ */}
        {/*  CONTENT                                                     */}
        {/* ============================================================ */}
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <SkeletonTile key={i} />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-sm text-stone-500">
              No results found for &ldquo;{searchQuery}&rdquo;
            </p>
            <p className="mt-2 text-xs text-stone-400">
              Try different keywords or browse our collection.
            </p>
          </div>
        ) : (
          <StaggerContainer className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {products.map((product) => (
              <StaggerItem key={product.id}>
                <ResultTile product={product} />
              </StaggerItem>
            ))}
          </StaggerContainer>
        )}

        {/* ============================================================ */}
        {/*  PAGINATION                                                  */}
        {/* ============================================================ */}
        {totalPages > 1 && onPageChange && (
          <div className="mt-12 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 hover:border-stone-300 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(
                (p) =>
                  p === 1 ||
                  p === totalPages ||
                  Math.abs(p - currentPage) <= 1,
              )
              .reduce<(number | "ellipsis")[]>((acc, page, idx, arr) => {
                if (idx > 0 && arr[idx - 1] !== undefined) {
                  const prev = arr[idx - 1];
                  if (typeof prev === "number" && page - prev > 1) {
                    acc.push("ellipsis");
                  }
                }
                acc.push(page);
                return acc;
              }, [])
              .map((item, idx) =>
                item === "ellipsis" ? (
                  <span
                    key={`e-${idx}`}
                    className="w-9 text-center text-sm text-stone-400"
                  >
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    onClick={() => onPageChange(item)}
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors ${
                      item === currentPage
                        ? "bg-stone-900 text-white"
                        : "border border-stone-200 bg-white text-stone-700 hover:border-stone-300"
                    }`}
                  >
                    {item}
                  </button>
                ),
              )}

            <button
              type="button"
              onClick={() =>
                onPageChange(Math.min(totalPages, currentPage + 1))
              }
              disabled={currentPage >= totalPages}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 hover:border-stone-300 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
    </EditorialChrome>
  );
}

SearchResultsEditorial.displayName = "SearchResultsEditorial";
