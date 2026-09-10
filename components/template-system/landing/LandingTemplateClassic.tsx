import type React from "react";
import { Button } from "#root/components/ui/button";
import { Card, CardContent } from "#root/components/ui/card";
import { Badge } from "#root/components/ui/badge";
import { HomeFeaturedProducts } from "../home/HomeFeaturedProducts";
import type { FeaturedProduct } from "../home/HomeFeaturedProducts";
import type { CategoryStripItem } from "#root/components/shop/CategoryStrip";
import {
  NewArrivals,
  type NewArrivalProduct,
} from "#root/components/shop/NewArrivals";
import {
  ArrowRight,
  CheckCircle,
  Star,
  ShoppingBag,
} from "lucide-react";
import type {
  HomepageContent,
} from "#root/shared/types/homepage-content";
import { VALUE_PROP_ICON_MAP as ICON_MAP } from "#root/components/template-system/shared/value-prop-icons";

/**
 * Props for the LandingTemplateClassic component
 */
export interface LandingTemplateClassicProps {
  /**
   * Homepage content (editable by merchants)
   */
  content: HomepageContent;

  /**
   * Featured products data (fetched dynamically)
   */
  featuredProducts?: FeaturedProduct[];

  /**
   * Discounted / on-sale products
   */
  discountedProducts?: FeaturedProduct[];

  /**
   * New arrivals products (latest added)
   */
  newArrivals?: NewArrivalProduct[];

  /**
   * Loading state for new arrivals
   */
  newArrivalsLoading?: boolean;

  /**
   * Categories data
   */
  categories?: CategoryStripItem[];

  /**
   * Loading state for categories
   */
  categoriesLoading?: boolean;

  /**
   * Additional CSS classes
   */
  className?: string;

  /**
   * Callback when any CTA button is clicked
   */
  onCtaClick?: (link: string) => void;
}

/**
 * Classic Commerce-First Landing Page Template
 *
 * A traditional e-commerce homepage featuring:
 * - Clean hero with centered content
 * - Prominent category showcase
 * - Featured products grid
 * - Trust badges and value propositions
 * - Newsletter subscription
 * - Professional, conversion-focused layout
 *
 * Perfect for: General e-commerce, established brands, traditional retail
 */
export function LandingTemplateClassic({
  content,
  featuredProducts,
  discountedProducts,
  newArrivals,
  newArrivalsLoading = false,
  categories,
  categoriesLoading = false,
  className = "",
  onCtaClick,
}: LandingTemplateClassicProps) {
  const handleCtaClick =
    (link: string) => (e: React.MouseEvent<HTMLButtonElement>) => {
      if (onCtaClick) {
        e.preventDefault();
        onCtaClick(link);
      }
    };

  return (
    <div className={`landing-template-classic ${className}`}>
      {/* Promotional Banner */}
      {content.promoBanner.enabled && (
        <div className='bg-stone-900 text-white py-2.5 px-4 text-center'>
          <p className='text-[11px] uppercase tracking-[0.25em] font-light'>
            {content.promoBanner.text}
            {content.promoBanner.linkText && content.promoBanner.linkUrl && (
              <>
                {" "}
                <a
                  href={content.promoBanner.linkUrl}
                  className='underline font-light hover:text-stone-300 transition-colors'>
                  {content.promoBanner.linkText}
                </a>
              </>
            )}
          </p>
        </div>
      )}

      {/* Hero Section */}
      {content.hero.enabled && (
        <section className='relative bg-white border-b border-gray-200'>
          <div className='container mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24'>
            <div className='max-w-4xl mx-auto text-center'>
              <h1 className='text-5xl lg:text-7xl font-light text-stone-900 leading-[1.05] tracking-tight mb-8'>
                {content.hero.title}
              </h1>

              <p className='text-base lg:text-lg text-stone-600 font-light leading-relaxed mb-10 max-w-md mx-auto'>
                {content.hero.subtitle}
              </p>

              <div className='flex flex-col sm:flex-row gap-4 justify-center'>
                <Button
                  variant='primary'
                  size='lg'
                  onClick={handleCtaClick(content.hero.ctaLink)}
                  asChild={!onCtaClick}>
                  {onCtaClick ? (
                    <>
                      {content.hero.ctaText}
                      <ArrowRight className='ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform' />
                    </>
                  ) : (
                    <a href={content.hero.ctaLink}>
                      {content.hero.ctaText}
                      <ArrowRight className='ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform' />
                    </a>
                  )}
                </Button>

                {content.categories.enabled && (
                  <Button
                    variant='secondary'
                    size='lg'
                    onClick={handleCtaClick(content.categories.ctaLink)}
                    asChild={!onCtaClick}>
                    {onCtaClick ? (
                      <>{content.categories.ctaText}</>
                    ) : (
                      <a href={content.categories.ctaLink}>
                        {content.categories.ctaText}
                      </a>
                    )}
                  </Button>
                )}
              </div>

              {/* Trust Indicators */}
              <div className='mt-12 flex flex-wrap justify-center items-center gap-6 text-sm text-gray-600'>
                <div className='flex items-center gap-2'>
                  <CheckCircle className='w-5 h-5 text-green-600' />
                  <span>Free Shipping</span>
                </div>
                <div className='flex items-center gap-2'>
                  <CheckCircle className='w-5 h-5 text-green-600' />
                  <span>Secure Payment</span>
                </div>
                <div className='flex items-center gap-2'>
                  <CheckCircle className='w-5 h-5 text-green-600' />
                  <span>Easy Returns</span>
                </div>
                <div className='flex items-center gap-2'>
                  <Star className='w-5 h-5 text-yellow-500 fill-yellow-500' />
                  <span>Trusted by 10,000+ Customers</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Categories Section */}
      {content.categories.enabled && (
        <section className='py-12 sm:py-16 lg:py-20 bg-gray-50'>
          <div className='container mx-auto px-4 sm:px-6 lg:px-8'>
            <div className='text-center mb-12'>
              <h2 className='text-3xl lg:text-5xl font-light text-stone-900 leading-[1.15] tracking-tight mb-4'>
                {content.categories.title}
              </h2>
              <p className='text-base lg:text-lg text-stone-600 font-light leading-relaxed max-w-md mx-auto'>
                {content.categories.subtitle}
              </p>
            </div>

            {categories && categories.length > 0 ? (
              <div className='grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 mb-8'>
                {categories.map((cat) => {
                  const resolvedImage = cat.imageUrl?.startsWith("http")
                    ? cat.imageUrl
                    : cat.imageUrl
                      ? `/uploads/${cat.imageUrl}`
                      : null;
                  return (
                    <a
                      key={cat.id}
                      href={`/categories/${cat.slug}`}
                      className='group'>
                      <Card className='group-hover:shadow-lg transition-all duration-300 border-2 group-hover:border-stone-600 overflow-hidden'>
                        {resolvedImage && (
                          <div className='aspect-square overflow-hidden'>
                            <img
                              src={resolvedImage}
                              alt={cat.name}
                              className='w-full h-full object-cover transition-transform duration-500 group-hover:scale-105'
                            />
                          </div>
                        )}
                        <CardContent className='p-4 text-center'>
                          {!resolvedImage && (
                            <div className='w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-stone-100 to-stone-200 rounded-full flex items-center justify-center'>
                              <ShoppingBag className='w-8 h-8 text-stone-600' />
                            </div>
                          )}
                          <h3 className='font-semibold text-gray-900 group-hover:text-stone-700 transition-colors'>
                            {cat.name}
                          </h3>
                        </CardContent>
                      </Card>
                    </a>
                  );
                })}
              </div>
            ) : categoriesLoading ? (
              <div className='grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 mb-8'>
                {Array.from({ length: 4 }, (_, i) => (
                  <Card key={i} className='animate-pulse'>
                    <CardContent className='p-6 text-center'>
                      <div className='w-16 h-16 mx-auto mb-4 bg-stone-200 rounded-full' />
                      <div className='h-4 bg-stone-200 rounded w-24 mx-auto' />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      )}

      {/* Value Propositions */}
      {content.valueProps.enabled && content.valueProps.items.length > 0 && (
        <section className='py-12 sm:py-16 lg:py-20 bg-white border-y border-gray-200'>
          <div className='container mx-auto px-4 sm:px-6 lg:px-8'>
            <div className='grid grid-cols-1 md:grid-cols-3 gap-8'>
              {content.valueProps.items.map((item, index) => {
                const IconComponent = ICON_MAP[item.icon];
                return (
                  <div key={index} className='flex items-start gap-4'>
                    <div className='flex-shrink-0 w-12 h-12 flex items-center justify-center text-stone-700'>
                      <IconComponent className='w-6 h-6' />
                    </div>
                    <div>
                      <h3 className='text-xl lg:text-2xl font-normal text-stone-900 leading-snug mb-2'>
                        {item.title}
                      </h3>
                      <p className='text-gray-600 text-sm leading-relaxed'>
                        {item.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* New Arrivals Section */}
      {(newArrivalsLoading || (newArrivals && newArrivals.length > 0)) && content.newArrivals?.enabled !== false && (
        <section className='py-12 sm:py-16 lg:py-20 bg-white'>
          <div className='container mx-auto px-4 sm:px-6 lg:px-8'>
            <div className='flex items-end justify-between mb-10'>
              <div>
                <h2 className='text-3xl lg:text-5xl font-light text-stone-900 leading-[1.15] tracking-tight mb-2'>
                  {content.newArrivals?.title || "New Arrivals"}
                </h2>
              </div>
              <a
                href={`${content.newArrivals?.viewAllLink || '/shop'}${(content.newArrivals?.viewAllLink || '/shop').includes('?') ? '&' : '?'}section=newarrivals`}
                className='text-sm text-stone-600 hover:text-stone-900 font-light transition-colors flex items-center gap-1'>
                {content.newArrivals?.viewAllText || "View All"}
                <ArrowRight className='w-4 h-4' />
              </a>
            </div>
            <NewArrivals
              products={newArrivals}
              isLoading={newArrivalsLoading}
              showHeader={false}
            />
          </div>
        </section>
      )}

      {/* Discounted Products Section */}
      {content.discountedProducts?.enabled && discountedProducts && discountedProducts.length > 0 && (
        <section className='py-12 sm:py-16 lg:py-20 bg-gray-50'>
          <div className='container mx-auto px-4 sm:px-6 lg:px-8'>
            <div className='flex items-end justify-between mb-10'>
              <div>
                <h2 className='text-3xl lg:text-5xl font-light text-stone-900 leading-[1.15] tracking-tight mb-2'>
                  {content.discountedProducts.title}
                </h2>
              </div>
              <Button
                variant='tertiary'
                size='md'
                onClick={handleCtaClick(`${content.discountedProducts.viewAllLink || '/shop'}${(content.discountedProducts.viewAllLink || '/shop').includes('?') ? '&' : '?'}section=offers`)}
                asChild={!onCtaClick}>
                {onCtaClick ? (
                  <>
                    {content.discountedProducts.viewAllText || "View All"}
                    <ArrowRight className='ml-1 w-4 h-4 group-hover:translate-x-1 transition-transform' />
                  </>
                ) : (
                  <a href={`${content.discountedProducts.viewAllLink || '/shop'}${(content.discountedProducts.viewAllLink || '/shop').includes('?') ? '&' : '?'}section=offers`}>
                    {content.discountedProducts.viewAllText || "View All"}
                    <ArrowRight className='ml-1 w-4 h-4 group-hover:translate-x-1 transition-transform' />
                  </a>
                )}
              </Button>
            </div>
            <HomeFeaturedProducts
              title=''
              products={discountedProducts}
              showViewAllButton={false}
            />
          </div>
        </section>
      )}

      {/* Featured Products */}
      {content.featuredProducts.enabled && (
        <section className='py-12 sm:py-16 lg:py-20 bg-gray-50'>
          <div className='container mx-auto px-4 sm:px-6 lg:px-8'>
            <div className='flex items-end justify-between mb-10'>
              <div>
                <h2 className='text-3xl lg:text-5xl font-light text-stone-900 leading-[1.15] tracking-tight mb-2'>
                  {content.featuredProducts.title}
                </h2>
                <p className='text-base lg:text-lg text-stone-600 font-light leading-relaxed'>
                  {content.featuredProducts.subtitle}
                </p>
              </div>
              <Button
                variant='tertiary'
                size='md'
                onClick={handleCtaClick(`${content.featuredProducts.viewAllLink || '/shop'}${(content.featuredProducts.viewAllLink || '/shop').includes('?') ? '&' : '?'}section=featured`)}
                asChild={!onCtaClick}>
                {onCtaClick ? (
                  <>
                    {content.featuredProducts.viewAllText}
                    <ArrowRight className='ml-1 w-4 h-4 group-hover:translate-x-1 transition-transform' />
                  </>
                ) : (
                  <a href={`${content.featuredProducts.viewAllLink || '/shop'}${(content.featuredProducts.viewAllLink || '/shop').includes('?') ? '&' : '?'}section=featured`}>
                    {content.featuredProducts.viewAllText}
                    <ArrowRight className='ml-1 w-4 h-4 group-hover:translate-x-1 transition-transform' />
                  </a>
                )}
              </Button>
            </div>

            <HomeFeaturedProducts
              title=''
              products={featuredProducts}
              showViewAllButton={false}
            />

            <div className='text-center mt-8 sm:hidden'>
              <Button
                variant='secondary'
                size='md'
                className='w-full'
                onClick={handleCtaClick(`${content.featuredProducts.viewAllLink || '/shop'}${(content.featuredProducts.viewAllLink || '/shop').includes('?') ? '&' : '?'}section=featured`)}
                asChild={!onCtaClick}>
                {onCtaClick ? (
                  <>{content.featuredProducts.viewAllText}</>
                ) : (
                  <a href={`${content.featuredProducts.viewAllLink || '/shop'}${(content.featuredProducts.viewAllLink || '/shop').includes('?') ? '&' : '?'}section=featured`}>
                    {content.featuredProducts.viewAllText}
                  </a>
                )}
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Newsletter Section */}
      {content.newsletter.enabled && (
        <section className='py-12 sm:py-16 lg:py-20 bg-white'>
          <div className='container mx-auto px-4 sm:px-6 lg:px-8'>
            <Card className='border border-stone-200 shadow-none'>
              <CardContent className='p-8 sm:p-12'>
                <div className='max-w-2xl mx-auto text-center'>
                  <h2 className='text-3xl lg:text-5xl font-light text-stone-900 leading-[1.15] tracking-tight mb-4'>
                    {content.newsletter.title}
                  </h2>
                  <p className='text-base lg:text-lg text-stone-600 font-light leading-relaxed mb-8'>
                    {content.newsletter.subtitle}
                  </p>

                  <form className='flex flex-col sm:flex-row gap-3'>
                    <input
                      type='email'
                      placeholder={content.newsletter.placeholderText}
                      className='flex-1 px-4 py-3 border border-stone-300 rounded-none focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-transparent'
                      required
                    />
                    <Button type='submit' variant='primary' size='md'>
                      {content.newsletter.ctaText}
                    </Button>
                  </form>

                  <p className='text-sm text-stone-600 font-light leading-relaxed mt-4'>
                    {content.newsletter.privacyText}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* Footer CTA */}
      {content.footerCta.enabled && (
        <section className='py-12 sm:py-16 lg:py-20 bg-stone-900 text-white'>
          <div className='container mx-auto px-4 sm:px-6 lg:px-8 text-center'>
            <h2 className='text-3xl lg:text-5xl font-light text-stone-50 leading-[1.15] tracking-tight mb-6'>
              {content.footerCta.title}
            </h2>
            <p className='text-base lg:text-lg text-stone-300 font-light leading-relaxed mb-8 max-w-md mx-auto'>
              {content.footerCta.subtitle}
            </p>

            <Button
              variant='primary-light'
              size='lg'
              onClick={handleCtaClick(content.footerCta.ctaLink)}
              asChild={!onCtaClick}>
              {onCtaClick ? (
                <>
                  {content.footerCta.ctaText}
                  <ArrowRight className='ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform' />
                </>
              ) : (
                <a href={content.footerCta.ctaLink}>
                  {content.footerCta.ctaText}
                  <ArrowRight className='ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform' />
                </a>
              )}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

LandingTemplateClassic.displayName = "LandingTemplateClassic";
