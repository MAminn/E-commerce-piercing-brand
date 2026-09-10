import React, { useState } from "react";
import { Button } from "#root/components/ui/button";
import { Badge } from "#root/components/ui/badge";
import { Input } from "#root/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#root/components/ui/select";
import { ProductCard } from "#root/components/shop/ProductCard";
import {
  Search,
  Grid3x3,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Filter,
} from "lucide-react";

/**
 * Product interface for search results
 */
export interface SearchResultProduct {
  id: string;
  slug?: string | null;
  name: string;
  price: number;
  discountPrice?: number | null;
  stock?: number;
  imageUrl?: string;
  categoryName?: string;
  available: boolean;
}

/**
 * Props for SearchResultsGrid
 */
export interface SearchResultsGridProps {
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

/**
 * Search Results Grid Template
 *
 * Standard marketplace search results layout featuring:
 * - Search query display with result count
 * - Sidebar filters on desktop, drawer on mobile
 * - Product grid with sort options
 * - Pagination
 * - Clear empty state
 *
 * Best for: General eCommerce stores, multi-vendor platforms
 */
export function SearchResultsGrid({
  searchQuery,
  products = [],
  totalResults,
  isLoading = false,
  searchTerm = "",
  onSearchChange,
  sortBy = "relevance",
  onSortChange,
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  onFilterToggle,
  showFilters = false,
  className = "",
}: SearchResultsGridProps) {
  const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm);

  const handleSearchChange = (value: string) => {
    setLocalSearchTerm(value);
    if (onSearchChange) {
      onSearchChange(value);
    }
  };

  const handleSortChange = (value: string) => {
    if (onSortChange) {
      onSortChange(value);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && onSearchChange) {
      onSearchChange(localSearchTerm);
    }
  };

  const resultCount = totalResults ?? products.length;

  return (
    <div className={`search-results-grid bg-gray-50 min-h-screen ${className}`}>
      <div className='container mx-auto py-6 px-4'>
        {/* Search Header */}
        <div className='bg-white rounded-lg shadow-sm p-6 mb-6'>
          <div className='flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4'>
            <div className='flex-1'>
              <h1 className='text-3xl lg:text-5xl font-light text-stone-900 leading-[1.15] tracking-tight mb-2'>
                Search Results
              </h1>
              {searchQuery && (
                <p className='text-sm text-stone-600 font-light leading-relaxed'>
                  {resultCount} {resultCount === 1 ? "result" : "results"} for{" "}
                  <span className='font-normal italic'>"{searchQuery}"</span>
                </p>
              )}
            </div>

            {/* Search Bar */}
            <div className='relative w-full lg:w-96'>
              <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400' />
              <Input
                type='text'
                placeholder='Search products...'
                value={localSearchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyPress={handleKeyPress}
                className='pl-10 pr-4 w-full'
              />
            </div>
          </div>
        </div>

        <div className='flex flex-col lg:flex-row gap-6'>
          {/* Sidebar Filters */}
          <aside className='w-full lg:w-72 shrink-0'>
            <div className='bg-white rounded-lg shadow-sm p-6 sticky top-6'>
              <div className='flex items-center justify-between mb-4'>
                <h2 className='text-xl lg:text-2xl font-normal text-stone-900 leading-snug'>
                  Filters
                </h2>
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={onFilterToggle}
                  className='lg:hidden'>
                  <Filter className='h-4 w-4' />
                </Button>
              </div>

              {/* Filter Placeholder */}
              <div className='space-y-4 text-sm text-gray-600'>
                <div className='pb-4 border-b'>
                  <p className='font-medium text-gray-700 mb-2'>Categories</p>
                  <p className='text-xs'>Filter options will appear here</p>
                </div>
                <div className='pb-4 border-b'>
                  <p className='font-medium text-gray-700 mb-2'>Price Range</p>
                  <p className='text-xs'>Price filters will appear here</p>
                </div>

                <div>
                  <p className='font-medium text-gray-700 mb-2'>Availability</p>
                  <p className='text-xs'>Stock filters will appear here</p>
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className='flex-1 min-w-0'>
            {/* Toolbar */}
            <div className='bg-white rounded-lg shadow-sm p-4 mb-6'>
              <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
                <div className='flex items-center gap-2 text-sm text-gray-600'>
                  <Grid3x3 className='h-4 w-4' />
                  <span>
                    Showing {products.length} of {resultCount} results
                  </span>
                </div>

                <div className='flex items-center gap-3'>
                  <span className='text-sm text-gray-600 hidden sm:inline'>
                    Sort by:
                  </span>
                  <Select value={sortBy} onValueChange={handleSortChange}>
                    <SelectTrigger className='w-full sm:w-48'>
                      <SelectValue placeholder='Sort by' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='relevance'>Most Relevant</SelectItem>
                      <SelectItem value='newest'>Newest First</SelectItem>
                      <SelectItem value='price-asc'>
                        Price: Low to High
                      </SelectItem>
                      <SelectItem value='price-desc'>
                        Price: High to Low
                      </SelectItem>
                      <SelectItem value='name-asc'>Name: A to Z</SelectItem>
                      <SelectItem value='name-desc'>Name: Z to A</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button
                    variant='outline'
                    size='icon'
                    onClick={onFilterToggle}
                    className='lg:hidden'>
                    <SlidersHorizontal className='h-4 w-4' />
                  </Button>
                </div>
              </div>
            </div>

            {/* Products Grid */}
            {isLoading ? (
              <div className='flex items-center justify-center py-20'>
                <div className='text-center'>
                  <Loader2 className='h-12 w-12 animate-spin text-blue-600 mx-auto mb-4' />
                  <p className='text-gray-600'>Searching products...</p>
                </div>
              </div>
            ) : products.length === 0 ? (
              <div className='bg-white rounded-lg shadow-sm p-12 text-center'>
                <Search className='h-16 w-16 text-gray-300 mx-auto mb-4' />
                <h3 className='text-xl font-semibold text-gray-900 mb-2'>
                  No results found
                </h3>
                <p className='text-gray-600 mb-6'>
                  {searchQuery
                    ? `We couldn't find any products matching "${searchQuery}"`
                    : "Try adjusting your search or filters"}
                </p>
                <Button
                  variant='outline'
                  onClick={() => {
                    setLocalSearchTerm("");
                    if (onSearchChange) onSearchChange("");
                  }}>
                  Clear Search
                </Button>
              </div>
            ) : (
              <>
                <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6'>
                  {products.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={{
                        id: product.id,
                        name: product.name,
                        price: product.price,
                        discountPrice: product.discountPrice ?? undefined,
                        imageUrl: product.imageUrl,
                        categoryName: product.categoryName,
                        available: product.available,
                      }}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className='flex items-center justify-center gap-2 mt-8'>
                    <Button
                      variant='outline'
                      size='icon'
                      disabled={currentPage === 1}
                      onClick={() => onPageChange?.(currentPage - 1)}>
                      <ChevronLeft className='h-4 w-4' />
                    </Button>

                    <div className='flex items-center gap-1'>
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter((page) => {
                          // Show first, last, current, and adjacent pages
                          return (
                            page === 1 ||
                            page === totalPages ||
                            (page >= currentPage - 1 && page <= currentPage + 1)
                          );
                        })
                        .map((page, idx, arr) => (
                          <React.Fragment key={page}>
                            {idx > 0 && arr[idx - 1] !== page - 1 && (
                              <span className='px-2 text-gray-400'>...</span>
                            )}
                            <Button
                              variant={
                                currentPage === page ? "primary" : "outline"
                              }
                              size='sm'
                              onClick={() => onPageChange?.(page)}
                              className='min-w-[40px]'>
                              {page}
                            </Button>
                          </React.Fragment>
                        ))}
                    </div>

                    <Button
                      variant='outline'
                      size='icon'
                      disabled={currentPage === totalPages}
                      onClick={() => onPageChange?.(currentPage + 1)}>
                      <ChevronRight className='h-4 w-4' />
                    </Button>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

SearchResultsGrid.displayName = "SearchResultsGrid";
