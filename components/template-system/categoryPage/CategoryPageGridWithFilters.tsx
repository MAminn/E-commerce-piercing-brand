import React, { useState } from "react";
import { Button } from "#root/components/ui/button";
import { Card, CardContent } from "#root/components/ui/card";
import { Badge } from "#root/components/ui/badge";
import { Checkbox } from "#root/components/ui/checkbox";
import { Label } from "#root/components/ui/label";
import { Separator } from "#root/components/ui/separator";
import { Slider } from "#root/components/ui/slider";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "#root/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#root/components/ui/select";
import { ProductCard } from "#root/components/shop/ProductCard";
import type { FeaturedProduct } from "../home/HomeFeaturedProducts";
import type { CategoryContent } from "#root/shared/types/category-content";
import {
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  Star,
  Grid3x3,
  List,
  SlidersHorizontal,
} from "lucide-react";

/**
 * Extended product type for category pages
 */
export interface CategoryPageProduct extends FeaturedProduct {
  brand?: string;
  rating?: number;
  reviewCount?: number;
}

/**
 * Filter state interface
 */
export interface CategoryFilters {
  categories?: string[];
  priceRange?: [number, number];
  brands?: string[];
  rating?: number;
  inStock?: boolean;
}

/**
 * Sort options
 */
export type SortOption =
  | "featured"
  | "price-asc"
  | "price-desc"
  | "newest"
  | "rating";

/**
 * Props for CategoryPageGridWithFilters
 */
export interface CategoryPageGridWithFiltersProps {
  /**
   * Category content (from CMS) - new approach
   */
  content?: CategoryContent;

  /**
   * Category name/title - legacy, kept for backward compatibility
   */
  categoryName?: string;

  /**
   * Category description - legacy, kept for backward compatibility
   */
  categoryDescription?: string;

  /**
   * Products to display
   */
  products?: CategoryPageProduct[];

  /**
   * Total product count (for pagination)
   */
  totalProducts?: number;

  /**
   * Current page
   */
  currentPage?: number;

  /**
   * Products per page
   */
  productsPerPage?: number;

  /**
   * Available categories for filter
   */
  availableCategories?: Array<{ id: string; name: string; count: number }>;

  /**
   * Available brands for filter
   */
  availableBrands?: Array<{ id: string; name: string; count: number }>;

  /**
   * Price range limits
   */
  priceRangeLimits?: [number, number];

  /**
   * Show banner at top
   */
  showBanner?: boolean;

  /**
   * Banner content
   */
  bannerContent?: {
    title?: string;
    description?: string;
    imageUrl?: string;
  };

  /**
   * Show SEO text at bottom
   */
  showSeoText?: boolean;

  /**
   * SEO text content
   */
  seoText?: string;

  /**
   * Callback handlers
   */
  onSortChange?: (sort: SortOption) => void;
  onFilterChange?: (filters: CategoryFilters) => void;
  onClearFilters?: () => void;
  onPageChange?: (page: number) => void;

  /**
   * Additional CSS classes
   */
  className?: string;
}

// Mock data
const MOCK_CATEGORIES = [
  { id: "electronics", name: "Electronics", count: 45 },
  { id: "fashion", name: "Fashion", count: 78 },
  { id: "home", name: "Home & Garden", count: 32 },
  { id: "sports", name: "Sports", count: 24 },
];

const MOCK_BRANDS = [
  { id: "apple", name: "Apple", count: 12 },
  { id: "samsung", name: "Samsung", count: 18 },
  { id: "sony", name: "Sony", count: 15 },
  { id: "lg", name: "LG", count: 10 },
];

const MOCK_PRODUCTS: CategoryPageProduct[] = Array.from(
  { length: 12 },
  (_, i) => ({
    id: `product-${i + 1}`,
    name: `Premium Product ${i + 1}`,
    price: 99.99 + i * 10,
    discountPrice: i % 3 === 0 ? 79.99 + i * 10 : null,
    stock: 10 + i,
    available: true,
    imageUrl: `https://images.unsplash.com/photo-${1500000000000 + i}?w=400`,
    brand: MOCK_BRANDS[i % MOCK_BRANDS.length]?.name,
    rating: 3.5 + (i % 3) * 0.5,
    reviewCount: 10 + i * 5,
  }),
);

/**
 * Category Page Grid with Filters Template
 *
 * A complete category/listing page featuring:
 * - Sidebar filters (desktop) / drawer filters (mobile)
 * - Product grid with sorting
 * - Pagination
 * - Optional banner and SEO text
 */
export function CategoryPageGridWithFilters({
  content,
  categoryName = "All Products",
  categoryDescription = "Browse our collection of quality products",
  products = MOCK_PRODUCTS,
  totalProducts,
  currentPage = 1,
  productsPerPage = 12,
  availableCategories = MOCK_CATEGORIES,
  availableBrands = MOCK_BRANDS,
  priceRangeLimits = [0, 1000],
  showBanner = false,
  bannerContent = {},
  showSeoText = true,
  seoText = "Discover our wide selection of quality products. Shop with confidence knowing you're getting the best deals and exceptional customer service.",
  onSortChange,
  onFilterChange,
  onClearFilters,
  onPageChange,
  className = "",
}: CategoryPageGridWithFiltersProps) {
  // Use content from CMS if available, otherwise fall back to legacy props
  const displayTitle = content?.title || categoryName;
  const displayDescription = content?.description.enabled
    ? content.description.text
    : categoryDescription;
  const showHero = content?.hero.enabled && content.hero.imageUrl;

  // State
  const [sortBy, setSortBy] = useState<SortOption>("featured");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [filters, setFilters] = useState<CategoryFilters>({
    categories: [],
    priceRange: priceRangeLimits,
    brands: [],
    rating: undefined,
    inStock: false,
  });
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);

  // Calculate pagination
  const totalCount = totalProducts || products.length;
  const totalPages = Math.ceil(totalCount / productsPerPage);
  const startIndex = (currentPage - 1) * productsPerPage;
  const endIndex = startIndex + productsPerPage;
  const displayedProducts = products.slice(startIndex, endIndex);

  // Handlers
  const handleSortChange = (value: string) => {
    const newSort = value as SortOption;
    setSortBy(newSort);
    if (onSortChange) {
      onSortChange(newSort);
    }
  };

  const handleFilterUpdate = (newFilters: Partial<CategoryFilters>) => {
    const updatedFilters = { ...filters, ...newFilters };
    setFilters(updatedFilters);
    if (onFilterChange) {
      onFilterChange(updatedFilters);
    }
  };

  const handleClearFilters = () => {
    const clearedFilters: CategoryFilters = {
      categories: [],
      priceRange: priceRangeLimits,
      brands: [],
      rating: undefined,
      inStock: false,
    };
    setFilters(clearedFilters);
    if (onClearFilters) {
      onClearFilters();
    }
  };

  const handlePageChange = (page: number) => {
    if (onPageChange) {
      onPageChange(page);
    }
  };

  const toggleCategoryFilter = (categoryId: string) => {
    const current = filters.categories || [];
    const updated = current.includes(categoryId)
      ? current.filter((id) => id !== categoryId)
      : [...current, categoryId];
    handleFilterUpdate({ categories: updated });
  };

  const toggleBrandFilter = (brandId: string) => {
    const current = filters.brands || [];
    const updated = current.includes(brandId)
      ? current.filter((id) => id !== brandId)
      : [...current, brandId];
    handleFilterUpdate({ brands: updated });
  };

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`w-4 h-4 ${
          i < rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
        }`}
      />
    ));
  };

  // Filter sidebar content
  const FilterContent = () => (
    <div className='space-y-6'>
      {/* Clear Filters */}
      <div className='flex items-center justify-between'>
        <h3 className='text-lg font-semibold text-gray-900'>Filters</h3>
        <Button
          variant='ghost'
          size='sm'
          onClick={handleClearFilters}
          className='text-purple-600 hover:text-purple-700'>
          Clear All
        </Button>
      </div>

      <Separator />

      {/* Categories */}
      <div className='space-y-3'>
        <h4 className='font-medium text-gray-900'>Categories</h4>
        <div className='space-y-2'>
          {availableCategories.map((category) => (
            <div key={category.id} className='flex items-center space-x-2'>
              <Checkbox
                id={`cat-${category.id}`}
                checked={filters.categories?.includes(category.id)}
                onCheckedChange={() => toggleCategoryFilter(category.id)}
              />
              <Label
                htmlFor={`cat-${category.id}`}
                className='flex-1 cursor-pointer text-sm font-normal'>
                {category.name}
                <span className='ml-2 text-gray-500'>({category.count})</span>
              </Label>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Price Range */}
      <div className='space-y-3'>
        <h4 className='font-medium text-gray-900'>Price Range</h4>
        <div className='px-2'>
          <Slider
            min={priceRangeLimits[0]}
            max={priceRangeLimits[1]}
            step={10}
            value={filters.priceRange || priceRangeLimits}
            onValueChange={(value) =>
              handleFilterUpdate({ priceRange: value as [number, number] })
            }
            className='mb-2'
          />
          <div className='flex items-center justify-between text-sm text-gray-600'>
            <span>EGP {filters.priceRange?.[0] || priceRangeLimits[0]}</span>
            <span>EGP {filters.priceRange?.[1] || priceRangeLimits[1]}</span>
          </div>
        </div>
      </div>

      <Separator />

      {/* Brands */}
      <div className='space-y-3'>
        <h4 className='font-medium text-gray-900'>Brands</h4>
        <div className='space-y-2'>
          {availableBrands.map((brand) => (
            <div key={brand.id} className='flex items-center space-x-2'>
              <Checkbox
                id={`brand-${brand.id}`}
                checked={filters.brands?.includes(brand.id)}
                onCheckedChange={() => toggleBrandFilter(brand.id)}
              />
              <Label
                htmlFor={`brand-${brand.id}`}
                className='flex-1 cursor-pointer text-sm font-normal'>
                {brand.name}
                <span className='ml-2 text-gray-500'>({brand.count})</span>
              </Label>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Rating */}
      <div className='space-y-3'>
        <h4 className='font-medium text-gray-900'>Rating</h4>
        <div className='space-y-2'>
          {[4, 3, 2, 1].map((rating) => (
            <button
              key={rating}
              type='button'
              onClick={() => handleFilterUpdate({ rating })}
              className={`flex items-center gap-2 w-full text-left px-2 py-1 rounded hover:bg-gray-100 ${
                filters.rating === rating ? "bg-purple-50" : ""
              }`}>
              <div className='flex'>{renderStars(rating)}</div>
              <span className='text-sm text-gray-600'>& up</span>
            </button>
          ))}
        </div>
      </div>

      <Separator />

      {/* Availability */}
      <div className='flex items-center space-x-2'>
        <Checkbox
          id='in-stock'
          checked={filters.inStock}
          onCheckedChange={(checked) =>
            handleFilterUpdate({ inStock: checked as boolean })
          }
        />
        <Label htmlFor='in-stock' className='cursor-pointer font-normal'>
          In Stock Only
        </Label>
      </div>
    </div>
  );

  return (
    <div className={`category-page-grid-with-filters ${className}`}>
      {/* Banner */}
      {showBanner && bannerContent && (
        <section
          className='relative bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-12 sm:py-16'
          style={
            bannerContent.imageUrl
              ? {
                  backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)), url(${bannerContent.imageUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }>
          <div className='container mx-auto px-4 sm:px-6 lg:px-8'>
            <h1 className='text-3xl sm:text-4xl lg:text-5xl font-bold mb-3'>
              {bannerContent.title || displayTitle}
            </h1>
            {bannerContent.description && (
              <p className='text-lg sm:text-xl text-purple-100 max-w-2xl'>
                {bannerContent.description}
              </p>
            )}
          </div>
        </section>
      )}

      {/* Main Content */}
      <section className='py-8 sm:py-12 bg-gray-50'>
        <div className='container mx-auto px-4 sm:px-6 lg:px-8'>
          {/* Header */}
          <div className='mb-6 sm:mb-8'>
            {!showBanner && (
              <h1 className='text-3xl sm:text-4xl font-bold text-gray-900 mb-2'>
                {displayTitle}
              </h1>
            )}
            {!showBanner && displayDescription && (
              <p className='text-gray-600 mb-4'>{displayDescription}</p>
            )}
            <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
              <p className='text-sm text-gray-600'>
                Showing {startIndex + 1}-{Math.min(endIndex, totalCount)} of{" "}
                {totalCount} products
              </p>
              <div className='flex items-center gap-3'>
                {/* Mobile Filter Button */}
                <Sheet
                  open={isFilterDrawerOpen}
                  onOpenChange={setIsFilterDrawerOpen}>
                  <SheetTrigger asChild>
                    <Button variant='outline' className='lg:hidden' size='sm'>
                      <Filter className='w-4 h-4 mr-2' />
                      Filters
                    </Button>
                  </SheetTrigger>
                  <SheetContent side='left' className='w-80 overflow-y-auto'>
                    <SheetHeader>
                      <SheetTitle>Filters</SheetTitle>
                    </SheetHeader>
                    <div className='mt-6'>
                      <FilterContent />
                    </div>
                  </SheetContent>
                </Sheet>

                {/* Sort */}
                <Select value={sortBy} onValueChange={handleSortChange}>
                  <SelectTrigger className='w-48'>
                    <SelectValue placeholder='Sort by' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='featured'>Featured</SelectItem>
                    <SelectItem value='price-asc'>
                      Price: Low to High
                    </SelectItem>
                    <SelectItem value='price-desc'>
                      Price: High to Low
                    </SelectItem>
                    <SelectItem value='newest'>Newest</SelectItem>
                    <SelectItem value='rating'>Highest Rated</SelectItem>
                  </SelectContent>
                </Select>

                {/* View Mode Toggle */}
                <div className='hidden sm:flex items-center gap-1 border rounded-md'>
                  <Button
                    variant={viewMode === "grid" ? "secondary" : "ghost"}
                    size='sm'
                    className='rounded-r-none'
                    onClick={() => setViewMode("grid")}>
                    <Grid3x3 className='w-4 h-4' />
                  </Button>
                  <Button
                    variant={viewMode === "list" ? "secondary" : "ghost"}
                    size='sm'
                    className='rounded-l-none'
                    onClick={() => setViewMode("list")}>
                    <List className='w-4 h-4' />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Layout: Sidebar + Grid */}
          <div className='grid grid-cols-1 lg:grid-cols-4 gap-8'>
            {/* Sidebar Filters (Desktop) */}
            <aside className='hidden lg:block lg:col-span-1'>
              <div className='sticky top-24'>
                <Card>
                  <CardContent className='p-6'>
                    <FilterContent />
                  </CardContent>
                </Card>
              </div>
            </aside>

            {/* Product Grid */}
            <div className='lg:col-span-3'>
              {displayedProducts.length === 0 ? (
                <Card className='p-12 text-center'>
                  <SlidersHorizontal className='w-12 h-12 text-gray-400 mx-auto mb-4' />
                  <h3 className='text-xl font-semibold text-gray-900 mb-2'>
                    No products found
                  </h3>
                  <p className='text-gray-600 mb-4'>
                    Try adjusting your filters to see more results
                  </p>
                  <Button onClick={handleClearFilters}>Clear Filters</Button>
                </Card>
              ) : (
                <>
                  {/* Grid View */}
                  {viewMode === "grid" && (
                    <div className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6'>
                      {displayedProducts.map((product) => (
                        <ProductCard key={product.id} product={product} />
                      ))}
                    </div>
                  )}

                  {/* List View */}
                  {viewMode === "list" && (
                    <div className='space-y-4'>
                      {displayedProducts.map((product) => (
                        <Card key={product.id}>
                          <CardContent className='p-4'>
                            <div className='flex gap-4'>
                              <img
                                src={product.imageUrl}
                                alt={product.name}
                                className='w-32 h-32 object-cover rounded'
                              />
                              <div className='flex-1'>
                                <h3 className='font-semibold text-lg mb-2'>
                                  {product.name}
                                </h3>
                                <div className='flex items-center gap-2 mb-2'>
                                  <span className='text-2xl font-bold text-purple-600'>
                                    EGP {product.price}
                                  </span>
                                  {product.discountPrice && (
                                    <span className='text-gray-400 line-through'>
                                      EGP {product.discountPrice}
                                    </span>
                                  )}
                                </div>
                                <p className='text-sm text-gray-600 mb-3'>
                                  {product.brand && `Brand: ${product.brand}`}
                                </p>
                                <Button>Add to Cart</Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className='mt-8 flex items-center justify-center gap-2'>
                      <Button
                        variant='outline'
                        size='sm'
                        disabled={currentPage === 1}
                        onClick={() => handlePageChange(currentPage - 1)}>
                        <ChevronLeft className='w-4 h-4 mr-1' />
                        Previous
                      </Button>

                      <div className='flex items-center gap-1'>
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter(
                            (page) =>
                              page === 1 ||
                              page === totalPages ||
                              Math.abs(page - currentPage) <= 1,
                          )
                          .map((page, index, array) => (
                            <React.Fragment key={page}>
                              {index > 0 && array[index - 1] !== page - 1 && (
                                <span className='px-2 text-gray-400'>...</span>
                              )}
                              <Button
                                variant={
                                  page === currentPage ? "primary" : "outline"
                                }
                                size='sm'
                                onClick={() => handlePageChange(page)}
                                className={
                                  page === currentPage
                                    ? "bg-purple-600 hover:bg-purple-700"
                                    : ""
                                }>
                                {page}
                              </Button>
                            </React.Fragment>
                          ))}
                      </div>

                      <Button
                        variant='outline'
                        size='sm'
                        disabled={currentPage === totalPages}
                        onClick={() => handlePageChange(currentPage + 1)}>
                        Next
                        <ChevronRight className='w-4 h-4 ml-1' />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* SEO Text */}
      {showSeoText && seoText && (
        <section className='bg-white py-8 sm:py-12'>
          <div className='container mx-auto px-4 sm:px-6 lg:px-8'>
            <div className='max-w-4xl mx-auto'>
              <p className='text-gray-600 leading-relaxed'>{seoText}</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// Display name for debugging
CategoryPageGridWithFilters.displayName = "CategoryPageGridWithFilters";
