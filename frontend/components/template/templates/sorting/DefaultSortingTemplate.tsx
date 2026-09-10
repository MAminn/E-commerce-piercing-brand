/**
 * @legacy
 * Legacy Template System (v1)
 * - Fully preserved for admin preview
 * - Not used in frontend rendering
 * - Used as a design asset library
 */

import { useEffect, useState, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#root/components/ui/select";
import { Link } from "#root/components/utils/Link";
import { Badge } from "#root/components/ui/badge";
import { useToast } from "#root/components/ui/use-toast";
import { Loader2, FilterX, SlidersHorizontal } from "lucide-react";
import { Button } from "#root/components/ui/button";
import { Checkbox } from "#root/components/ui/checkbox";
import { formatCategoryName } from "#root/lib/utils";
import { ProductCard } from "#root/components/shop/ProductCard";
import type { SortingTemplateData } from "../../templateRegistry";

interface DefaultSortingTemplateProps {
  data?: SortingTemplateData;
  onUpdateData?: (updates: Partial<SortingTemplateData>) => void;
}

const DefaultSortingTemplate: React.FC<DefaultSortingTemplateProps> = ({
  data,
  onUpdateData,
}) => {
  // Use provided data or default values
  const products = data?.products || [];
  const isLoading = data?.isLoading || false;
  const sortCriteria = data?.sortCriteria || "featured";
  const selectedPriceRange = data?.selectedPriceRange || "all";
  const showFilters = data?.showFilters || false;
  const showMobileFilters = data?.showMobileFilters || false;
  const selectedCategories = data?.selectedCategories || [];
  const categories = data?.categories || [];

  // Filter products based on selected categories and price range
  const filteredProducts = useMemo(() => {
    let filtered = [...products];

    // Filter by selected categories if any
    if (selectedCategories.length > 0) {
      filtered = filtered.filter((product) => {
        if (!product.categories) return false;
        return product.categories.some((category) =>
          selectedCategories.includes(category.id)
        );
      });
    }

    // Filter by price range
    if (selectedPriceRange !== "all") {
      const [minStr, maxStr] = selectedPriceRange.split("-");
      const min = Number(minStr);
      const max = Number(maxStr);

      filtered = filtered.filter((product) => {
        const price =
          product.discountPrice !== undefined && product.discountPrice !== null
            ? typeof product.discountPrice === "number"
              ? product.discountPrice
              : Number(product.discountPrice) || 0
            : typeof product.price === "number"
            ? product.price
            : Number(product.price) || 0;

        return price >= min && price <= max;
      });
    }

    // Sort products based on criteria
    switch (sortCriteria) {
      case "name-asc":
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "name-desc":
        filtered.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case "price-asc":
        filtered.sort((a, b) => {
          const priceA =
            a.discountPrice !== undefined && a.discountPrice !== null
              ? typeof a.discountPrice === "number"
                ? a.discountPrice
                : Number(a.discountPrice) || 0
              : typeof a.price === "number"
              ? a.price
              : Number(a.price) || 0;
          const priceB =
            b.discountPrice !== undefined && b.discountPrice !== null
              ? typeof b.discountPrice === "number"
                ? b.discountPrice
                : Number(b.discountPrice) || 0
              : typeof b.price === "number"
              ? b.price
              : Number(b.price) || 0;
          return priceA - priceB;
        });
        break;
      case "price-desc":
        filtered.sort((a, b) => {
          const priceA =
            a.discountPrice !== undefined && a.discountPrice !== null
              ? typeof a.discountPrice === "number"
                ? a.discountPrice
                : Number(a.discountPrice) || 0
              : typeof a.price === "number"
              ? a.price
              : Number(a.price) || 0;
          const priceB =
            b.discountPrice !== undefined && b.discountPrice !== null
              ? typeof b.discountPrice === "number"
                ? b.discountPrice
                : Number(b.discountPrice) || 0
              : typeof b.price === "number"
              ? b.price
              : Number(b.price) || 0;
          return priceB - priceA;
        });
        break;
      case "date-asc":
        filtered.sort((a, b) => {
          const dateA = a.dateAdded ? new Date(a.dateAdded).getTime() : 0;
          const dateB = b.dateAdded ? new Date(b.dateAdded).getTime() : 0;
          return dateA - dateB;
        });
        break;
      case "date-desc":
        filtered.sort((a, b) => {
          const dateA = a.dateAdded ? new Date(a.dateAdded).getTime() : 0;
          const dateB = b.dateAdded ? new Date(b.dateAdded).getTime() : 0;
          return dateB - dateA;
        });
        break;
      // Default to featured
      default:
        // No specific sorting for featured
        break;
    }

    return filtered;
  }, [products, selectedCategories, selectedPriceRange, sortCriteria]);

  // Event handlers that update the data through onUpdateData
  const handleSortChange = (value: string) => {
    onUpdateData?.({ sortCriteria: value });
  };

  const handlePriceRangeChange = (value: string) => {
    onUpdateData?.({ selectedPriceRange: value });
  };

  const toggleCategoryFilter = (categoryId: string) => {
    const newSelectedCategories = selectedCategories.includes(categoryId)
      ? selectedCategories.filter((id) => id !== categoryId)
      : [...selectedCategories, categoryId];

    onUpdateData?.({ selectedCategories: newSelectedCategories });
  };

  const resetFilters = () => {
    onUpdateData?.({
      selectedPriceRange: "all",
      selectedCategories: [],
    });
  };

  const toggleMobileFilters = () => {
    onUpdateData?.({ showMobileFilters: !showMobileFilters });
  };

  return (
    <div className='w-full'>
      {/* Mobile filter toggle button */}
      <div className='block md:hidden mb-4'>
        <Button
          onClick={toggleMobileFilters}
          variant='outline'
          className='w-full'>
          <SlidersHorizontal className='h-4 w-4 mr-2' />
          {showMobileFilters ? "Hide Filters" : "Show Filters"}
        </Button>
      </div>

      <div className='flex flex-col md:flex-row gap-6'>
        {/* Sidebar filters - hidden on mobile until toggled */}
        <div
          className={`${
            showMobileFilters ? "block" : "hidden"
          } md:block w-full md:w-64 shrink-0`}>
          <div className='bg-white rounded-lg border p-4 sticky top-4'>
            <div className='flex justify-between items-center mb-4'>
              <h3 className='font-medium'>Filters</h3>
              <Button
                variant='ghost'
                size='sm'
                onClick={resetFilters}
                className='h-8 px-2 text-xs'>
                <FilterX className='h-3 w-3 mr-1' />
                Reset
              </Button>
            </div>

            {/* Categories Filter */}
            {categories && categories.length > 0 && (
              <div className='mb-6'>
                <h4 className='text-sm font-medium mb-2'>Categories</h4>
                <div className='space-y-2'>
                  {categories.map((category) => (
                    <div key={category.id} className='flex items-center'>
                      <Checkbox
                        id={`category-${category.id}`}
                        checked={selectedCategories.includes(category.id)}
                        onCheckedChange={() =>
                          toggleCategoryFilter(category.id)
                        }
                      />
                      <label
                        htmlFor={`category-${category.id}`}
                        className='ml-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70'>
                        {formatCategoryName(category.name)}
                        {category.productCount !== undefined && (
                          <span className='text-gray-500 ml-1'>
                            ({category.productCount})
                          </span>
                        )}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Price Range Filter */}
            <div className='mb-6'>
              <h4 className='text-sm font-medium mb-2'>Price Range</h4>
              <Select
                value={selectedPriceRange}
                onValueChange={handlePriceRangeChange}>
                <SelectTrigger className='w-full'>
                  <SelectValue placeholder='Select price range' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Prices</SelectItem>
                  <SelectItem value='0-50'>Under 50 EGP</SelectItem>
                  <SelectItem value='50-100'>50 - 100 EGP</SelectItem>
                  <SelectItem value='100-200'>100 - 200 EGP</SelectItem>
                  <SelectItem value='200-500'>200 - 500 EGP</SelectItem>
                  <SelectItem value='500-1000'>500 - 1000 EGP</SelectItem>
                  <SelectItem value='1000-999999'>Over 1000 EGP</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Close filter button on mobile */}
            <div className='block md:hidden'>
              <Button onClick={toggleMobileFilters} className='w-full'>
                Apply Filters
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className='flex-1'>
          <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6'>
            <div>
              <h2 className='text-xl font-semibold'>
                {filteredProducts.length} Products
              </h2>
            </div>
            <div className='flex items-center gap-2'>
              <span className='text-sm text-gray-600'>Sort by:</span>
              <Select value={sortCriteria} onValueChange={handleSortChange}>
                <SelectTrigger className='w-[180px]'>
                  <SelectValue placeholder='Sort products' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='featured'>Featured</SelectItem>
                  <SelectItem value='name-asc'>Name: A-Z</SelectItem>
                  <SelectItem value='name-desc'>Name: Z-A</SelectItem>
                  <SelectItem value='price-asc'>Price: Low to High</SelectItem>
                  <SelectItem value='price-desc'>Price: High to Low</SelectItem>
                  <SelectItem value='date-desc'>Newest</SelectItem>
                  <SelectItem value='date-asc'>Oldest</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <div className='flex justify-center items-center py-12'>
              <Loader2 className='h-8 w-8 animate-spin text-primary' />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className='text-center py-12 bg-white rounded-lg border'>
              <h3 className='text-lg font-medium mb-2'>No products found</h3>
              <p className='text-gray-500 mb-6'>
                Try adjusting your filters to find what you're looking for
              </p>
              <Button onClick={resetFilters} variant='outline'>
                <FilterX className='h-4 w-4 mr-2' />
                Reset Filters
              </Button>
            </div>
          ) : (
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'>
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  showVendor={false}
                  showImage={true}
                  imageSize='medium'
                  className='h-full transition-all hover:shadow-md'
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DefaultSortingTemplate;
