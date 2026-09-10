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
import { ProductCard } from "#root/components/shop/ProductCard";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import type { CategoryContent } from "#root/shared/types/category-content";
import type {
  CategoryPageProduct,
  CategoryFilters,
  SortOption,
} from "./CategoryGridClassic";

/**
 * Props for CategoryMinimal
 */
export interface CategoryMinimalProps {
  content?: CategoryContent;
  products?: CategoryPageProduct[];
  totalProducts?: number;
  currentPage?: number;
  productsPerPage?: number;
  onSortChange?: (sort: SortOption) => void;
  onFilterChange?: (filters: CategoryFilters) => void;
  onPageChange?: (page: number) => void;
  className?: string;
}

/**
 * Category Minimal Template
 *
 * A premium minimalist category page featuring:
 * - No heavy hero imagery
 * - Typography-first approach
 * - Clean, spacious product grid
 * - Focus on speed and product discovery
 * - Elegant simplicity
 *
 * Design Philosophy:
 * - Less is more
 * - Perfect for professional/luxury brands
 * - Fast loading, distraction-free
 * - Timeless aesthetic
 */
export function CategoryMinimal({
  content,
  products = [],
  totalProducts,
  currentPage = 1,
  productsPerPage = 16,
  onSortChange,
  onFilterChange,
  onPageChange,
  className = "",
}: CategoryMinimalProps) {
  const [sortBy, setSortBy] = useState<SortOption>("featured");
  const [showFilters, setShowFilters] = useState(false);

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

  return (
    <div className={`min-h-screen bg-white ${className}`}>
      {/* Minimal Header */}
      <div className='border-b border-gray-100'>
        <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24'>
          <div className='max-w-2xl'>
            <h1 className='text-5xl md:text-6xl font-light text-gray-900 tracking-tight mb-6'>
              {content?.title || "Products"}
            </h1>
            {content?.description.enabled && content.description.text && (
              <p className='text-xl text-gray-600 font-light leading-relaxed'>
                {content.description.text}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Minimal Toolbar */}
      <div className='border-b border-gray-100 sticky top-0 bg-white/95 backdrop-blur-sm z-10'>
        <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4'>
          <div className='flex items-center justify-between'>
            <div className='text-sm text-gray-500 font-light'>
              {totalCount} {totalCount === 1 ? "item" : "items"}
            </div>

            <div className='flex items-center gap-6'>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className='text-sm text-gray-900 hover:text-gray-600 transition-colors font-light flex items-center gap-2'>
                Filter
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${
                    showFilters ? "rotate-180" : ""
                  }`}
                />
              </button>

              <Select value={sortBy} onValueChange={handleSortChange}>
                <SelectTrigger className='border-0 border-b border-gray-300 rounded-none w-40 h-8 focus:ring-0 font-light'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='featured'>Featured</SelectItem>
                  <SelectItem value='newest'>Newest</SelectItem>
                  <SelectItem value='price-asc'>Price: Low</SelectItem>
                  <SelectItem value='price-desc'>Price: High</SelectItem>
                  <SelectItem value='rating'>Top Rated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Collapsible Filter Bar */}
          {showFilters && (
            <div className='mt-4 pt-4 border-t border-gray-100'>
              <div className='text-sm text-gray-500 font-light'>
                Filter options will be displayed here
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Product Grid */}
      <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16'>
        {displayedProducts.length > 0 ? (
          <>
            <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-12 md:gap-y-16'>
              {displayedProducts.map((product) => (
                <div key={product.id} className='group'>
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

            {/* Minimal Pagination */}
            {totalPages > 1 && (
              <div className='mt-16 flex items-center justify-center gap-1'>
                <Button
                  variant='ghost'
                  size='icon'
                  onClick={() => onPageChange?.(currentPage - 1)}
                  disabled={currentPage === 1}
                  className='w-10 h-10 rounded-full'>
                  <ChevronLeft className='w-4 h-4' />
                </Button>

                <div className='flex items-center gap-1 mx-4'>
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
                            variant='ghost'
                            size='icon'
                            onClick={() => onPageChange?.(page)}
                            className={`w-10 h-10 rounded-full font-light ${
                              page === currentPage
                                ? "bg-gray-900 text-white hover:bg-gray-800 hover:text-white"
                                : ""
                            }`}>
                            {page}
                          </Button>
                        );
                      }
                      if (
                        page === currentPage - 2 ||
                        page === currentPage + 2
                      ) {
                        return (
                          <span key={page} className='px-2 text-gray-400'>
                            ···
                          </span>
                        );
                      }
                      return null;
                    }
                  )}
                </div>

                <Button
                  variant='ghost'
                  size='icon'
                  onClick={() => onPageChange?.(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className='w-10 h-10 rounded-full'>
                  <ChevronRight className='w-4 h-4' />
                </Button>
              </div>
            )}

            {/* Page Info */}
            <div className='mt-8 text-center text-sm text-gray-500 font-light'>
              Page {currentPage} of {totalPages}
            </div>
          </>
        ) : (
          <div className='py-24 text-center'>
            <p className='text-xl text-gray-400 font-light'>
              No products found
            </p>
          </div>
        )}
      </div>

      {/* Minimal Footer Spacer */}
      <div className='h-24' />
    </div>
  );
}
