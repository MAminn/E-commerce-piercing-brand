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
import {
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  Star,
  SlidersHorizontal,
} from "lucide-react";
import type { CategoryContent } from "#root/shared/types/category-content";

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
 * Props for CategoryGridClassic
 */
export interface CategoryGridClassicProps {
  /**
   * Category content (from CMS)
   */
  content?: CategoryContent;

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

// Mock data for filters
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

/**
 * Category Grid Classic Template
 *
 * A premium, marketplace-ready category page template featuring:
 * - Clean hero section with optional image
 * - Professional sidebar filters (desktop) / drawer (mobile)
 * - Elegant product grid with optimal spacing
 * - Clear typography and visual hierarchy
 * - Responsive design
 *
 * Design Philosophy:
 * - Merchants control CONTENT only, NOT layout
 * - Layout quality is a product guarantee
 * - Professional, clean aesthetic suitable for ThemeForest/CodeCanyon
 */
export function CategoryGridClassic({
  content,
  products = [],
  totalProducts,
  currentPage = 1,
  productsPerPage = 12,
  availableCategories = MOCK_CATEGORIES,
  availableBrands = MOCK_BRANDS,
  priceRangeLimits = [0, 1000],
  onSortChange,
  onFilterChange,
  onClearFilters,
  onPageChange,
  className = "",
}: CategoryGridClassicProps) {
  // State
  const [sortBy, setSortBy] = useState<SortOption>("featured");
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

  // Active filter count
  const activeFilterCount =
    (filters.categories?.length || 0) +
    (filters.brands?.length || 0) +
    (filters.rating ? 1 : 0) +
    (filters.inStock ? 1 : 0);

  // Filter sidebar content
  const FilterContent = () => (
    <div className='space-y-6'>
      {/* Active filters header */}
      <div className='flex items-center justify-between'>
        <h3 className='text-lg font-semibold text-gray-900'>Filters</h3>
        {activeFilterCount > 0 && (
          <Button
            variant='ghost'
            size='sm'
            onClick={handleClearFilters}
            className='text-sm text-gray-600 hover:text-gray-900'>
            Clear all ({activeFilterCount})
          </Button>
        )}
      </div>

      <Separator />

      {/* Categories filter */}
      <div className='space-y-3'>
        <h4 className='font-medium text-gray-900'>Categories</h4>
        <div className='space-y-2.5'>
          {availableCategories.map((category) => (
            <div key={category.id} className='flex items-center space-x-2.5'>
              <Checkbox
                id={`category-${category.id}`}
                checked={filters.categories?.includes(category.id)}
                onCheckedChange={() => toggleCategoryFilter(category.id)}
              />
              <Label
                htmlFor={`category-${category.id}`}
                className='flex-1 text-sm font-normal text-gray-700 cursor-pointer hover:text-gray-900'>
                {category.name}
                <span className='ml-1.5 text-gray-500'>({category.count})</span>
              </Label>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Price range filter */}
      <div className='space-y-4'>
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
            className='w-full'
          />
          <div className='flex items-center justify-between mt-3 text-sm text-gray-700'>
            <span className='font-medium'>
              EGP {filters.priceRange?.[0] || priceRangeLimits[0]}
            </span>
            <span className='font-medium'>
              EGP {filters.priceRange?.[1] || priceRangeLimits[1]}
            </span>
          </div>
        </div>
      </div>

      <Separator />

      {/* Brands filter */}
      <div className='space-y-3'>
        <h4 className='font-medium text-gray-900'>Brands</h4>
        <div className='space-y-2.5'>
          {availableBrands.map((brand) => (
            <div key={brand.id} className='flex items-center space-x-2.5'>
              <Checkbox
                id={`brand-${brand.id}`}
                checked={filters.brands?.includes(brand.id)}
                onCheckedChange={() => toggleBrandFilter(brand.id)}
              />
              <Label
                htmlFor={`brand-${brand.id}`}
                className='flex-1 text-sm font-normal text-gray-700 cursor-pointer hover:text-gray-900'>
                {brand.name}
                <span className='ml-1.5 text-gray-500'>({brand.count})</span>
              </Label>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Rating filter */}
      <div className='space-y-3'>
        <h4 className='font-medium text-gray-900'>Customer Rating</h4>
        <div className='space-y-2.5'>
          {[4, 3, 2, 1].map((rating) => (
            <div
              key={rating}
              onClick={() => handleFilterUpdate({ rating })}
              className={`flex items-center space-x-2 p-2 rounded-md cursor-pointer transition-colors ${
                filters.rating === rating ? "bg-gray-100" : "hover:bg-gray-50"
              }`}>
              <div className='flex items-center'>
                {renderStars(rating)}
                <span className='ml-2 text-sm text-gray-700'>& up</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Availability filter */}
      <div className='space-y-3'>
        <h4 className='font-medium text-gray-900'>Availability</h4>
        <div className='flex items-center space-x-2.5'>
          <Checkbox
            id='in-stock'
            checked={filters.inStock}
            onCheckedChange={(checked) =>
              handleFilterUpdate({ inStock: checked as boolean })
            }
          />
          <Label
            htmlFor='in-stock'
            className='text-sm font-normal text-gray-700 cursor-pointer hover:text-gray-900'>
            In Stock Only
          </Label>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen bg-gray-50 ${className}`}>
      {/* Hero Section */}
      {content?.hero.enabled && content.hero.imageUrl && (
        <div className='relative h-64 md:h-80 bg-gray-200 overflow-hidden'>
          <img
            src={content.hero.imageUrl}
            alt={content.title}
            className='w-full h-full object-cover'
          />
          <div className='absolute inset-0 bg-gradient-to-t from-black/50 to-transparent' />
        </div>
      )}

      {/* Page Header */}
      <div className='bg-white border-b border-gray-200'>
        <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12'>
          <div className='max-w-3xl'>
            <h1 className='text-3xl md:text-4xl font-bold text-gray-900 tracking-tight'>
              {content?.title || "Products"}
            </h1>
            {content?.description.enabled && content.description.text && (
              <p className='mt-4 text-lg text-gray-600 leading-relaxed'>
                {content.description.text}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12'>
        <div className='flex flex-col lg:flex-row gap-8'>
          {/* Desktop Sidebar Filters */}
          <aside className='hidden lg:block w-64 flex-shrink-0'>
            <div className='sticky top-8 bg-white rounded-lg border border-gray-200 p-6 shadow-sm'>
              <FilterContent />
            </div>
          </aside>

          {/* Main Product Area */}
          <div className='flex-1 min-w-0'>
            {/* Toolbar */}
            <div className='bg-white rounded-lg border border-gray-200 p-4 mb-6 shadow-sm'>
              <div className='flex items-center justify-between gap-4'>
                {/* Results count */}
                <div className='text-sm text-gray-600'>
                  Showing{" "}
                  <span className='font-medium text-gray-900'>
                    {startIndex + 1}–{Math.min(endIndex, totalCount)}
                  </span>{" "}
                  of{" "}
                  <span className='font-medium text-gray-900'>
                    {totalCount}
                  </span>{" "}
                  products
                </div>

                <div className='flex items-center gap-3'>
                  {/* Mobile Filter Button */}
                  <Sheet
                    open={isFilterDrawerOpen}
                    onOpenChange={setIsFilterDrawerOpen}>
                    <SheetTrigger asChild>
                      <Button variant='outline' size='sm' className='lg:hidden'>
                        <SlidersHorizontal className='w-4 h-4 mr-2' />
                        Filters
                        {activeFilterCount > 0 && (
                          <Badge
                            variant='secondary'
                            className='ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs'>
                            {activeFilterCount}
                          </Badge>
                        )}
                      </Button>
                    </SheetTrigger>
                    <SheetContent side='left' className='w-80 overflow-y-auto'>
                      <SheetHeader>
                        <SheetTitle>Filter Products</SheetTitle>
                      </SheetHeader>
                      <div className='mt-6'>
                        <FilterContent />
                      </div>
                    </SheetContent>
                  </Sheet>

                  {/* Sort Dropdown */}
                  <Select value={sortBy} onValueChange={handleSortChange}>
                    <SelectTrigger className='w-40'>
                      <SelectValue placeholder='Sort by' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='featured'>Featured</SelectItem>
                      <SelectItem value='newest'>Newest</SelectItem>
                      <SelectItem value='price-asc'>
                        Price: Low to High
                      </SelectItem>
                      <SelectItem value='price-desc'>
                        Price: High to Low
                      </SelectItem>
                      <SelectItem value='rating'>Top Rated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Product Grid */}
            {displayedProducts.length > 0 ? (
              <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6'>
                {displayedProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={{
                      id: product.id,
                      name: product.name,
                      price: product.price,
                      discountPrice: product.discountPrice,
                      imageUrl: product.imageUrl,
                      images: product.images,
                      available: product.available,
                    }}
                  />
                ))}
              </div>
            ) : (
              <Card className='p-12 text-center'>
                <CardContent>
                  <p className='text-lg text-gray-600'>
                    No products found matching your criteria.
                  </p>
                  <Button
                    variant='outline'
                    onClick={handleClearFilters}
                    className='mt-4'>
                    Clear Filters
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className='mt-8 flex items-center justify-center gap-2'>
                <Button
                  variant='outline'
                  size='icon'
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}>
                  <ChevronLeft className='w-4 h-4' />
                </Button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                  (page) => {
                    // Show first, last, current, and adjacent pages
                    if (
                      page === 1 ||
                      page === totalPages ||
                      (page >= currentPage - 1 && page <= currentPage + 1)
                    ) {
                      return (
                        <Button
                          key={page}
                          variant={page === currentPage ? "primary" : "outline"}
                          size='icon'
                          onClick={() => handlePageChange(page)}>
                          {page}
                        </Button>
                      );
                    }
                    // Show ellipsis
                    if (page === currentPage - 2 || page === currentPage + 2) {
                      return (
                        <span key={page} className='px-2 text-gray-500'>
                          ...
                        </span>
                      );
                    }
                    return null;
                  },
                )}

                <Button
                  variant='outline'
                  size='icon'
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}>
                  <ChevronRight className='w-4 h-4' />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
