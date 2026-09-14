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
import {
  MinimalProductCard,
  type MinimalProduct,
} from "#root/components/template-system/minimal/MinimalProductCard";
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
  sortBy = "newest",
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
      className={`search-results-minimal min-h-screen bg-zeli-bg ${className}`}>
      <div className='zeli-container'>
        {/* Header. The title used to be set at text-7xl — a display size that
            overflowed at 375px and shouted louder than any product on the
            page. It is a search result header, not the brand statement. */}
        <div className='border-b border-zeli-line py-10 md:py-14'>
          <div className='text-center'>
            <h1 className='zeli-section-title'>Search results</h1>
            {searchQuery && (
              <p
                aria-live='polite'
                className='mt-2 text-[length:var(--zeli-text-body)] text-zeli-ink-muted'>
                {resultCount} {resultCount === 1 ? "result" : "results"} for{" "}
                <span className='text-zeli-ink'>"{searchQuery}"</span>
              </p>
            )}
          </div>

          {/* Search Bar */}
          <div className='relative mx-auto mt-8 max-w-xl'>
            <label htmlFor='search-results-refine' className='sr-only'>
              Refine your search
            </label>
            <Search
              aria-hidden
              className='pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zeli-ink-subtle'
            />
            <Input
              id='search-results-refine'
              type='search'
              placeholder='Refine your search…'
              value={localSearchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={handleKeyPress}
              className='h-12 rounded-none border-zeli-line-strong bg-zeli-surface-raised pe-4 ps-12 text-[length:var(--zeli-text-body)] focus:border-zeli-ink'
            />
          </div>
        </div>

        {/* Toolbar */}
        <div className='border-b border-zeli-line py-5'>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4'>
            <div className='zeli-eyebrow'>
              Viewing {Math.min(products.length, resultCount)} of {resultCount}
            </div>

            <div className='flex min-w-0 items-center gap-3'>
              <ArrowUpDown aria-hidden className='h-4 w-4 shrink-0 text-zeli-ink-subtle' />
              {/* Only the three orderings the products.search API accepts.
                  "Most Relevant", "Name: A to Z" and "Name: Z to A" were also
                  offered here; product.search validates sortBy against
                  z.enum(["newest","price-asc","price-desc"]), so picking one
                  of those three sent a request the server rejected and the
                  shopper was left looking at the previous results with no
                  error. */}
              <Select value={sortBy} onValueChange={handleSortChange}>
                <SelectTrigger
                  aria-label='Sort results'
                  className='min-h-11 w-48 rounded-none border-zeli-line-strong bg-zeli-surface-raised'>
                  <SelectValue placeholder='Sort by' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='newest'>New Arrivals</SelectItem>
                  <SelectItem value='price-asc'>Price: Low to High</SelectItem>
                  <SelectItem value='price-desc'>Price: High to Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Products */}
        <div className='py-10 sm:py-12'>
          {isLoading ? (
            <div className='flex items-center justify-center py-24'>
              <div className='text-center'>
                <Loader2
                  aria-hidden
                  className='mx-auto mb-4 h-8 w-8 animate-spin text-zeli-ink-subtle'
                />
                <p role='status' className='text-[length:var(--zeli-text-body)] text-zeli-ink-muted'>
                  Searching…
                </p>
              </div>
            </div>
          ) : products.length === 0 ? (
            <div className='py-24 text-center'>
              <Search aria-hidden className='mx-auto mb-6 h-12 w-12 text-zeli-ink-subtle' />
              <h2 className='zeli-section-title'>No results</h2>
              <p className='mx-auto mt-2 max-w-md text-[length:var(--zeli-text-body)] text-zeli-ink-muted'>
                {searchQuery
                  ? `Nothing matches "${searchQuery}".`
                  : "Enter a search term above to look through the store."}
              </p>
              {searchQuery && (
                <Button
                  variant='outline'
                  onClick={() => {
                    setLocalSearchTerm("");
                    if (onSearchChange) onSearchChange("");
                  }}
                  className='mt-6 min-h-11 rounded-none border-zeli-ink text-zeli-ink hover:bg-zeli-accent hover:text-zeli-ink-inverse'>
                  Clear search
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Product Grid */}
              {/* Same card as /shop, /categories and the homepage carousels.
                  This used to render components/shop/ProductCard, so a
                  product looked one way in search results and another way
                  everywhere else in the same store. */}
              <div className='mb-16 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4'>
                {products.map((product) => (
                  <MinimalProductCard
                    key={product.id}
                    product={
                      {
                        id: product.id,
                        slug: product.slug ?? null,
                        name: product.name,
                        price: product.price,
                        discountPrice: product.discountPrice ?? null,
                        stock: product.stock ?? 0,
                        imageUrl: product.imageUrl,
                        categoryName: product.categoryName,
                        available: product.available,
                      } satisfies MinimalProduct
                    }
                  />
                ))}
              </div>

              {/* Minimal Pagination */}
              {totalPages > 1 && (
                <nav aria-label='Pagination' className='border-t border-zeli-line pt-12'>
                  <div className='flex items-center justify-center gap-4 sm:gap-6'>
                    <Button
                      variant='ghost'
                      disabled={currentPage === 1}
                      onClick={() => onPageChange?.(currentPage - 1)}
                      className='min-h-11 rounded-none text-zeli-ink-secondary hover:text-zeli-ink disabled:opacity-30'>
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
                              <span aria-hidden className='px-1 text-zeli-ink-subtle'>
                                •••
                              </span>
                            )}
                            <Button
                              variant='ghost'
                              size='sm'
                              aria-current={currentPage === page ? "page" : undefined}
                              onClick={() => onPageChange?.(page)}
                              className={`h-11 min-w-11 rounded-none ${
                                currentPage === page
                                  ? "bg-zeli-accent text-zeli-ink-inverse hover:bg-zeli-accent-hover hover:text-zeli-ink-inverse"
                                  : "text-zeli-ink-secondary hover:text-zeli-ink"
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
                      className='min-h-11 rounded-none text-zeli-ink-secondary hover:text-zeli-ink disabled:opacity-30'>
                      Next
                      <ChevronRight className='h-4 w-4 ml-1' />
                    </Button>
                  </div>

                  <div className='mt-6 text-center'>
                    <p className='zeli-eyebrow'>
                      Page {currentPage} of {totalPages}
                    </p>
                  </div>
                </nav>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

SearchResultsMinimal.displayName = "SearchResultsMinimal";
