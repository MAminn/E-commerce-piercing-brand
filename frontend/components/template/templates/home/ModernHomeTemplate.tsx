/**
 * @legacy
 * Legacy Template System (v1)
 * - Fully preserved for admin preview
 * - Not used in frontend rendering
 * - Used as a design asset library
 */

import { lazy, Suspense, useEffect, useState } from "react";
import { Button } from "#root/components/ui/button";
import { Link } from "#root/components/utils/Link";
import {
  ShoppingBag,
  Users,
  ArrowRight,
  Star,
  TrendingUp,
  Shield,
  Truck,
  Award,
  Clock,
} from "lucide-react";
import { Footer } from "#root/components/globals/Footer";

// Lazy load components for better performance
const FAQ = lazy(() =>
  import("#root/components/globals/FAQ").then((mod) => ({ default: mod.FAQ })),
);
const FeaturedSection = lazy(() =>
  import("#root/components/home/FeaturedSection").then((mod) => ({
    default: mod.FeaturedSection,
  })),
);

interface FeaturedProduct {
  id: string;
  name: string;
  price: number;
  discountPrice?: number | string | null;
  stock: number;
  imageUrl?: string;
  images?: { url: string; isPrimary?: boolean }[];
  vendor: string;
  vendorId: string;
  vendorName: string;
  categoryName: string;
  available: boolean;
  categories?: { id: string; name: string }[];
}

interface HomeTemplateData {
  featuredProducts: FeaturedProduct[];
  isLoading: boolean;
  error?: string | null;
}

interface ModernHomeTemplateProps {
  data?: HomeTemplateData;
}

// FAQ data
const faqData = [
  {
    id: "how-lebsey-works",
    question: "How does our store work?",
    answer:
      "Browse our curated collections, add items to your cart, and checkout seamlessly. We offer a wide range of products with secure payments and fast shipping.",
  },
  {
    id: "shipping-time",
    question: "How long does shipping take?",
    answer:
      "We ship across Egypt, delivering orders within a week (Not including holidays). Shipping costs vary based on order details and location, with support available at cs@Lebsey.com for any issues.",
  },
  {
    id: "return-policy",
    question: "What is your return policy?",
    answer:
      "You can return items within 14 days if they are unused and in their original packaging. To start a return, contact us at CS@Lebsey.com or WhatsApp +201507135600. Return fees match the original delivery cost, and refunds are processed within 14 days. Damaged items must be reported within 1 day for a free replacement or refund.",
  },
];

// Preload critical images
const preloadImages = () => {
  const criticalImages = ["/assets/landing.webp", "/assets/story.webp"];
  for (const src of criticalImages) {
    const img = new Image();
    img.src = src;
  }
};

const LoadingPlaceholder = () => (
  <div className='w-full py-8 flex justify-center'>
    <div className='w-12 h-12 rounded-full border-4 border-gray-200 border-t-gray-900 animate-spin'></div>
  </div>
);

// Animation variants for staggered entrance
const fadeInUp = {
  initial: { opacity: 0, y: 60 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: "easeOut" },
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

export default function ModernHomeTemplate({ data }: ModernHomeTemplateProps) {
  // Use provided data or fallback to empty state
  const featuredProducts = data?.featuredProducts || [];
  const isLoading = data?.isLoading || false;
  const error = data?.error || null;
  const [isVisible, setIsVisible] = useState(false);

  // Preload critical images on component mount
  useEffect(() => {
    preloadImages();
    setIsVisible(true);
  }, []);

  return (
    <main className='overflow-hidden'>
      {/* Minimalist Hero Section */}
      <section className='relative min-h-screen bg-white'>
        {/* Subtle geometric background */}
        <div className='absolute inset-0 opacity-5'>
          <div className='absolute top-1/4 left-1/4 w-96 h-96 border border-gray-200 rounded-full'></div>
          <div className='absolute bottom-1/4 right-1/4 w-64 h-64 border border-gray-200 rounded-full'></div>
          <div className='absolute top-1/2 right-1/3 w-32 h-32 bg-gray-100 rounded-full'></div>
        </div>

        <div className='relative z-10 container mx-auto px-4 py-20'>
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-16 items-center min-h-[85vh]'>
            {/* Left Content */}
            <div
              className={`space-y-8 transition-all duration-1000 ${
                isVisible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-12"
              }`}>
              <div className='inline-flex items-center bg-gray-50 px-4 py-2 rounded-full border border-gray-100'>
                <div className='w-2 h-2 bg-gray-900 rounded-full mr-3 animate-pulse'></div>
                <span className='text-gray-700 text-sm font-medium tracking-wide'>
                  PREMIUM FASHION STORE
                </span>
              </div>

              <div className='space-y-6'>
                <h1 className='text-6xl md:text-8xl font-light text-gray-900 leading-none tracking-tight'>
                  Lebsy
                  <span className='block text-4xl md:text-5xl font-normal text-gray-600 mt-2'>
                    Where Style Meets Substance
                  </span>
                </h1>

                <p className='text-gray-600 text-lg leading-relaxed max-w-lg'>
                  Discover exceptional fashion from curated designers and
                  brands. Every piece tells a story, every purchase supports
                  creativity.
                </p>
              </div>

              <div className='flex flex-col sm:flex-row gap-4'>
                <Button
                  asChild
                  size='lg'
                  className='bg-gray-900 hover:bg-gray-800 text-white border-0 px-8 py-4 text-base font-medium transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5'>
                  <Link href='/shop'>
                    Explore Collection
                    <ArrowRight className='ml-2 h-4 w-4 transition-transform group-hover:translate-x-1' />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant='outline'
                  size='lg'
                  className='border-gray-300 text-gray-700 hover:bg-gray-50 px-8 py-4 text-base font-medium transition-all duration-300 hover:shadow-md'>
                  <Link href='/shop'>View All Products</Link>
                </Button>
              </div>
            </div>

            {/* Right Content - Clean Image Layout */}
            <div
              className={`relative transition-all duration-1000 delay-300 ${
                isVisible
                  ? "opacity-100 translate-x-0"
                  : "opacity-0 translate-x-12"
              }`}>
              <div className='grid grid-cols-12 grid-rows-12 gap-4 h-[600px]'>
                {/* Large featured image */}
                <div className='col-span-8 row-span-8 relative group overflow-hidden rounded-2xl bg-gray-100'>
                  <img
                    src='/assets/women-section.webp'
                    alt='Featured fashion'
                    className='w-full h-full object-cover transition-transform duration-700 group-hover:scale-105'
                    loading='lazy'
                  />
                  <div className='absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300'></div>
                </div>

                {/* Small accent image */}
                <div className='col-span-4 row-span-5 relative group overflow-hidden rounded-xl bg-gray-100'>
                  <img
                    src='/assets/men-section.webp'
                    alt="Men's collection"
                    className='w-full h-full object-cover transition-transform duration-700 group-hover:scale-105'
                    loading='lazy'
                  />
                </div>

                {/* Stats card */}
                <div className='col-span-4 row-span-3 bg-gray-50 rounded-xl p-4 flex flex-col justify-center border border-gray-100'>
                  <div className='text-2xl font-light text-gray-900 mb-1'>
                    500+
                  </div>
                  <div className='text-sm text-gray-600 font-medium'>
                    Curated Brands
                  </div>
                </div>

                {/* Quality badge */}
                <div className='col-span-4 row-span-4 bg-gray-900 rounded-xl p-4 flex flex-col justify-center text-white'>
                  <Star className='w-6 h-6 mb-2 text-white' />
                  <div className='text-sm font-medium'>Premium Quality</div>
                  <div className='text-xs text-gray-300 mt-1'>
                    Verified authentic
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Indicators */}
      <section className='py-24 bg-gray-50'>
        <div className='container mx-auto px-4'>
          <div className='grid grid-cols-1 md:grid-cols-4 gap-8'>
            <div className='group text-center p-8 bg-white rounded-2xl border border-gray-100 hover:shadow-lg transition-all duration-300 hover:-translate-y-1'>
              <div className='w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:bg-gray-900 transition-colors duration-300'>
                <Shield className='w-6 h-6 text-gray-600 group-hover:text-white transition-colors duration-300' />
              </div>
              <div className='text-2xl font-light text-gray-900 mb-2'>500+</div>
              <div className='text-gray-600 font-medium'>
                Products Available
              </div>
              <div className='text-sm text-gray-500 mt-1'>
                Authenticated quality
              </div>
            </div>
            <div className='group text-center p-8 bg-white rounded-2xl border border-gray-100 hover:shadow-lg transition-all duration-300 hover:-translate-y-1'>
              <div className='w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:bg-gray-900 transition-colors duration-300'>
                <Users className='w-6 h-6 text-gray-600 group-hover:text-white transition-colors duration-300' />
              </div>
              <div className='text-2xl font-light text-gray-900 mb-2'>50K+</div>
              <div className='text-gray-600 font-medium'>Happy Customers</div>
              <div className='text-sm text-gray-500 mt-1'>
                Worldwide community
              </div>
            </div>
            <div className='group text-center p-8 bg-white rounded-2xl border border-gray-100 hover:shadow-lg transition-all duration-300 hover:-translate-y-1'>
              <div className='w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:bg-gray-900 transition-colors duration-300'>
                <Truck className='w-6 h-6 text-gray-600 group-hover:text-white transition-colors duration-300' />
              </div>
              <div className='text-2xl font-light text-gray-900 mb-2'>
                7 Days
              </div>
              <div className='text-gray-600 font-medium'>Fast Delivery</div>
              <div className='text-sm text-gray-500 mt-1'>Across Egypt</div>
            </div>
            <div className='group text-center p-8 bg-white rounded-2xl border border-gray-100 hover:shadow-lg transition-all duration-300 hover:-translate-y-1'>
              <div className='w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:bg-gray-900 transition-colors duration-300'>
                <Award className='w-6 h-6 text-gray-600 group-hover:text-white transition-colors duration-300' />
              </div>
              <div className='text-2xl font-light text-gray-900 mb-2'>99%</div>
              <div className='text-gray-600 font-medium'>Satisfaction</div>
              <div className='text-sm text-gray-500 mt-1'>Customer rating</div>
            </div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className='py-24 bg-white'>
        <div className='container mx-auto px-4'>
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-16 items-center'>
            <div className='relative order-2 lg:order-1'>
              <div className='relative overflow-hidden rounded-3xl bg-gray-100'>
                <img
                  src='/assets/story.webp'
                  alt='About Lebsy - Our fashion story'
                  className='w-full h-auto transition-transform duration-700 hover:scale-105'
                  width='500'
                  height='333'
                  loading='lazy'
                  decoding='async'
                />
              </div>
              {/* Floating element */}
              <div className='absolute -bottom-6 -right-6 bg-gray-900 text-white p-6 rounded-2xl shadow-xl'>
                <div className='text-sm font-medium mb-1'>Since 2024</div>
                <div className='text-xs text-gray-300'>
                  Crafting experiences
                </div>
              </div>
            </div>

            <div className='space-y-8 order-1 lg:order-2'>
              <div className='space-y-6'>
                <div className='inline-flex items-center bg-gray-50 px-4 py-2 rounded-full border border-gray-100'>
                  <div className='w-2 h-2 bg-gray-900 rounded-full mr-3'></div>
                  <span className='text-gray-700 text-sm font-medium tracking-wide'>
                    OUR STORY
                  </span>
                </div>
                <h2 className='text-4xl md:text-5xl font-light text-gray-900 leading-tight'>
                  Redefining Fashion
                  <span className='block font-normal text-gray-600'>
                    Commerce
                  </span>
                </h2>
              </div>

              <div className='space-y-6 text-gray-600 leading-relaxed'>
                <p className='text-lg'>
                  We believe fashion is more than clothing—it's self-expression,
                  creativity, and connection. Our store is designed to bring you
                  exceptional products for discerning customers.
                </p>
                <p>
                  Every product in our collection reflects our commitment to
                  quality, authenticity, and sustainable practices. We're
                  building a shopping experience that values both style and
                  substance.
                </p>
              </div>

              <div className='flex flex-col sm:flex-row gap-4'>
                <Button
                  asChild
                  className='bg-gray-900 hover:bg-gray-800 text-white px-8 py-3 transition-all duration-300 hover:shadow-lg'>
                  <Link href='/shop'>
                    Browse Collection
                    <ArrowRight className='ml-2 h-4 w-4' />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Collections Section */}
      <section className='py-24 bg-gray-50'>
        <div className='container mx-auto px-4'>
          <div className='text-center mb-16'>
            <div className='inline-flex items-center bg-white px-4 py-2 rounded-full border border-gray-100 mb-6'>
              <div className='w-2 h-2 bg-gray-900 rounded-full mr-3'></div>
              <span className='text-gray-700 text-sm font-medium tracking-wide'>
                COLLECTIONS
              </span>
            </div>
            <h2 className='text-4xl md:text-5xl font-light text-gray-900 mb-4 leading-tight'>
              Curated for You
            </h2>
            <p className='text-gray-600 max-w-2xl mx-auto text-lg leading-relaxed'>
              Explore our carefully selected collections from the world's most
              innovative designers
            </p>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-3 gap-8'>
            {/* New Arrivals */}
            <div className='group relative bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-xl transition-all duration-500 hover:-translate-y-2'>
              <Link href='/shop' className='block'>
                <div className='aspect-[4/5] overflow-hidden'>
                  <img
                    src='/assets/hero-placeholder.webp'
                    alt='New arrivals collection'
                    className='w-full h-full object-cover transition-transform duration-700 group-hover:scale-105'
                    width='400'
                    height='500'
                    loading='lazy'
                    decoding='async'
                  />
                </div>
                <div className='p-8'>
                  <h3 className='text-2xl font-light text-gray-900 mb-2'>
                    New Arrivals
                  </h3>
                  <p className='text-gray-600 mb-4'>
                    Discover the latest additions to our collection
                  </p>
                  <div className='flex items-center text-gray-900 font-medium group-hover:translate-x-2 transition-transform duration-300'>
                    <span>Explore New</span>
                    <ArrowRight className='h-4 w-4 ml-2' />
                  </div>
                </div>
              </Link>
            </div>

            {/* Best Sellers */}
            <div className='group relative bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-xl transition-all duration-500 hover:-translate-y-2'>
              <Link href='/shop' className='block'>
                <div className='aspect-[4/5] overflow-hidden'>
                  <img
                    src='/assets/hero-placeholder.webp'
                    alt='Best sellers collection'
                    className='w-full h-full object-cover transition-transform duration-700 group-hover:scale-105'
                    width='400'
                    height='500'
                    loading='lazy'
                    decoding='async'
                  />
                </div>
                <div className='p-8'>
                  <h3 className='text-2xl font-light text-gray-900 mb-2'>
                    Best Sellers
                  </h3>
                  <p className='text-gray-600 mb-4'>
                    Our most popular products loved by customers
                  </p>
                  <div className='flex items-center text-gray-900 font-medium group-hover:translate-x-2 transition-transform duration-300'>
                    <span>Shop Popular</span>
                    <ArrowRight className='h-4 w-4 ml-2' />
                  </div>
                </div>
              </Link>
            </div>

            {/* All Products */}
            <div className='group relative bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-xl transition-all duration-500 hover:-translate-y-2'>
              <Link href='/shop' className='block'>
                <div className='aspect-[4/5] overflow-hidden'>
                  <img
                    src='/assets/hero-placeholder.webp'
                    alt='Browse all products'
                    className='w-full h-full object-cover transition-transform duration-700 group-hover:scale-105'
                    width='400'
                    height='500'
                    loading='lazy'
                    decoding='async'
                  />
                </div>
                <div className='p-8'>
                  <h3 className='text-2xl font-light text-gray-900 mb-2'>
                    All Products
                  </h3>
                  <p className='text-gray-600 mb-4'>
                    Browse our complete collection
                  </p>
                  <div className='flex items-center text-gray-900 font-medium group-hover:translate-x-2 transition-transform duration-300'>
                    <span>Browse All</span>
                    <ArrowRight className='h-4 w-4 ml-2' />
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Lazy load non-critical components */}
      <Suspense fallback={<LoadingPlaceholder />}>
        {/* Featured Products Section */}
        {!isLoading && featuredProducts.length > 0 && (
          <FeaturedSection
            title='Trending Products'
            description='Handpicked items that are making waves in fashion'
            products={featuredProducts}
            viewAllLink='/shop'
            backgroundColor='gray'
            limit={4}
          />
        )}
      </Suspense>

      {/* FAQ Section - lazy loaded */}
      <Suspense fallback={<LoadingPlaceholder />}>
        <section id='faq' className='py-20 bg-white'>
          <FAQ
            title='Frequently Asked Questions'
            description='Everything you need to know about shopping with us'
            faqs={faqData}
          />
        </section>
      </Suspense>

      {/* Call to Action Section */}
      <section className='py-24 bg-gray-900 relative overflow-hidden'>
        {/* Subtle geometric background */}
        <div className='absolute inset-0 opacity-5'>
          <div className='absolute top-0 left-0 w-full h-full'>
            <div className='absolute top-20 left-20 w-32 h-32 border border-white/20 rounded-full'></div>
            <div className='absolute bottom-20 right-20 w-48 h-48 border border-white/10 rounded-full'></div>
            <div className='absolute top-1/2 left-1/3 w-24 h-24 border border-white/15 rounded-full'></div>
          </div>
        </div>

        <div className='container mx-auto px-4 relative z-10'>
          <div className='text-center max-w-4xl mx-auto'>
            <div className='inline-flex items-center bg-white/10 px-4 py-2 rounded-full border border-white/20 mb-8'>
              <div className='w-2 h-2 bg-white rounded-full mr-3'></div>
              <span className='text-white/90 text-sm font-medium tracking-wide'>
                JOIN THE COMMUNITY
              </span>
            </div>

            <h2 className='text-4xl md:text-5xl font-light text-white mb-6 leading-tight'>
              Elevate Your Style Journey
            </h2>
            <p className='text-xl text-white/70 mb-12 leading-relaxed max-w-2xl mx-auto'>
              Discover curated fashion that speaks to your individuality. Join
              our community of style enthusiasts.
            </p>

            <div className='flex flex-col sm:flex-row gap-6 justify-center items-center mb-16'>
              <Link
                href='/products'
                className='group bg-white text-gray-900 px-8 py-4 rounded-full font-medium text-lg hover:bg-gray-100 transition-all duration-300 transform hover:-translate-y-1 hover:shadow-2xl flex items-center'>
                Explore Collection
                <ArrowRight className='h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform' />
              </Link>

              <Link
                href='/about'
                className='group border border-white/30 text-white px-8 py-4 rounded-full font-medium text-lg hover:bg-white/10 hover:border-white/50 transition-all duration-300 transform hover:-translate-y-1 flex items-center'>
                Our Story
                <ArrowRight className='h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform' />
              </Link>
            </div>

            <div className='grid grid-cols-1 md:grid-cols-3 gap-12 text-white'>
              <div className='text-center group'>
                <div className='text-3xl font-light mb-2 group-hover:scale-110 transition-transform duration-300'>
                  50K+
                </div>
                <div className='text-white/60 text-sm tracking-wide'>
                  SATISFIED CUSTOMERS
                </div>
              </div>
              <div className='text-center group'>
                <div className='text-3xl font-light mb-2 group-hover:scale-110 transition-transform duration-300'>
                  1000+
                </div>
                <div className='text-white/60 text-sm tracking-wide'>
                  CURATED PIECES
                </div>
              </div>
              <div className='text-center group'>
                <div className='text-3xl font-light mb-2 group-hover:scale-110 transition-transform duration-300'>
                  24/7
                </div>
                <div className='text-white/60 text-sm tracking-wide'>
                  EXPERT SUPPORT
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className='bg-white border-t border-gray-100'>
        <div className='container mx-auto px-4 py-16'>
          <div className='grid grid-cols-1 md:grid-cols-4 gap-12 mb-12'>
            {/* Brand Section */}
            <div className='md:col-span-2'>
              <div className='flex items-center mb-6'>
                <div className='w-8 h-8 bg-gray-900 rounded-lg mr-3 flex items-center justify-center'>
                  <span className='text-white font-bold text-sm'>L</span>
                </div>
                <span className='text-2xl font-light text-gray-900'>Lebsy</span>
              </div>
              <p className='text-gray-600 mb-8 max-w-md leading-relaxed'>
                Curating exceptional fashion experiences through thoughtful
                design and sustainable practices. Discover your authentic style.
              </p>
              <div className='flex space-x-4'>
                <Link
                  href='#'
                  className='w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-900 hover:text-white transition-all duration-300 group'>
                  <span className='sr-only'>Instagram</span>
                  <svg
                    aria-hidden='true'
                    className='w-4 h-4'
                    fill='currentColor'
                    viewBox='0 0 24 24'>
                    <path d='M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z' />
                  </svg>
                </Link>
                <Link
                  href='#'
                  className='w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-900 hover:text-white transition-all duration-300 group'>
                  <span className='sr-only'>Twitter</span>
                  <svg
                    aria-hidden='true'
                    className='w-4 h-4'
                    fill='currentColor'
                    viewBox='0 0 24 24'>
                    <path d='M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z' />
                  </svg>
                </Link>
                <Link
                  href='#'
                  className='w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-900 hover:text-white transition-all duration-300 group'>
                  <span className='sr-only'>Facebook</span>
                  <svg
                    aria-hidden='true'
                    className='w-4 h-4'
                    fill='currentColor'
                    viewBox='0 0 24 24'>
                    <path d='M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z' />
                  </svg>
                </Link>
              </div>
            </div>

            {/* Collections */}
            <div>
              <h3 className='text-sm font-medium text-gray-900 mb-6 tracking-wide'>
                COLLECTIONS
              </h3>
              <ul className='space-y-4'>
                <li>
                  <Link
                    href='/shop'
                    className='text-gray-600 hover:text-gray-900 transition-colors text-sm'>
                    All Products
                  </Link>
                </li>
                <li>
                  <Link
                    href='/shop'
                    className='text-gray-600 hover:text-gray-900 transition-colors text-sm'>
                    New Arrivals
                  </Link>
                </li>
                <li>
                  <Link
                    href='/shop'
                    className='text-gray-600 hover:text-gray-900 transition-colors text-sm'>
                    Best Sellers
                  </Link>
                </li>
                <li>
                  <Link
                    href='/about'
                    className='text-gray-600 hover:text-gray-900 transition-colors text-sm'>
                    About
                  </Link>
                </li>
              </ul>
            </div>

            {/* Support */}
            <div>
              <h3 className='text-sm font-medium text-gray-900 mb-6 tracking-wide'>
                SUPPORT
              </h3>
              <ul className='space-y-4'>
                <li>
                  <Link
                    href='/contact'
                    className='text-gray-600 hover:text-gray-900 transition-colors text-sm'>
                    Contact
                  </Link>
                </li>
                <li>
                  <Link
                    href='/shipping'
                    className='text-gray-600 hover:text-gray-900 transition-colors text-sm'>
                    Shipping
                  </Link>
                </li>
                <li>
                  <Link
                    href='/returns'
                    className='text-gray-600 hover:text-gray-900 transition-colors text-sm'>
                    Returns
                  </Link>
                </li>
                <li>
                  <Link
                    href='/size-guide'
                    className='text-gray-600 hover:text-gray-900 transition-colors text-sm'>
                    Size Guide
                  </Link>
                </li>
                <li>
                  <Link
                    href='#faq'
                    className='text-gray-600 hover:text-gray-900 transition-colors text-sm'>
                    FAQ
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom Section */}
          <div className='border-t border-gray-100 pt-8'>
            <div className='flex flex-col md:flex-row justify-between items-center'>
              <p className='text-gray-500 text-sm mb-4 md:mb-0'>
                © 2024 Lebsy. All rights reserved.
              </p>
              <div className='flex space-x-8 text-sm'>
                <Link
                  href='/privacy'
                  className='text-gray-500 hover:text-gray-900 transition-colors'>
                  Privacy
                </Link>
                <Link
                  href='/terms'
                  className='text-gray-500 hover:text-gray-900 transition-colors'>
                  Terms
                </Link>
                <Link
                  href='/cookies'
                  className='text-gray-500 hover:text-gray-900 transition-colors'>
                  Cookies
                </Link>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
