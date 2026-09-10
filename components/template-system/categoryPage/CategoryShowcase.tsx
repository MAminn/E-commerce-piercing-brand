import React, { useState } from "react";
import { Button } from "#root/components/ui/button";
import { Card, CardContent } from "#root/components/ui/card";
import { Badge } from "#root/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#root/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "#root/components/ui/sheet";
import { ProductCard } from "#root/components/shop/ProductCard";
import {
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Star,
  TrendingUp,
} from "lucide-react";
import type { CategoryContent } from "#root/shared/types/category-content";
import type {
  CategoryPageProduct,
  CategoryFilters,
  SortOption,
} from "./CategoryGridClassic";

/**
 * Props for CategoryShowcase
 */
export interface CategoryShowcaseProps {
  content?: CategoryContent;
  products?: CategoryPageProduct[];
  totalProducts?: number;
  currentPage?: number;
  productsPerPage?: number;
  onSortChange?: (sort: SortOption) => void;
  onFilterChange?: (filters: CategoryFilters) => void;
  onClearFilters?: () => void;
  onPageChange?: (page: number) => void;
  className?: string;
}

/**
 * Category Showcase Template
 *
 * A high-impact category page featuring:
 * - Dramatic hero with text overlay
 * - Highlighted featured products row
 * - Strong visual branding
 * - Premium showcase presentation
 *
 * Design Philosophy:
 * - Visual storytelling first
 * - Perfect for flagship/premium collections
 * - Strong brand presence
 * - Editorial-style presentation
 */
export function CategoryShowcase({
  content,
  products = [],
  totalProducts,
  currentPage = 1,
  productsPerPage = 12,
  onSortChange,
  onFilterChange,
  onClearFilters,
  onPageChange,
  className = "",
}: CategoryShowcaseProps) {
  const [sortBy, setSortBy] = useState<SortOption>("featured");
  const [filters, setFilters] = useState<CategoryFilters>({
    categories: [],
    priceRange: [0, 1000],
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

  // Get featured products (first 4 with highest rating or price)
  const featuredProducts = products
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 4);

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
      priceRange: [0, 1000],
      brands: [],
      rating: undefined,
      inStock: false,
    };
    setFilters(clearedFilters);
    onClearFilters?.();
  };

  const activeFilterCount =
    (filters.categories?.length || 0) +
    (filters.brands?.length || 0) +
    (filters.rating ? 1 : 0) +
    (filters.inStock ? 1 : 0);

  return (
    <div className={`min-h-screen bg-gray-50 ${className}`}>
      {/* Hero with Overlay */}
      <div className='relative h-[500px] md:h-[600px] bg-gray-900 overflow-hidden'>
        {content?.hero.enabled && content.hero.imageUrl ? (
          <>
            <img
              src={content.hero.imageUrl}
              alt={content.title}
              className='w-full h-full object-cover opacity-60'
            />
            <div className='absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent' />
          </>
        ) : (
          <div className='w-full h-full bg-gradient-to-br from-purple-900 via-gray-900 to-black' />
        )}

        {/* Hero Content Overlay */}
        <div className='absolute inset-0 flex items-center justify-center text-center'>
          <div className='max-w-4xl px-6'>
            <Badge
              variant='secondary'
              className='mb-6 bg-white/10 text-white border-white/20 backdrop-blur-sm'>
              Premium Collection
            </Badge>
            <h1 className='text-5xl md:text-7xl font-bold text-white mb-6 leading-tight'>
              {content?.title || "Discover"}
            </h1>
            {content?.description.enabled && content.description.text && (
              <p className='text-xl md:text-2xl text-white/90 mb-8 leading-relaxed max-w-2xl mx-auto'>
                {content.description.text}
              </p>
            )}
            <div className='flex items-center justify-center gap-4 text-white/80'>
              <div className='flex items-center gap-2'>
                <Star className='w-5 h-5 fill-yellow-400 text-yellow-400' />
                <span>Curated Selection</span>
              </div>
              <span>•</span>
              <div className='flex items-center gap-2'>
                <TrendingUp className='w-5 h-5' />
                <span>{totalCount} Products</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Featured Products Highlight */}
      {featuredProducts.length > 0 && (
        <div className='bg-white border-b border-gray-200'>
          <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12'>
            <div className='flex items-center justify-between mb-8'>
              <div>
                <h2 className='text-2xl font-bold text-gray-900'>
                  Featured Products
                </h2>
                <p className='text-gray-600 mt-1'>
                  Handpicked highlights from this collection
                </p>
              </div>
            </div>
            <div className='grid grid-cols-2 md:grid-cols-4 gap-6'>
              {featuredProducts.map((product) => (
                <div key={product.id} className='relative group'>
                  <div className='absolute -top-2 -right-2 z-10'>
                    <Badge className='bg-yellow-400 text-gray-900 border-0'>
                      Featured
                    </Badge>
                  </div>
                  <ProductCard
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
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Products Section */}
      <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12'>
        {/* Toolbar */}
        <div className='mb-8'>
          <div className='flex items-center justify-between mb-6'>
            <h2 className='text-2xl font-bold text-gray-900'>All Products</h2>

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
                <SheetContent side='left' className='w-80'>
                  <SheetHeader>
                    <SheetTitle>Filter Products</SheetTitle>
                  </SheetHeader>
                  <div className='mt-6'>
                    <p className='text-sm text-gray-500'>Filter options here</p>
                  </div>
                </SheetContent>
              </Sheet>

              <Select value={sortBy} onValueChange={handleSortChange}>
                <SelectTrigger className='w-48'>
                  <SelectValue placeholder='Sort by' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='featured'>Featured</SelectItem>
                  <SelectItem value='newest'>Newest First</SelectItem>
                  <SelectItem value='price-asc'>Price: Low to High</SelectItem>
                  <SelectItem value='price-desc'>Price: High to Low</SelectItem>
                  <SelectItem value='rating'>Top Rated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className='text-sm text-gray-600'>
            Showing {startIndex + 1}–{Math.min(endIndex, totalCount)} of{" "}
            {totalCount} products
          </div>
        </div>

        {/* Product Grid */}
        {displayedProducts.length > 0 ? (
          <>
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-12'>
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

                {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                  (page) => {
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
                  },
                )}

                <Button
                  variant='outline'
                  size='icon'
                  onClick={() => onPageChange?.(currentPage + 1)}
                  disabled={currentPage === totalPages}>
                  <ChevronRight className='w-4 h-4' />
                </Button>
              </div>
            )}
          </>
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
                Clear All Filters
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
