import React, { useState } from "react";
import { Button } from "#root/components/ui/button";
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
  ChevronLeft,
  ChevronRight,
  Loader2,
  ArrowUpDown,
} from "lucide-react";

/**
 * Product interface for search results (reused from Grid)
 */
export interface SearchResultProduct {
  id: string;
  name: string;
  price: number;
  discountPrice?: number | null;
  stock?: number;
  imageUrl?: string;
  categoryName?: string;
  available: boolean;
}

/**
 * Props for SearchResultsMinimal
 */
export interface SearchResultsMinimalProps {
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
  className?: string;
}

/**
 * Search Results Minimal Template
 *
 * Clean, typography-first search results layout featuring:
 * - Full-width results with minimal UI chrome
 * - Focus on product content and imagery
 * - Elegant search header with subtle branding
 * - No heavy borders or visual noise
 * - Refined pagination
 *
 * Best for: Premium brands, minimalist aesthetics, content-first approach
 */
export function SearchResultsMinimal({
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
  className = "",
}: SearchResultsMinimalProps) {
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
    <div
      className={`search-results-minimal bg-white min-h-screen ${className}`}>
      <div className='container mx-auto max-w-7xl'>
        {/* Minimal Header */}
        <div className='py-12 md:py-16 border-b'>
          <div className='px-4'>
            {/* Search Title */}
            <div className='text-center mb-8'>
              <h1 className='text-5xl lg:text-7xl font-light text-stone-900 leading-[1.05] tracking-tight mb-4'>
                Search Results
              </h1>
              {searchQuery && (
                <p className='text-base lg:text-lg text-stone-600 font-light leading-relaxed'>
                  {resultCount} {resultCount === 1 ? "item" : "items"} found for{" "}
                  <span className='italic'>"{searchQuery}"</span>
                </p>
              )}
            </div>

            {/* Search Bar */}
            <div className='max-w-2xl mx-auto relative'>
              <Search className='absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400' />
              <Input
                type='text'
                placeholder='Refine your search...'
                value={localSearchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyPress={handleKeyPress}
                className='pl-12 pr-4 h-12 text-base border-gray-200 focus:border-gray-900 rounded-none'
              />
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className='px-4 py-6 border-b'>
          <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
            <div className='text-sm text-gray-500 font-light'>
              Viewing {Math.min(products.length, resultCount)} of {resultCount}
            </div>

            <div className='flex items-center gap-3'>
              <ArrowUpDown className='h-4 w-4 text-gray-400' />
              <Select value={sortBy} onValueChange={handleSortChange}>
                <SelectTrigger className='w-48 border-gray-200 rounded-none font-light'>
                  <SelectValue placeholder='Sort by' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='relevance'>Most Relevant</SelectItem>
                  <SelectItem value='newest'>Newest First</SelectItem>
                  <SelectItem value='price-asc'>Price: Low to High</SelectItem>
                  <SelectItem value='price-desc'>Price: High to Low</SelectItem>
                  <SelectItem value='name-asc'>Name: A to Z</SelectItem>
                  <SelectItem value='name-desc'>Name: Z to A</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Products */}
        <div className='px-4 py-12'>
          {isLoading ? (
            <div className='flex items-center justify-center py-32'>
              <div className='text-center'>
                <Loader2 className='h-10 w-10 animate-spin text-gray-400 mx-auto mb-4' />
                <p className='text-gray-500 font-light'>Searching...</p>
              </div>
            </div>
          ) : products.length === 0 ? (
            <div className='text-center py-32'>
              <Search className='h-20 w-20 text-gray-200 mx-auto mb-6' />
              <h3 className='text-2xl font-light text-gray-900 mb-3'>
                No Results
              </h3>
              <p className='text-gray-500 mb-8 font-light max-w-md mx-auto'>
                {searchQuery
                  ? `We couldn't find anything matching "${searchQuery}". Try a different search term.`
                  : "Try searching for products using the search bar above."}
              </p>
              <Button
                variant='outline'
                onClick={() => {
                  setLocalSearchTerm("");
                  if (onSearchChange) onSearchChange("");
                }}
                className='rounded-none border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white'>
                Clear Search
              </Button>
            </div>
          ) : (
            <>
              {/* Product Grid */}
              <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 mb-16'>
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

              {/* Minimal Pagination */}
              {totalPages > 1 && (
                <div className='border-t pt-12'>
                  <div className='flex items-center justify-center gap-6'>
                    <Button
                      variant='ghost'
                      disabled={currentPage === 1}
                      onClick={() => onPageChange?.(currentPage - 1)}
                      className='rounded-none text-sm font-light disabled:opacity-30'>
                      <ChevronLeft className='h-4 w-4 mr-1' />
                      Previous
                    </Button>

                    <div className='flex items-center gap-2'>
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
                              <span className='px-1 text-gray-300'>•••</span>
                            )}
                            <Button
                              variant='ghost'
                              size='sm'
                              onClick={() => onPageChange?.(page)}
                              className={`min-w-[40px] rounded-none font-light ${
                                currentPage === page
                                  ? "bg-gray-900 text-white hover:bg-gray-800 hover:text-white"
                                  : "text-gray-600 hover:text-gray-900"
                              }`}>
                              {page}
                            </Button>
                          </React.Fragment>
                        ))}
                    </div>

                    <Button
                      variant='ghost'
                      disabled={currentPage === totalPages}
                      onClick={() => onPageChange?.(currentPage + 1)}
                      className='rounded-none text-sm font-light disabled:opacity-30'>
                      Next
                      <ChevronRight className='h-4 w-4 ml-1' />
                    </Button>
                  </div>

                  <div className='text-center mt-6'>
                    <p className='text-sm text-gray-500 font-light'>
                      Page {currentPage} of {totalPages}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

SearchResultsMinimal.displayName = "SearchResultsMinimal";
