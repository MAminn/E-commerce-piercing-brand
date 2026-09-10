/**
 * @legacy
 * Legacy Template System (v1)
 * - Fully preserved for admin preview
 * - Not used in frontend rendering
 * - Used as a design asset library
 */

import type React from "react";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#root/components/ui/select";
import { ShoppingBag, Grid, List } from "lucide-react";
import { ProductCard } from "#root/components/shop/ProductCard";
import { Button } from "#root/components/ui/button";

interface Product {
  id: string;
  name: string;
  price: number;
  discountPrice?: number | null;
  imageUrl: string;
  available: boolean;
  vendorId: string;
  vendorName: string;
  stock: number;
  sku: string;
}

interface ProductsTemplateData {
  products: Product[];
  isLoading: boolean;
  error?: string | null;
}

interface ModernProductsTemplateProps {
  data?: ProductsTemplateData;
}

// Modern alternative products template with enhanced UI
const ModernProductsTemplate: React.FC<ModernProductsTemplateProps> = ({
  data,
}) => {
  const [sortCriteria, setSortCriteria] = useState<string>("featured");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Use provided data or fallback to empty state
  const products = data?.products || [];
  const isLoading = data?.isLoading || false;
  const error = data?.error || null;

  if (error) {
    return (
      <div className='min-h-screen bg-white flex items-center justify-center'>
        <div className='text-center bg-white border border-gray-200 rounded-none p-12'>
          <h2 className='text-2xl font-medium text-gray-900 mb-2'>
            Something went wrong
          </h2>
          <p className='text-gray-600 font-light'>{error}</p>
        </div>
      </div>
    );
  }

  const getSortedProducts = () => {
    if (products.length === 0) return [];

    const sortedProducts = [...products];

    switch (sortCriteria) {
      case "featured":
        break;
      case "name-asc":
        sortedProducts.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "name-desc":
        sortedProducts.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case "price-asc":
        sortedProducts.sort((a, b) => {
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
        sortedProducts.sort((a, b) => {
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
    }

    return sortedProducts;
  };

  const sortedProducts = getSortedProducts();

  return (
    <div className='min-h-screen bg-white'>
      {/* Hero Section */}
      <div className='bg-white border-b border-gray-200 py-20'>
        <div className='container mx-auto px-4 text-center'>
          <div className='bg-gray-50 border border-gray-200 rounded-none px-4 py-2 inline-block mb-6'>
            <span className='text-xs font-medium text-gray-900 uppercase tracking-wider'>
              Products
            </span>
          </div>
          <h1 className='text-4xl md:text-6xl font-light text-gray-900 mb-6'>
            Discover Amazing Products
          </h1>
          <p className='text-xl text-gray-600 font-light max-w-3xl mx-auto mb-8'>
            Explore our curated collection of premium products from top brands
            worldwide.
          </p>
          <div className='flex justify-center items-center gap-4 text-gray-600'>
            <span className='text-lg font-light'>
              {sortedProducts.length} Products Available
            </span>
          </div>
        </div>
      </div>

      <div className='container mx-auto px-4 py-12'>
        {/* Controls Bar */}
        <div className='bg-white border border-gray-200 rounded-none p-6 mb-8'>
          <div className='flex flex-col md:flex-row justify-between items-center gap-4'>
            <div className='flex items-center gap-4'>
              <h2 className='text-2xl font-medium text-gray-900'>
                All Products
              </h2>
              <div className='flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-none p-1'>
                <Button
                  variant={viewMode === "grid" ? "primary" : "ghost"}
                  size='sm'
                  onClick={() => setViewMode("grid")}
                  className='h-8 w-8 p-0 rounded-none'>
                  <Grid className='h-4 w-4' />
                </Button>
                <Button
                  variant={viewMode === "list" ? "primary" : "ghost"}
                  size='sm'
                  onClick={() => setViewMode("list")}
                  className='h-8 w-8 p-0 rounded-none'>
                  <List className='h-4 w-4' />
                </Button>
              </div>
            </div>

            <div className='flex items-center gap-4'>
              <span className='text-sm text-gray-600 font-light'>Sort by:</span>
              <Select
                value={sortCriteria}
                onValueChange={(value) => setSortCriteria(value)}>
                <SelectTrigger className='w-[200px] border-gray-200 rounded-none'>
                  <SelectValue placeholder='Sort products' />
                </SelectTrigger>
                <SelectContent className='rounded-none border-gray-200'>
                  <SelectItem value='featured'>Featured</SelectItem>
                  <SelectItem value='name-asc'>Name: A-Z</SelectItem>
                  <SelectItem value='name-desc'>Name: Z-A</SelectItem>
                  <SelectItem value='price-asc'>Price: Low to High</SelectItem>
                  <SelectItem value='price-desc'>Price: High to Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Products Grid/List */}
        {sortedProducts.length === 0 ? (
          <div className='text-center py-20 bg-white border border-gray-200 rounded-none'>
            <div className='w-24 h-24 bg-gray-50 border border-gray-200 rounded-none flex items-center justify-center mx-auto mb-6'>
              <ShoppingBag className='h-12 w-12 text-gray-600' />
            </div>
            <h2 className='text-3xl font-medium text-gray-900 mb-4'>
              No products found
            </h2>
            <p className='text-gray-600 font-light text-lg max-w-md mx-auto'>
              We couldn't find any products matching your criteria. Try
              adjusting your filters.
            </p>
          </div>
        ) : (
          <div
            className={`
            ${
              viewMode === "grid"
                ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8"
                : "flex flex-col gap-4"
            }
          `}>
            {sortedProducts.map((product, index) => (
              <div
                key={product.id}
                className={`
                  ${
                    viewMode === "grid"
                      ? "transition-all duration-300"
                      : "bg-white border border-gray-200 rounded-none hover:border-gray-300 transition-all duration-300"
                  }
                `}
                style={{
                  animationDelay: `${index * 100}ms`,
                }}>
                <ProductCard product={product} showVendor={false} />
              </div>
            ))}
          </div>
        )}

        {/* Load More Section */}
        {sortedProducts.length > 0 && (
          <div className='text-center mt-12'>
            <div className='bg-white border border-gray-200 rounded-none p-8'>
              <h3 className='text-xl font-medium text-gray-900 mb-4'>
                Showing {sortedProducts.length} products
              </h3>
              <p className='text-gray-600 font-light mb-6'>
                Discover more amazing products in our collection
              </p>
              <Button className='bg-gray-900 hover:bg-gray-800 text-white px-8 py-3 rounded-none font-medium border border-gray-900'>
                Load More Products
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ModernProductsTemplate;
