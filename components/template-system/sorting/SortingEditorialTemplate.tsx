import React, { useState, useMemo } from "react";
import { Search, SlidersHorizontal, X, ChevronRight } from "lucide-react";
import { Skeleton } from "#root/components/ui/skeleton";
import type { SortingPageProduct } from "./SortingMinimalTemplate";
import { getProductUrl } from "#root/lib/utils/route-helpers";
import heroImage from "#root/assets/landing.webp";
import { EditorialChrome } from "../editorial/EditorialChrome";
import { Reveal } from "../motion/Reveal";
import { StaggerContainer, StaggerItem } from "../motion/Stagger";
import { ParallaxImage } from "../motion/ParallaxImage";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface SortingEditorialTemplateProps {
  products: SortingPageProduct[];
  isLoading?: boolean;
  emptyStateMessage?: string;
  defaultSort?: string;
  onSortChange?: (value: string) => void;
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const SORT_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "New Arrivals" },
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

function EditorialHero({
  productCount,
  hasActiveFilters,
}: {
  productCount?: number;
  hasActiveFilters?: boolean;
}) {
  return (
    <section className="relative w-full h-56 sm:h-64 lg:h-80 overflow-hidden">
      <ParallaxImage src={heroImage} alt="" strength={20} />
      <div className="absolute inset-0 bg-black/55" />
      <div className="relative z-10 h-full flex flex-col justify-end max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 pb-10 lg:pb-14">
        <nav className="flex items-center gap-2 text-sm text-white/60 mb-3">
          <a href="/" className="hover:text-white/90 transition-colors">
            Home
          </a>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-white font-medium">Collection</span>
        </nav>
        <Reveal variant="fadeUp">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-white leading-tight">
          The Collection
        </h1>
        {productCount !== undefined && (
          <p className="mt-2 text-sm text-white/50 tracking-wide">
            {productCount} {productCount === 1 ? "piece" : "pieces"}
            {hasActiveFilters ? " found" : " curated for you"}
          </p>
        )}
        </Reveal>
      </div>
    </section>
  );
}

function ProductTile({ product }: { product: SortingPageProduct }) {
  const primary = product.images?.find((i) => i.isPrimary);
  const img = primary?.url || product.images?.[0]?.url || product.imageUrl;
  const secondary =
    product.images && product.images.length > 1
      ? product.images.find((i) => !i.isPrimary)?.url
      : null;
  const discount = safePrice(product.discountPrice);
  const hasDiscount = discount != null && discount < product.price;
  const isSoldOut = !product.available || product.stock <= 0;

  return (
    <a
      href={getProductUrl(product)}
      className="group block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-stone-900/25 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-50"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-stone-200">
        {img ? (
          <>
            <img
              src={img}
              alt={product.name}
              loading="lazy"
              decoding="async"
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
                secondary ? "group-hover:opacity-0" : ""
              }`}
            />
            {secondary && (
              <img
                src={secondary}
                alt=""
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              />
            )}
          </>
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

export function SortingEditorialTemplate({
  products = [],
  isLoading = false,
  emptyStateMessage = "No products found",
  defaultSort = "featured",
  onSortChange,
  className = "",
}: SortingEditorialTemplateProps) {
  const [currentSort, setCurrentSort] = useState(defaultSort);
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [inStockOnly, setInStockOnly] = useState(false);

  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const p of products) {
      if (p.categoryName) cats.add(p.categoryName);
    }
    return Array.from(cats).sort();
  }, [products]);

  const hasActiveFilters =
    searchQuery.length > 0 || selectedCategories.length > 0 || inStockOnly;

  const filteredAndSorted = useMemo(() => {
    let result = [...products];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.brand?.toLowerCase().includes(q) ||
          p.categoryName?.toLowerCase().includes(q),
      );
    }

    if (selectedCategories.length > 0) {
      result = result.filter(
        (p) => p.categoryName && selectedCategories.includes(p.categoryName),
      );
    }

    if (inStockOnly) {
      result = result.filter((p) => p.stock > 0);
    }

    result.sort((a, b) => {
      const aPrice =
        typeof a.price === "string" ? Number.parseFloat(a.price) : a.price ?? 0;
      const bPrice =
        typeof b.price === "string" ? Number.parseFloat(b.price) : b.price ?? 0;
      switch (currentSort) {
        case "price-asc":
          return aPrice - bPrice;
        case "price-desc":
          return bPrice - aPrice;
        case "newest":
          return b.id.localeCompare(a.id);
        default:
          return 0;
      }
    });

    return result;
  }, [products, searchQuery, selectedCategories, inStockOnly, currentSort]);

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setCurrentSort(value);
    onSortChange?.(value);
  };

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedCategories([]);
    setInStockOnly(false);
  };

  return (
    <EditorialChrome>
    <div className={`sorting-editorial bg-stone-50 min-h-screen ${className}`}>
      <EditorialHero
        productCount={filteredAndSorted.length}
        hasActiveFilters={hasActiveFilters}
      />

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-10 py-10 sm:py-14">
        {/* ============================================================ */}
        {/*  STICKY FILTER BAR                                           */}
        {/* ============================================================ */}
        <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-10 bg-stone-50/95 backdrop-blur-sm border-b border-stone-900/10 px-4 sm:px-6 lg:px-10 py-3 mb-8">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
              <input
                type="text"
                placeholder="Search collection…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 rounded-full border border-stone-200 bg-white ps-9 pe-4 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/15"
              />
            </div>

            {/* Sort */}
            <select
              value={currentSort}
              onChange={handleSortChange}
              className="h-9 rounded-full border border-stone-200 bg-white px-4 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-900/15 appearance-none cursor-pointer"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Filter toggle */}
            {availableCategories.length > 0 && (
              <button
                type="button"
                onClick={() => setFiltersOpen((o) => !o)}
                className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors ${
                  filtersOpen || hasActiveFilters
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filters
                {hasActiveFilters && (
                  <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-medium text-stone-900">
                    {selectedCategories.length + (inStockOnly ? 1 : 0)}
                  </span>
                )}
              </button>
            )}

            {/* Clear filters */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-9 items-center gap-1 text-sm text-stone-500 hover:text-stone-900 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
          </div>

          {/* Filter panel */}
          {filtersOpen && availableCategories.length > 0 && (
            <div className="mt-3 pb-2 flex flex-wrap gap-2">
              {availableCategories.map((cat) => {
                const active = selectedCategories.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className={`h-8 rounded-full px-4 text-xs tracking-wide transition-colors ${
                      active
                        ? "bg-stone-900 text-white"
                        : "bg-white border border-stone-200 text-stone-700 hover:border-stone-300"
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setInStockOnly((v) => !v)}
                className={`h-8 rounded-full px-4 text-xs tracking-wide transition-colors ${
                  inStockOnly
                    ? "bg-stone-900 text-white"
                    : "bg-white border border-stone-200 text-stone-700 hover:border-stone-300"
                }`}
              >
                In Stock Only
              </button>
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/*  PRODUCT GRID                                                */}
        {/* ============================================================ */}
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <SkeletonTile key={i} />
            ))}
          </div>
        ) : filteredAndSorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-sm text-stone-500">{emptyStateMessage}</p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 text-sm font-medium text-stone-900 underline underline-offset-8 decoration-stone-900/20 hover:decoration-stone-900/40 transition-colors"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <StaggerContainer className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {filteredAndSorted.map((product) => (
              <StaggerItem key={product.id}>
                <ProductTile product={product} />
              </StaggerItem>
            ))}
          </StaggerContainer>
        )}
      </div>
    </div>
    </EditorialChrome>
  );
}

SortingEditorialTemplate.displayName = "SortingEditorialTemplate";
