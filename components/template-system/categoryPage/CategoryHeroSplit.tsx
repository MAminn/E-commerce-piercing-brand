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
import {
  ChevronLeft,
  ChevronRight,
  Star,
  SlidersHorizontal,
} from "lucide-react";
import type { CategoryContent } from "#root/shared/types/category-content";
import type {
  CategoryPageProduct,
  CategoryFilters,
  SortOption,
} from "./CategoryGridClassic";

/**
 * Props for CategoryHeroSplit
 */
export interface CategoryHeroSplitProps {
  content?: CategoryContent;
  products?: CategoryPageProduct[];
  totalProducts?: number;
  currentPage?: number;
  productsPerPage?: number;
  availableCategories?: Array<{ id: string; name: string; count: number }>;
  availableBrands?: Array<{ id: string; name: string; count: number }>;
  priceRangeLimits?: [number, number];
  onSortChange?: (sort: SortOption) => void;
  onFilterChange?: (filters: CategoryFilters) => void;
  onClearFilters?: () => void;
  onPageChange?: (page: number) => void;
  className?: string;
}

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
 * Category Hero Split Template
 *
 * A modern e-commerce category page featuring:
 * - Large split hero section (image left, content right)
 * - Filters below hero for easy access
 * - Modern, spacious product grid
 * - Premium visual branding
 *
 * Design Philosophy:
 * - Emphasizes visual storytelling
 * - Perfect for lifestyle/fashion categories
 * - Strong brand presence
 */
export function CategoryHeroSplit({
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
}: CategoryHeroSplitProps) {
  const [sortBy, setSortBy] = useState<SortOption>("featured");
  const [filters, setFilters] = useState<CategoryFilters>({
    categories: [],
    priceRange: priceRangeLimits,
    brands: [],
    rating: undefined,
    inStock: false,
  });
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);

  const totalCount = totalProducts || products.length;
  const totalPages = Math.ceil(totalCount / productsPerPage);
  const startIndex = (currentPage - 1) * productsPerPage;
  const endIndex = startIndex + productsPerPage;
  const displayedProducts = products.slice(startIndex, endIndex);

  const handleSortChange = (value: string) => {
    const newSort = value as SortOption;
    setSortBy(newSort);
    onSortChange?.(newSort);
  };

  const handleFilterUpdate = (newFilters: Partial<CategoryFilters>) => {
    const updatedFilters = { ...filters, ...newFilters };
    setFilters(updatedFilters);
    onFilterChange?.(updatedFilters);
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
    onClearFilters?.();
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

  const activeFilterCount =
    (filters.categories?.length || 0) +
    (filters.brands?.length || 0) +
    (filters.rating ? 1 : 0) +
    (filters.inStock ? 1 : 0);

  const FilterContent = () => (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <h3 className='text-lg font-semibold text-gray-900'>Filters</h3>
        {activeFilterCount > 0 && (
          <Button
            variant='ghost'
            size='sm'
            onClick={handleClearFilters}
            className='text-sm text-gray-600 hover:text-gray-900'>
            Clear ({activeFilterCount})
          </Button>
        )}
      </div>

      <Separator />

      <div className='space-y-3'>
        <h4 className='font-medium text-gray-900'>Categories</h4>
        <div className='space-y-2.5'>
          {availableCategories.map((category) => (
            <div key={category.id} className='flex items-center space-x-2.5'>
              <Checkbox
                id={`cat-${category.id}`}
                checked={filters.categories?.includes(category.id)}
                onCheckedChange={() => toggleCategoryFilter(category.id)}
              />
              <Label
                htmlFor={`cat-${category.id}`}
                className='flex-1 text-sm font-normal text-gray-700 cursor-pointer'>
                {category.name} ({category.count})
              </Label>
            </div>
          ))}
        </div>
      </div>

      <Separator />

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
          />
          <div className='flex items-center justify-between mt-3 text-sm text-gray-700'>
            <span>EGP {filters.priceRange?.[0] || priceRangeLimits[0]}</span>
            <span>EGP {filters.priceRange?.[1] || priceRangeLimits[1]}</span>
          </div>
        </div>
      </div>

      <Separator />

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
                className='flex-1 text-sm font-normal text-gray-700 cursor-pointer'>
                {brand.name} ({brand.count})
              </Label>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      <div className='space-y-3'>
        <h4 className='font-medium text-gray-900'>Rating</h4>
        <div className='space-y-2'>
          {[4, 3, 2].map((rating) => (
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
          className='text-sm font-normal text-gray-700 cursor-pointer'>
          In Stock Only
        </Label>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen bg-white ${className}`}>
      {/* Hero Split Section */}
      <div className='relative bg-gray-900 overflow-hidden'>
        <div className='max-w-7xl mx-auto'>
          <div className='grid lg:grid-cols-2 gap-0'>
            {/* Image Side */}
            <div className='relative h-96 lg:h-[500px]'>
              {content?.hero.enabled && content.hero.imageUrl ? (
                <img
                  src={content.hero.imageUrl}
                  alt={content.title}
                  className='w-full h-full object-cover'
                />
              ) : (
                <div className='w-full h-full bg-gradient-to-br from-gray-700 to-gray-900' />
              )}
            </div>

            {/* Content Side */}
            <div className='flex items-center px-8 lg:px-16 py-12 lg:py-16 bg-gray-900 text-white'>
              <div className='max-w-xl'>
                <h1 className='text-4xl lg:text-5xl font-bold mb-6 leading-tight'>
                  {content?.title || "Products"}
                </h1>
                {content?.description.enabled && content.description.text && (
                  <p className='text-lg text-gray-300 leading-relaxed mb-8'>
                    {content.description.text}
                  </p>
                )}
                <div className='flex items-center gap-4 text-sm text-gray-400'>
                  <span>{totalCount} Products</span>
                  <span>•</span>
                  <span>Free Shipping</span>
                  <span>•</span>
                  <span>Easy Returns</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12'>
        {/* Filters & Sort Bar */}
        <div className='mb-8'>
          <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6'>
            <div className='flex items-center gap-4'>
              <Sheet
                open={isFilterDrawerOpen}
                onOpenChange={setIsFilterDrawerOpen}>
                <SheetTrigger asChild>
                  <Button variant='outline'>
                    <SlidersHorizontal className='w-4 h-4 mr-2' />
                    Filters
                    {activeFilterCount > 0 && (
                      <Badge variant='secondary' className='ml-2 h-5 px-1.5'>
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

              <span className='text-sm text-gray-600'>
                {startIndex + 1}–{Math.min(endIndex, totalCount)} of{" "}
                {totalCount}
              </span>
            </div>

            <Select value={sortBy} onValueChange={handleSortChange}>
              <SelectTrigger className='w-48'>
                <SelectValue placeholder='Sort by' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='featured'>Featured</SelectItem>
                <SelectItem value='newest'>Newest</SelectItem>
                <SelectItem value='price-asc'>Price: Low to High</SelectItem>
                <SelectItem value='price-desc'>Price: High to Low</SelectItem>
                <SelectItem value='rating'>Top Rated</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Active Filters Display */}
          {activeFilterCount > 0 && (
            <div className='flex items-center gap-2 flex-wrap'>
              <span className='text-sm text-gray-600'>Active filters:</span>
              {filters.categories?.map((catId) => {
                const cat = availableCategories.find((c) => c.id === catId);
                return cat ? (
                  <Badge key={catId} variant='secondary'>
                    {cat.name}
                  </Badge>
                ) : null;
              })}
              {filters.brands?.map((brandId) => {
                const brand = availableBrands.find((b) => b.id === brandId);
                return brand ? (
                  <Badge key={brandId} variant='secondary'>
                    {brand.name}
                  </Badge>
                ) : null;
              })}
            </div>
          )}
        </div>

        {/* Product Grid */}
        {displayedProducts.length > 0 ? (
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12'>
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
              <p className='text-lg text-gray-600'>No products found.</p>
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
          <div className='flex items-center justify-center gap-2'>
            <Button
              variant='outline'
              size='icon'
              onClick={() => onPageChange?.(currentPage - 1)}
              disabled={currentPage === 1}>
              <ChevronLeft className='w-4 h-4' />
            </Button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
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
                    onClick={() => onPageChange?.(page)}>
                    {page}
                  </Button>
                );
              }
              if (page === currentPage - 2 || page === currentPage + 2) {
                return (
                  <span key={page} className='px-2 text-gray-500'>
                    ...
                  </span>
                );
              }
              return null;
            })}

            <Button
              variant='outline'
              size='icon'
              onClick={() => onPageChange?.(currentPage + 1)}
              disabled={currentPage === totalPages}>
              <ChevronRight className='w-4 h-4' />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
