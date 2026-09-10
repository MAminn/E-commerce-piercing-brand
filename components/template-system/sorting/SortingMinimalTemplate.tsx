import React, { useState, useMemo } from "react";
import { Link } from "#root/components/utils/Link";
import { Search, SlidersHorizontal, X, ChevronRight } from "lucide-react";
import type { FeaturedProduct } from "../home/HomeFeaturedProducts";
import { getProductUrl } from "#root/lib/utils/route-helpers";
import heroImage from "#root/assets/landing.webp";

/**
 * Extended product type for sorting pages
 */
export interface SortingPageProduct extends FeaturedProduct {
  brand?: string;
  rating?: number;
  reviewCount?: number;
  description?: string;
}

/**
 * Props for SortingMinimalTemplate
 */
export interface SortingMinimalTemplateProps {
  products: SortingPageProduct[];
  isLoading?: boolean;
  emptyStateMessage?: string;
  defaultSort?: string;
  onSortChange?: (value: string) => void;
  className?: string;
}

const SORT_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "New Arrivals" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
] as const;

interface FilterState {
  search: string;
  categories: string[];
  priceRange: [number, number];
  inStockOnly: boolean;
}

/**
 * Dark hero section for shop page — ensures transparent navbar text is readable.
 */
function ShopHero({
  productCount,
  hasActiveFilters,
}: {
  productCount?: number;
  hasActiveFilters?: boolean;
}) {
  return (
    <section className='relative w-full h-55 sm:h-65 lg:h-80 overflow-hidden'>
      {/* Background image */}
      <img
        src={heroImage}
        alt=''
        aria-hidden='true'
        className='absolute inset-0 w-full h-full object-cover object-center'
      />

      {/* Dark overlay */}
      <div className='absolute inset-0 bg-black/60' />

      {/* Bottom fade into bg-neutral-50 */}
      {/* <div className='absolute bottom-0 left-0 right-0 h-24 bg-linear-to-t from-neutral-50 to-transparent' /> */}

      {/* Content */}
      <div className='relative z-10 h-full flex flex-col justify-end max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10 lg:pb-14'>
        {/* Breadcrumbs */}
        <nav className='flex items-center gap-2 text-sm text-white/60 mb-3'>
          <Link href='/' className='hover:text-white/90 transition-colors'>
            Home
          </Link>
          <ChevronRight className='w-3.5 h-3.5' />
          <span className='text-white font-medium'>Shop</span>
        </nav>

        {/* Title */}
        <h1 className='text-3xl sm:text-4xl lg:text-5xl font-light tracking-tight text-white mb-1.5'>
          Collection
        </h1>

        {/* Subtitle */}
        {productCount !== undefined && (
          <p className='text-sm sm:text-base text-white/50 font-light tracking-wide'>
            {productCount} {productCount === 1 ? "piece" : "pieces"}
            {hasActiveFilters ? " found" : " curated for you"}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Premium ecommerce collection page for Percé.
 */
export function SortingMinimalTemplate({
  products = [],
  isLoading = false,
  emptyStateMessage = "No products found",
  defaultSort = "featured",
  onSortChange,
  className = "",
}: SortingMinimalTemplateProps) {
  const [currentSort, setCurrentSort] = useState(defaultSort);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    categories: [],
    priceRange: [0, 1000],
    inStockOnly: false,
  });

  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => {
      if (p.categoryName) cats.add(p.categoryName);
    });
    return Array.from(cats).sort();
  }, [products]);

  const productPriceRange = useMemo((): [number, number] => {
    if (products.length === 0) return [0, 1000];
    const prices = products.map((p) => {
      const price = p.discountPrice ?? p.price;
      return typeof price === "string" ? parseFloat(price) : price;
    });
    return [Math.floor(Math.min(...prices)), Math.ceil(Math.max(...prices))];
  }, [products]);

  const filteredAndSortedProducts = useMemo(() => {
    let filtered = [...products];

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter((p) =>
        p.name.toLowerCase().includes(searchLower),
      );
    }

    if (filters.categories.length > 0) {
      filtered = filtered.filter(
        (p) => p.categoryName && filters.categories.includes(p.categoryName),
      );
    }

    if (filters.inStockOnly) {
      filtered = filtered.filter((p) => p.stock > 0);
    }

    filtered = filtered.filter((p) => {
      const price = p.discountPrice ?? p.price;
      const numPrice = typeof price === "string" ? parseFloat(price) : price;
      return (
        numPrice >= filters.priceRange[0] && numPrice <= filters.priceRange[1]
      );
    });

    filtered.sort((a, b) => {
      const aPrice =
        typeof a.price === "string" ? parseFloat(a.price) : (a.price ?? 0);
      const bPrice =
        typeof b.price === "string" ? parseFloat(b.price) : (b.price ?? 0);

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

    return filtered;
  }, [products, filters, currentSort]);

  const handleSortChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setCurrentSort(value);
    if (onSortChange) {
      onSortChange(value);
    }
  };

  const toggleCategory = (category: string) => {
    setFilters((prev) => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter((c) => c !== category)
        : [...prev.categories, category],
    }));
  };

  const clearFilters = () => {
    setFilters({
      search: "",
      categories: [],
      priceRange: productPriceRange,
      inStockOnly: false,
    });
  };

  const formatPrice = (price: number | string | null | undefined): string => {
    if (price === null || price === undefined) return "N/A";
    const numPrice = typeof price === "string" ? parseFloat(price) : price;
    if (isNaN(numPrice)) return "N/A";
    return `EGP ${numPrice.toFixed(2)}`;
  };

  const resolveImagePath = (url: string | undefined | null): string => {
    if (!url) return "/placeholder.jpg";
    if (
      url.startsWith("http") ||
      url.startsWith("/uploads/") ||
      url.startsWith("/assets/")
    )
      return url;
    return `/uploads/${url}`;
  };

  const getImageUrl = (product: SortingPageProduct): string => {
    if (product.imageUrl) return resolveImagePath(product.imageUrl);
    if (product.images && product.images.length > 0) {
      const primaryImage = product.images.find((img) => img.isPrimary);
      return resolveImagePath(primaryImage?.url || product.images[0]?.url);
    }
    return "/placeholder.jpg";
  };

  const hasActiveFilters =
    filters.search ||
    filters.categories.length > 0 ||
    filters.inStockOnly ||
    filters.priceRange[0] !== productPriceRange[0] ||
    filters.priceRange[1] !== productPriceRange[1];

  const FiltersUI = () => (
    <div className='space-y-6'>
      <div>
        <label
          htmlFor='search-input'
          className='block text-sm font-medium text-neutral-900 mb-2'>
          Search Products
        </label>
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400' />
          <input
            id='search-input'
            type='text'
            placeholder='Search by name...'
            value={filters.search}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, search: e.target.value }))
            }
            className='w-full pl-10 pr-4 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent'
          />
        </div>
      </div>

      {availableCategories.length > 0 && (
        <div>
          <h3 className='text-sm font-medium text-neutral-900 mb-3'>
            Categories
          </h3>
          <div className='space-y-2'>
            {availableCategories.map((category) => (
              <label
                key={category}
                className='flex items-center gap-2 cursor-pointer group'>
                <input
                  type='checkbox'
                  checked={filters.categories.includes(category)}
                  onChange={() => toggleCategory(category)}
                  className='w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-2 focus:ring-neutral-900'
                />
                <span className='text-sm text-neutral-700 group-hover:text-neutral-900'>
                  {category}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className='text-sm font-medium text-neutral-900 mb-3'>
          Price Range
        </h3>
        <div className='space-y-3'>
          <div className='flex items-center gap-3'>
            <input
              type='number'
              min={productPriceRange[0]}
              max={productPriceRange[1]}
              value={filters.priceRange[0]}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  priceRange: [Number(e.target.value), prev.priceRange[1]],
                }))
              }
              className='w-20 px-2 py-1 text-sm border border-neutral-300 rounded focus:outline-none focus:ring-2 focus:ring-neutral-900'
            />
            <span className='text-neutral-400'>—</span>
            <input
              type='number'
              min={productPriceRange[0]}
              max={productPriceRange[1]}
              value={filters.priceRange[1]}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  priceRange: [prev.priceRange[0], Number(e.target.value)],
                }))
              }
              className='w-20 px-2 py-1 text-sm border border-neutral-300 rounded focus:outline-none focus:ring-2 focus:ring-neutral-900'
            />
          </div>
          <input
            type='range'
            min={productPriceRange[0]}
            max={productPriceRange[1]}
            value={filters.priceRange[1]}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                priceRange: [prev.priceRange[0], Number(e.target.value)],
              }))
            }
            className='w-full'
          />
        </div>
      </div>

      <div>
        <label className='flex items-center gap-2 cursor-pointer group'>
          <input
            type='checkbox'
            checked={filters.inStockOnly}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, inStockOnly: e.target.checked }))
            }
            className='w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-2 focus:ring-neutral-900'
          />
          <span className='text-sm font-medium text-neutral-700 group-hover:text-neutral-900'>
            In Stock Only
          </span>
        </label>
      </div>

      {hasActiveFilters && (
        <button
          onClick={clearFilters}
          className='w-full px-4 py-2 text-sm font-medium text-neutral-700 border border-neutral-300 rounded-md hover:bg-neutral-50 transition-colors'>
          Clear All Filters
        </button>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div className={`min-h-screen ${className}`}>
        {/* Hero with skeleton */}
        <ShopHero />

        <div className='bg-neutral-50'>
          <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12'>
            <div className='flex flex-col sm:flex-row gap-4 mb-8'>
              <div className='flex-1 h-10 bg-neutral-200 rounded animate-pulse' />
              <div className='w-full sm:w-48 h-10 bg-neutral-200 rounded animate-pulse' />
            </div>
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'>
              {[...Array(8)].map((_, i) => (
                <div key={i} className='bg-white rounded-lg overflow-hidden'>
                  <div className='aspect-square bg-neutral-200 animate-pulse' />
                  <div className='p-4 space-y-3'>
                    <div className='h-3 w-20 bg-neutral-200 rounded animate-pulse' />
                    <div className='h-4 w-full bg-neutral-200 rounded animate-pulse' />
                    <div className='h-4 w-3/4 bg-neutral-200 rounded animate-pulse' />
                    <div className='h-5 w-16 bg-neutral-200 rounded animate-pulse' />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${className}`}>
      {/* Dark hero for navbar readability */}
      <ShopHero
        productCount={filteredAndSortedProducts.length}
        hasActiveFilters={!!hasActiveFilters}
      />

      <div className='bg-neutral-50'>
        <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12'>
          <div className='lg:hidden mb-6'>
            <button
              onClick={() => setMobileFiltersOpen(true)}
              className='flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-900 border border-neutral-300 rounded-md hover:bg-white transition-colors'>
              <SlidersHorizontal className='w-4 h-4' />
              Filters
              {hasActiveFilters && (
                <span className='ml-1 px-2 py-0.5 text-xs bg-neutral-900 text-white rounded-full'>
                  {filters.categories.length +
                    (filters.search ? 1 : 0) +
                    (filters.inStockOnly ? 1 : 0)}
                </span>
              )}
            </button>
          </div>

          <div className='flex flex-col sm:flex-row gap-4 mb-8'>
            <div className='hidden lg:block flex-1'>
              <div className='relative max-w-md'>
                <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400' />
                <input
                  type='text'
                  placeholder='Search products...'
                  value={filters.search}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, search: e.target.value }))
                  }
                  className='w-full pl-10 pr-4 py-2 text-sm border border-neutral-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent'
                />
              </div>
            </div>

            <div className='flex items-center gap-3'>
              <label
                htmlFor='sort-select'
                className='text-sm font-medium text-neutral-700 whitespace-nowrap'>
                Sort by
              </label>
              <select
                id='sort-select'
                value={currentSort}
                onChange={handleSortChange}
                className='flex-1 sm:flex-none sm:w-48 px-4 py-2 text-sm border border-neutral-300 rounded-md bg-white hover:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent'>
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className='lg:grid lg:grid-cols-[240px_1fr] lg:gap-12'>
            <aside className='hidden lg:block'>
              <div className='sticky top-24'>
                <h2 className='text-lg font-medium text-neutral-900 mb-6'>
                  Filters
                </h2>
                <FiltersUI />
              </div>
            </aside>

            <div>
              {filteredAndSortedProducts.length === 0 ? (
                <div className='flex flex-col items-center justify-center py-16 lg:py-24'>
                  <div className='text-center max-w-md'>
                    <h3 className='text-lg font-medium text-neutral-900 mb-2'>
                      {emptyStateMessage}
                    </h3>
                    <p className='text-sm text-neutral-600 mb-6'>
                      Try adjusting your filters or browse our full collection
                    </p>
                    {hasActiveFilters && (
                      <button
                        onClick={clearFilters}
                        className='px-6 py-2 text-sm font-medium text-white bg-neutral-900 rounded-md hover:bg-neutral-800 transition-colors'>
                        Clear All Filters
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'>
                  {filteredAndSortedProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      formatPrice={formatPrice}
                      getImageUrl={getImageUrl}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {mobileFiltersOpen && (
        <div className='fixed inset-0 z-50 lg:hidden'>
          <div
            className='absolute inset-0 bg-black/50'
            onClick={() => setMobileFiltersOpen(false)}
          />
          <div className='absolute right-0 top-0 bottom-0 w-full max-w-sm bg-white shadow-xl overflow-y-auto'>
            <div className='sticky top-0 bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between'>
              <h2 className='text-lg font-medium text-neutral-900'>Filters</h2>
              <button
                onClick={() => setMobileFiltersOpen(false)}
                className='p-2 -mr-2 hover:bg-neutral-100 rounded-md transition-colors'>
                <X className='w-5 h-5' />
              </button>
            </div>
            <div className='p-6'>
              <FiltersUI />
            </div>
            <div className='sticky bottom-0 bg-white border-t border-neutral-200 px-6 py-4'>
              <button
                onClick={() => setMobileFiltersOpen(false)}
                className='w-full px-6 py-3 text-sm font-medium text-white bg-neutral-900 rounded-md hover:bg-neutral-800 transition-colors'>
                View {filteredAndSortedProducts.length} Products
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ProductCardProps {
  product: SortingPageProduct;
  formatPrice: (price: number | string | null | undefined) => string;
  getImageUrl: (product: SortingPageProduct) => string;
}

function ProductCard({ product, formatPrice, getImageUrl }: ProductCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const discountPercentage = product.discountPrice
    ? Math.round(
        ((Number(product.price) - Number(product.discountPrice)) /
          Number(product.price)) *
          100,
      )
    : 0;

  return (
    <Link
      href={getProductUrl(product)}
      className='group block bg-white rounded-lg overflow-hidden border border-transparent hover:border-neutral-200 hover:shadow-lg transition-all duration-300'>
      <div className='relative aspect-square bg-neutral-100 overflow-hidden'>
        {!imageLoaded && (
          <div className='absolute inset-0 bg-linear-to-br from-neutral-100 to-neutral-200 animate-pulse' />
        )}
        <img
          src={getImageUrl(product)}
          alt={product.name}
          onLoad={() => setImageLoaded(true)}
          className={`w-full h-full object-cover transition-all duration-500 ${
            imageLoaded ? "opacity-100 scale-100" : "opacity-0 scale-95"
          } group-hover:scale-105`}
        />

        {discountPercentage > 0 && (
          <div className='absolute top-3 left-3 px-2 py-1 text-xs font-medium text-white bg-red-600 rounded'>
            -{discountPercentage}%
          </div>
        )}

        {product.stock === 0 && (
          <div className='absolute inset-0 bg-white/80 flex items-center justify-center'>
            <span className='px-4 py-2 text-sm font-medium text-neutral-900 bg-white border border-neutral-300 rounded'>
              Out of Stock
            </span>
          </div>
        )}
      </div>

      <div className='p-4'>
        {product.categoryName && (
          <p className='text-xs uppercase tracking-wider text-neutral-500 mb-1'>
            {product.categoryName}
          </p>
        )}

        <h3 className='text-sm font-medium text-neutral-900 mb-2 line-clamp-2 min-h-10 group-hover:text-neutral-700 transition-colors'>
          {product.name}
        </h3>

        <div className='flex items-baseline gap-2'>
          {product.discountPrice ? (
            <>
              <span className='text-base font-semibold text-neutral-900'>
                {formatPrice(product.discountPrice)}
              </span>
              <span className='text-sm text-neutral-500 line-through'>
                {formatPrice(product.price)}
              </span>
            </>
          ) : (
            <span className='text-base font-semibold text-neutral-900'>
              {formatPrice(product.price)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
