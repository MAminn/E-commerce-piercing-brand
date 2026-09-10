/**
 * @legacy
 * Legacy Template System (v1)
 * - Fully preserved for admin preview
 * - Not used in frontend rendering
 * - Used as a design asset library
 */

import type React from "react";
import { useEffect, useState } from "react";
import { Card } from "#root/components/ui/card";
import { Button } from "#root/components/ui/button";
import { Badge } from "#root/components/ui/badge";
import {
  Store,
  Loader2,
  ArrowRight,
  Users,
  Award,
  TrendingUp,
} from "lucide-react";
import { Link } from "#root/components/utils/Link";

interface Vendor {
  id: string;
  name: string;
  description: string | null;
  logoImagePath: string | null;
}

interface BrandsTemplateData {
  vendors: Vendor[];
  isLoading: boolean;
  error: string | null;
}

interface ModernBrandsTemplateProps {
  data?: BrandsTemplateData;
}

// Modern alternative brands template with sleek design
const ModernBrandsTemplate: React.FC<ModernBrandsTemplateProps> = ({
  data,
}) => {
  // Use provided data or fallback to empty state
  const templateData = data || {
    vendors: [],
    isLoading: false,
    error: null,
  };

  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  if (templateData.isLoading) {
    return (
      <div className='min-h-screen bg-white flex items-center justify-center'>
        <div className='w-12 h-12 rounded-full border-4 border-gray-200 border-t-gray-900 animate-spin'></div>
      </div>
    );
  }

  if (templateData.error) {
    return (
      <div className='min-h-screen bg-white flex flex-col items-center justify-center py-8'>
        <h2 className='text-2xl font-light text-gray-900 mb-2'>
          Something went wrong
        </h2>
        <p className='text-gray-600'>{templateData.error}</p>
      </div>
    );
  }

  return (
    <main className='min-h-screen bg-white overflow-hidden'>
      {/* Minimalist Hero Section */}
      <section className='relative bg-white py-24'>
        {/* Subtle geometric background */}
        <div className='absolute inset-0 opacity-5'>
          <div className='absolute top-1/4 left-1/4 w-64 h-64 border border-gray-200 rounded-full'></div>
          <div className='absolute bottom-1/4 right-1/4 w-48 h-48 border border-gray-200 rounded-full'></div>
        </div>

        <div className='relative z-10 container mx-auto px-4'>
          <div
            className={`text-center max-w-4xl mx-auto transition-all duration-1000 ${
              isVisible
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-12"
            }`}>
            <div className='inline-flex items-center bg-gray-50 px-4 py-2 rounded-full border border-gray-100 mb-8'>
              <div className='w-2 h-2 bg-gray-900 rounded-full mr-3 animate-pulse'></div>
              <span className='text-gray-700 text-sm font-medium tracking-wide'>
                PREMIUM PARTNERS
              </span>
            </div>

            <h1 className='text-5xl md:text-7xl font-light text-gray-900 leading-none tracking-tight mb-6'>
              Our Collection
              <span className='block text-3xl md:text-4xl font-normal text-gray-600 mt-2'>
                Curated Excellence
              </span>
            </h1>

            <p className='text-gray-600 text-lg leading-relaxed max-w-2xl mx-auto mb-12'>
              Discover exceptional products in our carefully curated collection.
              Each item represents quality, authenticity, and thoughtful design.
            </p>

            {/* Trust indicators */}
            <div className='grid grid-cols-1 md:grid-cols-3 gap-8 max-w-2xl mx-auto'>
              <div className='text-center'>
                <div className='w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3'>
                  <Award className='w-6 h-6 text-gray-600' />
                </div>
                <div className='text-2xl font-light text-gray-900 mb-1'>
                  500+
                </div>
                <div className='text-sm text-gray-600'>Quality Products</div>
              </div>
              <div className='text-center'>
                <div className='w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3'>
                  <Users className='w-6 h-6 text-gray-600' />
                </div>
                <div className='text-2xl font-light text-gray-900 mb-1'>
                  50K+
                </div>
                <div className='text-sm text-gray-600'>Happy Customers</div>
              </div>
              <div className='text-center'>
                <div className='w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3'>
                  <TrendingUp className='w-6 h-6 text-gray-600' />
                </div>
                <div className='text-2xl font-light text-gray-900 mb-1'>
                  99%
                </div>
                <div className='text-sm text-gray-600'>Satisfaction</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Brands Section */}
      <section className='py-24 bg-gray-50'>
        <div className='container mx-auto px-4'>
          {templateData.vendors.length === 0 ? (
            <div className='text-center py-20 bg-white rounded-3xl border border-gray-100'>
              <div className='w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-6'>
                <Store className='h-10 w-10 text-gray-600' />
              </div>
              <h3 className='text-3xl font-light text-gray-900 mb-4'>
                No products found
              </h3>
              <p className='text-gray-600 mb-8 max-w-md mx-auto leading-relaxed'>
                We're working hard to bring you amazing products. Check back
                soon!
              </p>
              <Button className='bg-gray-900 hover:bg-gray-800 text-white px-8 py-3 transition-all duration-300 hover:shadow-lg'>
                <Link href='/products' className='text-white flex items-center'>
                  Browse Products
                  <ArrowRight className='ml-2 h-4 w-4' />
                </Link>
              </Button>
            </div>
          ) : (
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8'>
              {templateData.vendors.map((vendor, index) => (
                <Card
                  key={vendor.id}
                  className='group relative overflow-hidden bg-white hover:shadow-xl transition-all duration-500 transform hover:-translate-y-2 border border-gray-100 rounded-3xl'>
                  <div className='p-8'>
                    <div className='flex items-start gap-6 mb-6'>
                      <div className='w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center overflow-hidden p-3 group-hover:bg-gray-900 transition-all duration-300'>
                        {vendor.logoImagePath ? (
                          <img
                            src={
                              vendor.logoImagePath.startsWith("http")
                                ? vendor.logoImagePath
                                : `/uploads/${vendor.logoImagePath}`
                            }
                            alt={vendor.name}
                            className='w-full h-full object-contain transition-all duration-300 group-hover:brightness-0 group-hover:invert'
                          />
                        ) : (
                          <Store className='h-8 w-8 text-gray-600 group-hover:text-white transition-colors duration-300' />
                        )}
                      </div>
                      <div className='flex-1'>
                        <h3 className='font-light text-2xl text-gray-900 mb-2 group-hover:text-gray-900 transition-colors duration-300'>
                          {vendor.name}
                        </h3>
                        <Badge
                          variant='outline'
                          className='border-gray-200 text-gray-600 bg-gray-50 text-xs font-medium'>
                          Verified Partner
                        </Badge>
                      </div>
                    </div>

                    {vendor.description && (
                      <p className='text-gray-600 line-clamp-3 mb-8 leading-relaxed'>
                        {vendor.description}
                      </p>
                    )}

                    <Link
                      href={`/featured/brands/@${vendor.id}`}
                      className='block w-full'>
                      <Button className='w-full bg-gray-900 hover:bg-gray-800 text-white border-0 transition-all duration-300 hover:shadow-lg group-hover:-translate-y-0.5 rounded-xl py-3'>
                        Explore Collection
                        <ArrowRight className='ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform duration-300' />
                      </Button>
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
};

export default ModernBrandsTemplate;
