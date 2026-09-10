/**
 * @legacy
 * Legacy Template System (v1)
 * - Fully preserved for admin preview
 * - Not used in frontend rendering
 * - Used as a design asset library
 */

import { lazy, Suspense } from "react";
import { Button } from "#root/components/ui/button";
import { Link } from "#root/components/utils/Link";
import { ShoppingBag, Users, Store, ChevronRight } from "lucide-react";
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

interface DefaultHomeTemplateProps {
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
    <div className='w-12 h-12 rounded-full border-4 border-accent-lb'></div>
  </div>
);

export default function DefaultHomeTemplate({
  data,
}: DefaultHomeTemplateProps) {
  // Use provided data or fallback to empty state
  const featuredProducts = data?.featuredProducts || [];
  const isLoading = data?.isLoading || false;
  const error = data?.error || null;

  // Preload critical images on component mount
  preloadImages();

  return (
    <main>
      {/* Hero Section */}
      <section className="hero-section relative h-[90vh] overflow-hidden bg-[url('/assets/landing.webp')] bg-cover bg-center">
        <div className='absolute inset-0 bg-gradient-to-r from-black/70 to-transparent z-[9]'></div>

        <div className='hero-content relative z-[9] container mx-auto h-full flex flex-col justify-center px-4'>
          <div className='bg-white/10 max-w-fit backdrop-blur-sm p-1 px-3 rounded-full inline-block mb-4 '>
            <span className='text-white text-sm font-medium'>
              New Season Collection
            </span>
          </div>
          <h1 className='text-4xl md:text-6xl max-w-xl font-bold text-white mb-6 leading-tight'>
            Discover Your Perfect Style
          </h1>
          <p className='text-gray-200 text-lg mb-8 max-w-lg'>
            Shop the latest trends from top brands and independent designers all
            in one place.
          </p>
          <div className='flex flex-wrap max-w-xl gap-4'>
            <Button
              asChild
              size='lg'
              className='bg-accent-lb hover:bg-white hover:text-accent-lb'>
              <Link href='/shop'>
                <ShoppingBag className='mr-2 h-5 w-5' />
                Shop Now
              </Link>
            </Button>
            <Button
              asChild
              variant='outline'
              size='lg'
              className='border-white text-foreground hover:bg-white hover:text-accent-lb'>
              <Link href='/shop'>
                <Store className='mr-2 h-5 w-5' />
                Browse All Products
              </Link>
            </Button>
          </div>
        </div>

        {/* Wave shape divider */}
        <div className='absolute bottom-0 left-0 right-0'>
          <svg
            xmlns='http://www.w3.org/2000/svg'
            viewBox='0 0 1440 100'
            className='w-full'
            aria-labelledby='wave-divider-title'>
            <title id='wave-divider-title'>
              Decorative wave shape divider at the bottom of the hero section
            </title>
            <path
              fill='#ffffff'
              fillOpacity='1'
              d='M0,64L80,69.3C160,75,320,85,480,80C640,75,800,53,960,48C1120,43,1280,53,1360,58.7L1440,64L1440,320L1360,320C1280,320,1120,320,960,320C800,320,640,320,480,320C320,320,160,320,80,320L0,320Z'></path>
          </svg>
        </div>
      </section>

      {/* About Section */}
      <section className='py-20 bg-accent-lb/5'>
        <div className='container mx-auto px-4'>
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-12 items-center'>
            <div className='relative rounded-xl overflow-hidden'>
              <img
                src='/assets/story.webp'
                alt='About Lebsy - Our fashion story'
                className='w-full h-auto rounded-xl'
                width='500'
                height='333'
                loading='lazy'
                decoding='async'
              />
            </div>

            <div className='max-w-xl'>
              <h2 className='text-3xl font-bold mb-6'>Our Story</h2>
              <p className='text-gray-600 mb-6'>
                We started with a simple idea: to make online shopping
                effortless. From our carefully curated product selection to our
                seamless checkout experience, everything is designed with you in
                mind.
              </p>
              <p className='text-gray-600 mb-8'>
                Our store offers a diverse selection of clothing and
                accessories, all in one convenient place. We prioritize quality,
                style, and customer satisfaction.
              </p>
              <Button
                asChild
                variant='outline'
                className='border-accent-lb text-accent-lb hover:bg-accent-lb hover:text-white'>
                <Link href='/shop'>
                  <Users className='mr-2 h-5 w-5' />
                  Browse Collection
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Categories Section */}
      <section className='py-20 bg-gray-50'>
        <div className='container mx-auto px-4'>
          <div className='text-center mb-12'>
            <h2 className='text-3xl font-bold mb-4'>Shop by Category</h2>
            <p className='text-gray-600 max-w-2xl mx-auto'>
              Browse our carefully curated collections across various categories
            </p>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
            {/* New Arrivals */}
            <div className='relative rounded-xl overflow-hidden group h-80 cursor-pointer'>
              <Link href='/shop' className='block h-full'>
                <div className='absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-[9]'></div>
                <img
                  src='/assets/hero-placeholder.webp'
                  alt='New arrivals collection'
                  className='absolute inset-0 w-full h-full object-cover'
                  width='400'
                  height='533'
                  loading='lazy'
                  decoding='async'
                />
                <div className='absolute bottom-0 left-0 right-0 p-6 z-[9]'>
                  <h3 className='text-2xl font-bold text-white mb-2'>
                    New Arrivals
                  </h3>
                  <div className='flex items-center text-white'>
                    <span className='text-sm'>Shop Collection</span>
                    <ChevronRight className='h-4 w-4 ml-1' />
                  </div>
                </div>
              </Link>
            </div>

            {/* Best Sellers */}
            <div className='relative rounded-xl overflow-hidden group h-80 cursor-pointer'>
              <Link href='/shop' className='block h-full'>
                <div className='absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-[9]'></div>
                <img
                  src='/assets/hero-placeholder.webp'
                  alt='Best sellers collection'
                  className='absolute inset-0 w-full h-full object-cover'
                  width='400'
                  height='533'
                  loading='lazy'
                  decoding='async'
                />
                <div className='absolute bottom-0 left-0 right-0 p-6 z-[9]'>
                  <h3 className='text-2xl font-bold text-white mb-2'>
                    Best Sellers
                  </h3>
                  <div className='flex items-center text-white'>
                    <span className='text-sm'>Shop Collection</span>
                    <ChevronRight className='h-4 w-4 ml-1' />
                  </div>
                </div>
              </Link>
            </div>

            {/* All Products */}
            <div className='relative rounded-xl overflow-hidden group h-80 cursor-pointer'>
              <Link href='/shop' className='block h-full'>
                <div className='absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-[9]'></div>
                <img
                  src='/assets/hero-placeholder.webp'
                  alt='Browse all products'
                  className='absolute inset-0 w-full h-full object-cover'
                  width='400'
                  height='533'
                  loading='lazy'
                  decoding='async'
                />
                <div className='absolute bottom-0 left-0 right-0 p-6 z-[9]'>
                  <h3 className='text-2xl font-bold text-white mb-2'>
                    All Products
                  </h3>
                  <div className='flex items-center text-white'>
                    <span className='text-sm'>Browse All</span>
                    <ChevronRight className='h-4 w-4 ml-1' />
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
            title='Featured Products'
            description='Our latest and most popular items carefully selected for you'
            products={featuredProducts}
            viewAllLink='/shop'
            backgroundColor='white'
            limit={4}
          />
        )}
      </Suspense>

      {/* FAQ Section - lazy loaded */}
      <Suspense fallback={<LoadingPlaceholder />}>
        <section id='faq' className='py-20 bg-white'>
          <FAQ
            title='Frequently Asked Questions'
            description='Find answers to common questions about shopping with Lebsey'
            faqs={faqData}
          />
        </section>
      </Suspense>

      {/* Call To Action */}
      <section className='relative py-20 overflow-hidden'>
        <div className='absolute inset-0 bg-accent-lb/90'></div>
        <img
          src='/assets/men-section.webp'
          alt='Decorative background image'
          className='absolute inset-0 w-full h-full object-cover opacity-10'
          aria-hidden='true'
          loading='lazy'
          width='800'
          height='600'
          fetchPriority='low'
        />

        <div className='relative z-[9] container mx-auto px-4 text-center'>
          <div>
            <h2 className='text-3xl md:text-4xl font-bold text-white mb-6'>
              Ready to elevate your style?
            </h2>
            <p className='text-white/90 text-lg mb-8 max-w-3xl mx-auto'>
              Join thousands of satisfied customers who have discovered their
              perfect style with Lebsy. Browse our collections today and find
              pieces that speak to you.
            </p>
            <Button
              asChild
              size='lg'
              className='bg-white text-accent-lb hover:bg-gray-100'>
              <Link href='/shop'>Shop Collections</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </main>
  );
}
