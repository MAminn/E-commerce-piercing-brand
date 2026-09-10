import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import type { SortingPageProduct } from "../sorting/SortingMinimalTemplate";
import { useCart } from "#root/lib/context/CartContext";
import { showCartToast } from "#root/components/ui/cart-toast";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { cn } from "#root/lib/utils";
import { NoirChrome } from "./NoirChrome";
import { ProductCardNoir, type NoirProduct } from "./ProductCardNoir";
import { NoirSkeletonCard } from "./NoirProductSection";
import {
  NOIR_DISPLAY_FONT_CLASSES,
  NOIR_INPUT_CLASSES,
  NOIR_MONO_FONT_CLASSES,
  NOIR_TEXT_MUTED_CLASSES,
  NOIR_TEXT_SECONDARY_CLASSES,
} from "./noir-tokens";

/* ------------------------------------------------------------------ */
/*  Types — exact sorting template contract                            */
/*  (pages/shop/+Page.tsx and pages/categories/@slug/+Page.tsx)        */
/* ------------------------------------------------------------------ */

export interface SortingNoirTemplateProps {
  products?: SortingPageProduct[];
  isLoading?: boolean;
  emptyStateMessage?: string;
  defaultSort?: string;
  onSortChange?: (value: string) => void;
  onOpenFilters?: () => void;
  className?: string;
  /** Admin preview mode — disables the <html> chrome side effect */
  previewMode?: boolean;
}

interface FilterState {
  search: string;
  categories: string[];
  /** null = no user constraint (full data range) */
  priceRange: [number, number] | null;
  inStockOnly: boolean;
}

function resolveImageUrl(url?: string | null): string {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("/")) return url;
  return `/uploads/${url}`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

/**
 * SortingNoirTemplate — Demo 5 "Noir" shop/category collection page.
 *
 * Client-side search / category / price-range / availability filters
 * (same functionality as SortingMinimalTemplate, no invented filter
 * types), dark sort select, responsive ProductCardNoir grid (4/3/2),
 * dark skeletons, translated empty state with clear-filters action.
 * Desktop: left filter sidebar. Mobile: collapsible filter panel.
 */
export function SortingNoirTemplate({
  products = [],
  isLoading = false,
  emptyStateMessage,
  defaultSort = "featured",
  onSortChange,
  className = "",
  previewMode = false,
}: SortingNoirTemplateProps) {
  const { t, locale } = useMinimalI18n();
  const isAr = locale === "ar";
  const track = isAr ? "" : "tracking-[0.18em]";
  const { addItem } = useCart();

  const [currentSort, setCurrentSort] = useState(defaultSort);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    categories: [],
    priceRange: null,
    inStockOnly: false,
  });

  const SORT_OPTIONS = [
    { value: "featured", label: isAr ? "مميز" : "Featured" },
    { value: "newest", label: t("new_arrivals") },
    {
      value: "price-asc",
      label: isAr ? "السعر: من الأقل" : "Price: Low to High",
    },
    {
      value: "price-desc",
      label: isAr ? "السعر: من الأعلى" : "Price: High to Low",
    },
  ];

  // Category names derived from the product data (same as SortingMinimal)
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const p of products) {
      if (p.categoryName) cats.add(p.categoryName);
    }
    return Array.from(cats).sort();
  }, [products]);

  // Full price range of the data set
  const dataPriceRange = useMemo((): [number, number] => {
    if (products.length === 0) return [0, 0];
    const prices = products.map((p) => Number(p.discountPrice ?? p.price));
    return [Math.floor(Math.min(...prices)), Math.ceil(Math.max(...prices))];
  }, [products]);

  const effectiveRange = filters.priceRange ?? dataPriceRange;

  const filteredAndSorted = useMemo(() => {
    let filtered = [...products];

    if (filters.search) {
      const q = filters.search.toLowerCase();
      filtered = filtered.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (filters.categories.length > 0) {
      filtered = filtered.filter(
        (p) => p.categoryName && filters.categories.includes(p.categoryName),
      );
    }
    if (filters.inStockOnly) {
      filtered = filtered.filter((p) => p.stock > 0);
    }
    if (filters.priceRange) {
      filtered = filtered.filter((p) => {
        const price = Number(p.discountPrice ?? p.price);
        return (
          price >= (filters.priceRange as [number, number])[0] &&
          price <= (filters.priceRange as [number, number])[1]
        );
      });
    }

    filtered.sort((a, b) => {
      switch (currentSort) {
        case "price-asc":
          return (
            Number(a.discountPrice ?? a.price) -
            Number(b.discountPrice ?? b.price)
          );
        case "price-desc":
          return (
            Number(b.discountPrice ?? b.price) -
            Number(a.discountPrice ?? a.price)
          );
        case "newest":
          return b.id.localeCompare(a.id);
        default:
          return 0;
      }
    });

    return filtered;
  }, [products, filters, currentSort]);

  const hasActiveFilters =
    filters.search !== "" ||
    filters.categories.length > 0 ||
    filters.priceRange !== null ||
    filters.inStockOnly;

  // Keep a small result set composed: cap columns + max-width and center
  // it so 1–3 products don't scatter across a wide void.
  const shownCount = filteredAndSorted.length;
  const gridColsClass =
    shownCount <= 1
      ? "grid-cols-1"
      : shownCount === 2
        ? "grid-cols-2"
        : shownCount === 3
          ? "grid-cols-2 md:grid-cols-3"
          : "grid-cols-2 md:grid-cols-3 xl:grid-cols-4";
  const gridCapClass =
    shownCount <= 1
      ? "max-w-xs"
      : shownCount === 2
        ? "max-w-xl mx-auto"
        : shownCount === 3
          ? "max-w-4xl mx-auto"
          : "";

  const clearFilters = () =>
    setFilters({
      search: "",
      categories: [],
      priceRange: null,
      inStockOnly: false,
    });

  const toggleCategory = (category: string) =>
    setFilters((prev) => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter((c) => c !== category)
        : [...prev.categories, category],
    }));

  const handleSortChange = (value: string) => {
    setCurrentSort(value);
    onSortChange?.(value);
  };

  // Add-to-cart from the grid — same cart source the existing cards use
  const handleAddToCart = (product: NoirProduct) => {
    if (product.available === false) return;
    const price = Number(
      product.discountPrice != null && product.discountPrice !== ""
        ? product.discountPrice
        : product.price,
    );
    const imageUrl =
      product.images && product.images.length > 0
        ? resolveImageUrl(
            (product.images.find((i) => i.isPrimary) || product.images[0])?.url,
          )
        : resolveImageUrl(product.imageUrl);
    const success = addItem(
      {
        id: product.id,
        name: product.name,
        price,
        imageUrl: imageUrl || undefined,
        stock: product.stock ?? 0,
      },
      1,
      {},
    );
    if (success) {
      showCartToast({
        name: product.name,
        price,
        imageUrl: imageUrl || undefined,
      });
    }
  };

  /* ── Filter panel (shared desktop sidebar / mobile collapsible) ── */
  const filterPanel = (
    <div className='space-y-7'>
      {/* Search */}
      <div>
        <h3
          className={cn(
            "text-[10px] uppercase font-semibold text-white mb-3",
            track,
            NOIR_DISPLAY_FONT_CLASSES,
          )}>
          {isAr ? "بحث" : "Search"}
        </h3>
        <div className='relative'>
          <Search
            className={cn(
              "absolute top-1/2 -translate-y-1/2 start-3 w-3.5 h-3.5",
              NOIR_TEXT_MUTED_CLASSES,
            )}
            strokeWidth={1.5}
          />
          <input
            type='text'
            value={filters.search}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, search: e.target.value }))
            }
            placeholder={isAr ? "ابحث عن منتج..." : "Search products..."}
            className={cn(
              "w-full ps-9 pe-3 py-2.5 text-sm",
              NOIR_INPUT_CLASSES,
            )}
          />
        </div>
      </div>

      {/* Categories — only when the data provides them */}
      {availableCategories.length > 0 && (
        <div className='border-t border-white/10 pt-6'>
          <h3
            className={cn(
              "text-[10px] uppercase font-semibold text-white mb-3",
              track,
              NOIR_DISPLAY_FONT_CLASSES,
            )}>
            {t("categories")}
          </h3>
          <div className='space-y-2.5'>
            {availableCategories.map((category) => (
              <label
                key={category}
                className='flex items-center gap-2.5 cursor-pointer group'>
                <input
                  type='checkbox'
                  checked={filters.categories.includes(category)}
                  onChange={() => toggleCategory(category)}
                  className='w-3.5 h-3.5 accent-[#E8112D] cursor-pointer'
                />
                <span
                  className={cn(
                    "text-sm group-hover:text-white transition-colors duration-200",
                    NOIR_TEXT_SECONDARY_CLASSES,
                  )}>
                  {category}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Price range */}
      {products.length > 0 && (
        <div className='border-t border-white/10 pt-6'>
          <h3
            className={cn(
              "text-[10px] uppercase font-semibold text-white mb-3",
              track,
              NOIR_DISPLAY_FONT_CLASSES,
            )}>
            {isAr ? "السعر" : "Price"}
          </h3>
          <div className='flex items-center gap-2'>
            <input
              type='number'
              min={dataPriceRange[0]}
              max={effectiveRange[1]}
              value={effectiveRange[0]}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  priceRange: [
                    Number(e.target.value) || 0,
                    (prev.priceRange ?? dataPriceRange)[1],
                  ],
                }))
              }
              aria-label={isAr ? "أدنى سعر" : "Minimum price"}
              className={cn(
                "w-full px-3 py-2 text-sm",
                NOIR_MONO_FONT_CLASSES,
                NOIR_INPUT_CLASSES,
              )}
            />
            <span className={NOIR_TEXT_MUTED_CLASSES}>–</span>
            <input
              type='number'
              min={effectiveRange[0]}
              max={dataPriceRange[1]}
              value={effectiveRange[1]}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  priceRange: [
                    (prev.priceRange ?? dataPriceRange)[0],
                    Number(e.target.value) || 0,
                  ],
                }))
              }
              aria-label={isAr ? "أعلى سعر" : "Maximum price"}
              className={cn(
                "w-full px-3 py-2 text-sm",
                NOIR_MONO_FONT_CLASSES,
                NOIR_INPUT_CLASSES,
              )}
            />
          </div>
        </div>
      )}

      {/* Availability */}
      <div className='border-t border-white/10 pt-6'>
        <label className='flex items-center gap-2.5 cursor-pointer group'>
          <input
            type='checkbox'
            checked={filters.inStockOnly}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, inStockOnly: e.target.checked }))
            }
            className='w-3.5 h-3.5 accent-[#E8112D] cursor-pointer'
          />
          <span
            className={cn(
              "text-sm group-hover:text-white transition-colors duration-200",
              NOIR_TEXT_SECONDARY_CLASSES,
            )}>
            {t("in_stock")}
          </span>
        </label>
      </div>

      {/* Clear filters */}
      {hasActiveFilters && (
        <button
          type='button'
          onClick={clearFilters}
          className={cn(
            "inline-flex items-center gap-1.5 text-[11px] uppercase text-[#E8112D] hover:text-[#C40E26] transition-colors duration-200",
            track,
            NOIR_DISPLAY_FONT_CLASSES,
          )}>
          <X className='w-3 h-3' strokeWidth={1.5} />
          {isAr ? "مسح الفلاتر" : "Clear filters"}
        </button>
      )}
    </div>
  );

  return (
    <NoirChrome previewMode={previewMode}>
      <div
        className={cn(
          "mx-auto max-w-7xl px-4 md:px-8 py-8 md:py-12",
          className,
        )}>
        {/* ── Header row ── */}
        <div className='flex flex-wrap items-end justify-between gap-4 mb-8'>
          <div>
            <h1
              className={cn(
                "uppercase font-bold text-white leading-none text-[clamp(2rem,4.5vw,3.5rem)]",
                isAr ? "" : "tracking-[0.04em]",
                NOIR_DISPLAY_FONT_CLASSES,
              )}>
              {isAr ? "المجموعة" : "Collection"}
            </h1>
            <div className='w-12 h-0.5 bg-[#E8112D] mt-3' aria-hidden='true' />
            {!isLoading && (
              <p
                className={cn(
                  "flex items-center gap-2 text-xs mt-3",
                  NOIR_MONO_FONT_CLASSES,
                  NOIR_TEXT_MUTED_CLASSES,
                )}>
                <span
                  className='inline-block w-1.5 h-1.5 rounded-full bg-[#E8112D]'
                  aria-hidden='true'
                />
                {isAr
                  ? `${filteredAndSorted.length} منتج`
                  : `${filteredAndSorted.length} product${filteredAndSorted.length === 1 ? "" : "s"}`}
              </p>
            )}
          </div>

          <div className='flex items-center gap-3'>
            {/* Mobile filters toggle */}
            <button
              type='button'
              onClick={() => setMobileFiltersOpen((v) => !v)}
              aria-expanded={mobileFiltersOpen}
              className={cn(
                "lg:hidden inline-flex items-center gap-2 px-4 py-2.5 rounded-md border border-white/15",
                "text-[11px] uppercase text-white/80 hover:border-white/40 transition-colors duration-200",
                track,
                NOIR_DISPLAY_FONT_CLASSES,
              )}>
              {mobileFiltersOpen ? (
                <X className='w-3.5 h-3.5' strokeWidth={1.5} />
              ) : (
                <SlidersHorizontal className='w-3.5 h-3.5' strokeWidth={1.5} />
              )}
              {isAr ? "الفلاتر" : "Filters"}
            </button>

            {/* Sort */}
            <select
              value={currentSort}
              onChange={(e) => handleSortChange(e.target.value)}
              aria-label={isAr ? "ترتيب" : "Sort by"}
              className={cn(
                "px-3 py-2.5 text-xs uppercase cursor-pointer",
                NOIR_INPUT_CLASSES,
              )}>
              {SORT_OPTIONS.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  className='bg-[#101010]'>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Mobile collapsible filter panel ── */}
        {mobileFiltersOpen && (
          <div className='lg:hidden mb-8 p-5 bg-[#101010] border border-white/10 rounded-xl'>
            {filterPanel}
          </div>
        )}

        <div className='grid lg:grid-cols-[240px_1fr] gap-10'>
          {/* ── Desktop sidebar ── */}
          <aside className='hidden lg:block'>
            <div className='sticky top-24'>{filterPanel}</div>
          </aside>

          {/* ── Grid ── */}
          <div>
            {isLoading ? (
              <div className='grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6'>
                {Array.from({ length: 8 }, (_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static skeletons
                  <NoirSkeletonCard key={i} />
                ))}
              </div>
            ) : filteredAndSorted.length === 0 ? (
              <div className='text-center py-24 space-y-4'>
                <p className={cn("text-sm", NOIR_TEXT_SECONDARY_CLASSES)}>
                  {emptyStateMessage ||
                    (isAr ? "لا توجد منتجات" : "No products found")}
                </p>
                {hasActiveFilters && (
                  <button
                    type='button'
                    onClick={clearFilters}
                    className={cn(
                      "inline-flex items-center gap-2 px-8 py-3 border border-white/20 rounded-md",
                      "text-xs uppercase text-white/80 hover:border-white/50 hover:text-white transition-colors duration-300",
                      track,
                      NOIR_DISPLAY_FONT_CLASSES,
                    )}>
                    {isAr ? "مسح الفلاتر" : "Clear filters"}
                  </button>
                )}
              </div>
            ) : (
              <div
                className={cn(
                  "grid gap-4 md:gap-6",
                  // Cap columns + width so a few products stay composed,
                  // never scattered across a void.
                  gridColsClass,
                  gridCapClass,
                )}>
                {filteredAndSorted.map((product) => (
                  <ProductCardNoir
                    key={product.id}
                    product={product}
                    onAddToCart={handleAddToCart}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </NoirChrome>
  );
}

SortingNoirTemplate.displayName = "SortingNoirTemplate";
