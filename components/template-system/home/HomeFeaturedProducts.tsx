import type React from "react";
import { ProductCard } from "#root/components/shop/ProductCard";
import { Button } from "#root/components/ui/button";
import { Link } from "#root/components/utils/Link";
import { ShoppingBag } from "lucide-react";

export interface FeaturedProduct {
  id: string;
  slug?: string | null;
  name: string;
  price: number;
  discountPrice?: number | string | null;
  stock: number;
  imageUrl?: string;
  images?: { url: string; isPrimary?: boolean }[];
  categoryName?: string | null;
  available: boolean;
  categories?: { id: string; name: string }[];
}

export interface HomeFeaturedProductsProps {
  products?: FeaturedProduct[];
  isLoading?: boolean;
  title?: string;
  subtitle?: string;
  description?: string;
  showViewAllButton?: boolean;
  viewAllHref?: string;
  viewAllLink?: string;
  maxProducts?: number;
  backgroundColor?: string;
  limit?: number;
}

export function HomeFeaturedProducts({
  products = [],
  isLoading = false,
  title = "Featured Products",
  subtitle,
  showViewAllButton = true,
  viewAllHref = "/shop",
  maxProducts = 8,
}: HomeFeaturedProductsProps) {
  // Limit the number of products displayed
  const displayedProducts = products.slice(0, maxProducts);

  if (isLoading) {
    return (
      <section className='py-16 bg-gray-50'>
        <div className='container mx-auto px-4'>
          <div className='text-center mb-12'>
            <h2 className='text-3xl lg:text-5xl font-light text-stone-900 leading-[1.15] tracking-tight mb-4'>
              {title}
            </h2>
            {subtitle && (
              <p className='text-base lg:text-lg text-stone-600 font-light leading-relaxed max-w-md mx-auto'>
                {subtitle}
              </p>
            )}
          </div>
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'>
            {[...Array(maxProducts)].map((_, index) => (
              <div
                key={index}
                className='bg-white rounded-lg border border-gray-200 animate-pulse'>
                <div className='aspect-square bg-gray-200' />
                <div className='p-4 space-y-3'>
                  <div className='h-4 bg-gray-200 rounded w-3/4' />
                  <div className='h-4 bg-gray-200 rounded w-1/2' />
                  <div className='h-4 bg-gray-200 rounded w-2/3' />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!products || products.length === 0) {
    return (
      <section className='py-16 bg-gray-50'>
        <div className='container mx-auto px-4'>
          <div className='text-center mb-12'>
            <h2 className='text-3xl lg:text-5xl font-light text-stone-900 leading-[1.15] tracking-tight mb-4'>
              {title}
            </h2>
            {subtitle && (
              <p className='text-base lg:text-lg text-stone-600 font-light leading-relaxed max-w-md mx-auto'>
                {subtitle}
              </p>
            )}
          </div>
          <div className='max-w-md mx-auto text-center py-12 bg-white rounded-lg border border-gray-200'>
            <ShoppingBag className='h-16 w-16 mx-auto text-gray-400 mb-4' />
            <h3 className='text-xl lg:text-2xl font-normal text-stone-900 leading-snug mb-2'>
              No Featured Products Yet
            </h3>
            <p className='text-sm text-stone-600 font-light leading-relaxed mb-6'>
              Check back soon for exciting new products!
            </p>
            {showViewAllButton && (
              <Button variant='secondary' size='md' asChild>
                <Link href={viewAllHref}>Browse All Products</Link>
              </Button>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className='py-16 bg-gray-50'>
      <div className='container mx-auto px-4'>
        {/* Section Header */}
        <div className='text-center mb-12'>
          <h2 className='text-3xl md:text-4xl font-bold text-gray-900 mb-3'>
            {title}
          </h2>
          {subtitle && (
            <p className='text-gray-600 text-lg max-w-2xl mx-auto'>
              {subtitle}
            </p>
          )}
        </div>

        {/* Products Grid */}
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-10'>
          {displayedProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              showVendor={false}
              showImage={true}
              imageSize='medium'
              className='h-full transition-all hover:shadow-lg'
            />
          ))}
        </div>

        {/* View All Button */}
        {showViewAllButton && (
          <div className='text-center'>
            <Button variant='secondary' size='lg' asChild>
              <Link href={viewAllHref}>
                View All Products
                <ShoppingBag className='ml-2 h-5 w-5' />
              </Link>
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
