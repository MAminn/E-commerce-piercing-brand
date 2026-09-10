/**
 * @legacy
 * Legacy Template System (v1)
 * - Fully preserved for admin preview
 * - Not used in frontend rendering
 * - Used as a design asset library
 */

/**
 * @legacy
 * Legacy Template System (v1)
 * - Fully preserved for admin preview
 * - Not used in frontend rendering
 * - Used as a design asset library
 */

import type React from "react";
import { useState, useEffect } from "react";
import HeroImg from "#root/assets/Men_s_Page_banner_1.webp";
import { ErrorSection } from "#root/components/dashboard/ErrorSection";
import Sorting from "#root/components/shop/Sorting";

interface Category {
  id: string;
  name: string;
  type?: string;
  displayName?: string;
  slug?: string;
  imageId?: string | null;
  filename?: string | null;
  productCount?: number;
}

interface MenTemplateData {
  subcategories: Category[];
  isLoading: boolean;
  error?: string | null;
}

interface ModernMenTemplateProps {
  data?: MenTemplateData;
}

// Modern alternative men's template with a different layout
const ModernMenTemplate: React.FC<ModernMenTemplateProps> = ({ data }) => {
  // Use provided data or fallback to empty state
  const subcategories = data?.subcategories || [];
  const isLoading = data?.isLoading || false;
  const error = data?.error || null;
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  if (isLoading) {
    return (
      <div className='min-h-screen bg-white flex items-center justify-center'>
        <div className='w-12 h-12 rounded-full border-4 border-gray-200 border-t-gray-900 animate-spin'></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='min-h-screen bg-white flex flex-col items-center justify-center py-8'>
        <h2 className='text-2xl font-light text-gray-900 mb-2'>
          Something went wrong
        </h2>
        <p className='text-gray-600 font-light'>{error}</p>
      </div>
    );
  }

  return (
    <main
      className={`min-h-screen bg-white transition-opacity duration-1000 ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}>
      {/* Hero Section */}
      <section className='relative h-96 overflow-hidden'>
        <img
          src={HeroImg}
          alt="Men's Collection"
          className='w-full h-full object-cover'
        />
        <div className='absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center'>
          <div className='text-center text-white'>
            <div className='inline-flex items-center bg-white/10 px-4 py-2 rounded-full border border-white/20 mb-6'>
              <div className='w-2 h-2 bg-white rounded-full mr-3'></div>
              <span className='text-white/90 text-sm font-medium tracking-wide'>
                MEN'S FASHION
              </span>
            </div>
            <h1 className='text-5xl font-light mb-4 tracking-wide'>
              MEN'S COLLECTION
            </h1>
            <p className='text-xl opacity-90 font-light'>
              Discover premium fashion for the modern man
            </p>
          </div>
        </div>
      </section>

      {/* Categories Section */}
      <section className='py-24 bg-gray-50'>
        <div className='container mx-auto px-4'>
          <div className='bg-white border border-gray-200 rounded-none p-12'>
            <div className='text-center mb-12'>
              <div className='inline-flex items-center bg-gray-50 px-4 py-2 rounded-full border border-gray-100 mb-6'>
                <div className='w-2 h-2 bg-gray-900 rounded-full mr-3'></div>
                <span className='text-gray-700 text-sm font-medium tracking-wide'>
                  CATEGORIES
                </span>
              </div>
              <h2 className='text-4xl font-light text-gray-900 mb-4'>
                Shop by Category
              </h2>
              <p className='text-gray-600 max-w-2xl mx-auto text-lg leading-relaxed font-light'>
                Explore our curated selection of men's fashion categories
              </p>
            </div>
            <Sorting categoryType='men' categories={subcategories} />
          </div>
        </div>
      </section>
    </main>
  );
};

export default ModernMenTemplate;
