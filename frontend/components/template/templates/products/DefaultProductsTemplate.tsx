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
import { ShoppingBag } from "lucide-react";
import { ProductCard } from "#root/components/shop/ProductCard";

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

interface DefaultProductsTemplateProps {
  data?: ProductsTemplateData;
}

// This is the default products template that replicates the original page design
const DefaultProductsTemplate: React.FC<DefaultProductsTemplateProps> = ({
  data,
}) => {
  const [sortCriteria, setSortCriteria] = useState<string>("featured");

  // Use provided data or fallback to empty state
  const products = data?.products || [];
  const isLoading = data?.isLoading || false;
  const error = data?.error || null;

  if (error) {
    return (
      <div className='container mx-auto px-4 py-8 text-center'>
        <h2 className='text-2xl font-bold text-red-500 mb-2'>Error</h2>
        <p className='text-gray-600'>{error}</p>
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
    <div className='w-full'>
      <div className='bg-gradient-to-r from-gray-800 to-gray-900 py-16'>
        <div className='container mx-auto px-4 text-center'>
          <h1 className='text-3xl md:text-4xl font-bold text-white mb-4'>
            Featured Products
          </h1>
          <p className='text-white/80 max-w-2xl mx-auto'>
            Explore our complete collection of high-quality products.
          </p>
        </div>
      </div>

      <div className='container mx-auto px-4 py-8'>
        <div className='mb-6 flex justify-between items-center'>
          <h1 className='text-2xl font-bold'>All Products</h1>
          <div className='flex items-center gap-2'>
            <span className='text-sm text-gray-600'>Sort by:</span>
            <Select
              value={sortCriteria}
              onValueChange={(value) => setSortCriteria(value)}>
              <SelectTrigger className='w-[180px]'>
                <SelectValue placeholder='Sort products' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='featured'>Featured</SelectItem>
                <SelectItem value='name-asc'>Name: A-Z</SelectItem>
                <SelectItem value='name-desc'>Name: Z-A</SelectItem>
                <SelectItem value='price-asc'>Price: Low to High</SelectItem>
                <SelectItem value='price-desc'>Price: High to Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {sortedProducts.length === 0 ? (
          <div className='text-center py-12'>
            <ShoppingBag className='mx-auto h-16 w-16 text-gray-400 mb-4' />
            <h2 className='text-2xl font-semibold mb-2'>No products found</h2>
            <p className='text-gray-500'>
              We couldn't find any products matching your criteria.
            </p>
          </div>
        ) : (
          <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6'>
            {sortedProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                showVendor={false}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DefaultProductsTemplate;
