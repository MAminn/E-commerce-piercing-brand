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
import HeroImg from "#root/assets/Women_s_banner.webp";
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

interface WomenTemplateData {
  subcategories: Category[];
  isLoading: boolean;
  error?: string | null;
}

interface DefaultWomenTemplateProps {
  data?: WomenTemplateData;
}

// This is the default women's template that replicates the original page design
const DefaultWomenTemplate: React.FC<DefaultWomenTemplateProps> = ({
  data,
}) => {
  // Use provided data or fallback to empty state
  const subcategories = data?.subcategories || [];
  const isLoading = data?.isLoading || false;
  const error = data?.error || null;

  if (error) {
    return <ErrorSection error={error} />;
  }

  return (
    <section className='w-full h-full flex flex-col justify-center items-center'>
      <section className='w-full h-full'>
        <img src={HeroImg} alt="Women's Collection" className='w-full h-full' />
      </section>

      <div className='container mx-auto px-4 py-8'>
        <h1 className='text-3xl font-bold mb-8 text-center'>
          Women's Collection
        </h1>
        <Sorting categoryType='women' categories={subcategories} />
      </div>
    </section>
  );
};

export default DefaultWomenTemplate;
