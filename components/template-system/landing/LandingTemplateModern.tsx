import { useEffect, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { HomeFeaturedProducts } from "../home/HomeFeaturedProducts";
import type { FeaturedProduct } from "../home/HomeFeaturedProducts";
import {
  ArrowRight,
  ChevronDown,
} from "lucide-react";
import type {
  HomepageContent,
} from "#root/shared/types/homepage-content";
import { VALUE_PROP_ICON_MAP as ICON_MAP } from "#root/components/template-system/shared/value-prop-icons";
import { CategoryStripSkeleton } from "#root/components/shop/CategoryStrip";
import type { CategoryStripItem } from "#root/components/shop/CategoryStrip";
import {
  NewArrivals,
  type NewArrivalProduct,
} from "#root/components/shop/NewArrivals";
import { TestimonialsSection } from "#root/components/template-system/shared/TestimonialsSection";

/**
 * Props for the LandingTemplateModern component
 */
export interface LandingTemplateModernProps {
  /**
   * Homepage content (editable by merchants)
   */
  content: HomepageContent;

  /**
   * Featured products data (fetched dynamically)
   */
  featuredProducts?: FeaturedProduct[];

  /**
   * Discounted products (used by minimal template)
   */
  discountedProducts?: FeaturedProduct[];

  /**
   * Categories data for popular categories section
   */
  categories?: CategoryStripItem[];

  /**
   * Loading state for categories
   */
  categoriesLoading?: boolean;

  /**
   * New arrivals products (latest added, fetched dynamically)
   */
  newArrivals?: NewArrivalProduct[];

  /**
   * Loading state for new arrivals
   */
  newArrivalsLoading?: boolean;

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
 * Modern Landing Page Template Component
 *
 * A complete landing page template featuring:
 * - Hero section with CTA
 * - Promotional banner (optional)
 * - Value propositions highlighting key features
 * - Categories section
 * - Featured products section
 * - Newsletter subscription (optional)
 * - Footer CTA (optional)
 * - Fully responsive design
 *
 * Content is fully customizable by merchants via HomepageContent
 */
export function LandingTemplateModern({
  content,
  featuredProducts,
  discountedProducts,
  categories,
  categoriesLoading = false,
  newArrivals,
  newArrivalsLoading = false,
  className = "",
  onCtaClick,
}: LandingTemplateModernProps) {
  const handleCtaClick =
    (link: string) => (e: MouseEvent<HTMLButtonElement>) => {
      if (onCtaClick) {
        e.preventDefault();
        onCtaClick(link);
      }
    };

  // Hide the global footer's newsletter when this template has its own
  const hasNewsletter = content.newsletter.enabled;
  useEffect(() => {
    if (!hasNewsletter) return;
    document.documentElement.dataset.hasTemplateNewsletter = "true";
    return () => {
      delete document.documentElement.dataset.hasTemplateNewsletter;
    };
  }, [hasNewsletter]);

  // Portal target lives inside the global navbar chrome (above the navbar)
  // so the promo banner stacks correctly as fixed chrome instead of being
  // overlaid by the fixed navbar.
  const [bannerSlot, setBannerSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const findSlot = () =>
      setBannerSlot(document.getElementById("chrome-banner-slot"));
    findSlot();
    // Slot may mount slightly after this effect — observe document for it.
    const obs = new MutationObserver(findSlot);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);

  const promoBannerNode = (() => {
    if (!content.promoBanner.enabled) return null;
    const text = content.promoBanner.text?.trim() ?? "";
    const linkText = content.promoBanner.linkText?.trim() ?? "";
    const linkUrl = content.promoBanner.linkUrl?.trim() ?? "";
    const hasLink = linkText && linkUrl;
    // Don't render an empty bar (or one that's just a dangling em-dash).
    if (!text && !hasLink) return null;

    return (
      <div className='w-full bg-neutral-900 text-white text-xs sm:text-sm'>
        <div className='max-w-7xl mx-auto px-4 py-2 sm:py-2.5 text-center leading-tight tracking-wide'>
          {text}
          {text && hasLink && " — "}
          {hasLink && (
            <a
              href={linkUrl}
              className='underline underline-offset-2 hover:no-underline whitespace-nowrap'>
              {linkText}
            </a>
          )}
        </div>
      </div>
    );
  })();

  return (
    <div className={`landing-template-modern ${className}`}>
      {/* Promotional banner is portaled into the global chrome (above the navbar).
          Falls back to inline rendering during SSR / before the slot mounts. */}
      {promoBannerNode &&
        (bannerSlot ? createPortal(promoBannerNode, bannerSlot) : null)}

      {/* Hero Section — Editorial Bottom-Left Layout */}
      {content.hero.enabled && (
        <section className='relative h-[80vh] md:h-screen bg-stone-900 overflow-hidden'>
          {/* Full-bleed Background Image with mobile variant */}
          <div className='absolute inset-0 h-full w-full'>
            {content.hero.backgroundImage ? (
              <picture className='block h-full w-full'>
                <source
                  media='(max-width: 640px)'
                  srcSet={
                    content.hero.mobileBackgroundImage ||
                    content.hero.backgroundImage
                  }
                />
                <img
                  src={content.hero.backgroundImage}
                  alt='Featured collection'
                  className='absolute inset-0 h-full w-full object-cover'
                />
              </picture>
            ) : (
              <div className='h-full w-full bg-stone-800' />
            )}
          </div>

          {/* Gradient Overlay */}
          <div className='absolute inset-0 h-full w-full bg-linear-to-t from-black/60 via-black/20 to-transparent' />

          {/* Content — anchored bottom-left */}
          <div className='absolute inset-0 z-10 flex items-end max-sm:text-center'>
            <div className='w-full max-w-2xl p-6 pb-16 sm:p-8 sm:pb-20 md:p-16 space-y-4 md:space-y-5'>
              <h1 className='text-4xl sm:text-5xl md:text-7xl font-light tracking-wide text-white leading-[1.08]'>
                {content.hero.title}
              </h1>

              <p className='text-lg md:text-xl text-white/80 max-w-md'>
                {content.hero.subtitle}
              </p>

              <div className='pt-2'>
                {onCtaClick ? (
                  <button
                    type='button'
                    onClick={handleCtaClick(content.hero.ctaLink)}
                    className='inline-flex items-center rounded-full bg-white text-stone-900 px-8 py-3 text-sm font-medium tracking-wide hover:scale-105 transition-transform duration-300'>
                    {content.hero.ctaText}
                  </button>
                ) : (
                  <a
                    href={content.hero.ctaLink}
                    className='inline-flex items-center rounded-full bg-white text-stone-900 px-8 py-3 text-sm font-medium tracking-wide hover:scale-105 transition-transform duration-300'>
                    {content.hero.ctaText}
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Scroll indicator */}
          <div className='absolute bottom-6 left-1/2 -translate-x-1/2 z-10'>
            <ChevronDown className='w-5 h-5 text-white/60 animate-bounce' />
          </div>
        </section>
      )}

      {/* Testimonials — placed immediately after hero */}
      <TestimonialsSection
        testimonials={content.testimonials}
        variant='modern'
        locale='en'
      />

      {/* Discounted Products Section — placed right after testimonials */}
      {content.discountedProducts?.enabled &&
        discountedProducts &&
        discountedProducts.length > 0 && (
          <section className='py-16 md:py-24 bg-neutral-50'>
            <div className='container mx-auto px-6 sm:px-8 lg:px-12'>
              <p className='text-xs tracking-[0.2em] text-neutral-400 uppercase'>
                Offers
              </p>
              <div className='flex justify-between items-end mt-2'>
                <h2 className='text-2xl font-light'>
                  {content.discountedProducts.title}
                </h2>
                <a
                  href={`${content.discountedProducts.viewAllLink || "/shop"}${(content.discountedProducts.viewAllLink || "/shop").includes("?") ? "&" : "?"}section=offers`}
                  className='text-sm text-neutral-500 hover:text-neutral-900 transition-colors duration-300'>
                  {content.discountedProducts.viewAllText || "View All"}{" "}
                  <ArrowRight className='inline w-4 h-4 ml-1' />
                </a>
              </div>
              <div className='mt-10 [&>section]:bg-transparent [&>section]:py-0 [&>section>div]:px-0 [&>section>div]:mx-0 [&>section>div]:max-w-none [&>section>div>.text-center]:hidden [&_.grid]:xl:grid-cols-3 [&_.grid]:gap-8 [&_.grid]:mb-0'>
                <HomeFeaturedProducts
                  title=''
                  products={discountedProducts}
                  showViewAllButton={false}
                  maxProducts={6}
                />
              </div>
            </div>
          </section>
        )}

      {/* Categories Section — Asymmetric Grid */}
      {categoriesLoading ? (
        <CategoryStripSkeleton />
      ) : categories && categories.length > 0 ? (
        <section className='py-20 md:py-28 bg-white'>
          <div className='container mx-auto px-6 sm:px-8 lg:px-12'>
            <p className='text-xs tracking-[0.2em] text-neutral-400 uppercase mb-8'>
              {content.categories.title || "Shop by Category"}
            </p>

            <div className='flex overflow-x-auto snap-x snap-mandatory scroll-smooth -mx-6 px-6 pb-2 gap-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-2 lg:grid-cols-3 md:overflow-visible md:snap-none md:mx-0 md:px-0 md:pb-0'>
              {categories.map((cat, i) => {
                const resolvedImage = cat.imageUrl?.startsWith("http")
                  ? cat.imageUrl
                  : cat.imageUrl
                    ? `/uploads/${cat.imageUrl}`
                    : null;

                return (
                  <a
                    key={cat.id}
                    href={`/categories/${cat.slug}`}
                    className={`group relative overflow-hidden min-h-62.5 md:min-h-75 snap-start shrink-0 basis-[75%] sm:basis-[55%] md:basis-auto md:shrink md:snap-align-none ${
                      i === 0 ? "md:row-span-2 md:min-h-0" : ""
                    }`}>
                    {/* Background image */}
                    {resolvedImage ? (
                      <img
                        src={resolvedImage}
                        alt={cat.name}
                        className='absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105'
                      />
                    ) : (
                      <div className='absolute inset-0 bg-neutral-200' />
                    )}

                    {/* Overlay */}
                    <div className='absolute inset-0 bg-linear-to-t from-black/50 to-transparent transition-colors duration-300 group-hover:from-black/40' />

                    {/* Label */}
                    <div className='absolute bottom-0 left-0 p-6'>
                      <h3 className='text-xl font-light text-white'>
                        {cat.name}
                      </h3>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {/* Brand Statement Section — Magazine Spread */}
      {content.brandStatement.enabled && (
        <section className='bg-stone-50'>
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-0'>
            {/* Image — shown first on mobile, right on desktop */}
            <div className='relative h-100 lg:h-auto lg:min-h-150 order-first lg:order-last'>
              {content.brandStatement.image ? (
                <img
                  src={content.brandStatement.image}
                  alt={content.brandStatement.title}
                  className='absolute inset-0 h-full w-full object-cover'
                />
              ) : (
                <div className='absolute inset-0 bg-stone-200 flex items-center justify-center text-stone-400 text-sm'>
                  Image placeholder
                </div>
              )}
            </div>

            {/* Text */}
            <div className='flex items-center p-12 md:p-20'>
              <div className='max-w-lg'>
                <p className='text-xs tracking-[0.2em] text-neutral-400 uppercase mb-6'>
                  Our Story
                </p>
                <h2 className='text-3xl md:text-4xl font-light leading-tight'>
                  {content.brandStatement.title}
                </h2>
                <p className='text-base text-neutral-600 leading-relaxed mt-6 max-w-lg'>
                  {content.brandStatement.description}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Value Propositions — Trust Strip */}
      {content.valueProps.enabled && content.valueProps.items.length > 0 && (
        <section className='py-8 border-y border-neutral-100 bg-white'>
          <div className='container mx-auto px-6 sm:px-8 lg:px-12'>
            {/* Mobile: 2-col grid */}
            <div className='grid grid-cols-2 gap-6 md:hidden'>
              {content.valueProps.items.map((item, index) => {
                const IconComponent = ICON_MAP[item.icon];
                return (
                  <div key={index} className='flex items-center gap-3'>
                    <IconComponent className='w-5 h-5 text-neutral-400 stroke-[1.5] shrink-0' />
                    <span className='text-sm font-medium'>{item.title}</span>
                  </div>
                );
              })}
            </div>

            {/* Desktop: horizontal row with dividers */}
            <div className='hidden md:flex justify-center items-center gap-12 lg:gap-16'>
              {content.valueProps.items.map((item, index) => {
                const IconComponent = ICON_MAP[item.icon];
                const isLast = index === content.valueProps.items.length - 1;
                return (
                  <div key={index} className='flex items-center gap-3'>
                    <IconComponent className='w-5 h-5 text-neutral-400 stroke-[1.5] shrink-0' />
                    <span className='text-sm font-medium'>{item.title}</span>
                    {!isLast && (
                      <div className='ml-12 lg:ml-16 h-4 border-r border-neutral-200' />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* New Arrivals Section */}
      {(newArrivalsLoading || (newArrivals && newArrivals.length > 0)) &&
        content.newArrivals?.enabled !== false && (
          <section className='py-16 md:py-24 bg-white'>
            <div className='container mx-auto px-6 sm:px-8 lg:px-12'>
              <p className='text-xs tracking-[0.2em] text-neutral-400 uppercase'>
                New Arrivals
              </p>
              <div className='flex justify-between items-end mt-2'>
                <h2 className='text-2xl font-light'>
                  {content.newArrivals?.title || "Just Landed"}
                </h2>
                <a
                  href={`${content.newArrivals?.viewAllLink || "/shop"}${(content.newArrivals?.viewAllLink || "/shop").includes("?") ? "&" : "?"}section=newarrivals`}
                  className='text-sm text-neutral-500 hover:text-neutral-900 transition-colors duration-300'>
                  {content.newArrivals?.viewAllText || "View All"}{" "}
                  <ArrowRight className='inline w-4 h-4 ml-1' />
                </a>
              </div>
              <div className='mt-10'>
                <NewArrivals
                  products={newArrivals}
                  isLoading={newArrivalsLoading}
                  showHeader={false}
                />
              </div>
            </div>
          </section>
        )}

      {/* Featured Products Section */}
      {content.featuredProducts.enabled && (
        <section className='py-16 md:py-24 bg-neutral-50'>
          <div className='container mx-auto px-6 sm:px-8 lg:px-12'>
            <p className='text-xs tracking-[0.2em] text-neutral-400 uppercase'>
              {"Editor's Picks"}
            </p>
            <div className='flex justify-between items-end mt-2'>
              <h2 className='text-2xl font-light'>
                {content.featuredProducts.title}
              </h2>
              <a
                href={`${content.featuredProducts.viewAllLink || "/shop"}${(content.featuredProducts.viewAllLink || "/shop").includes("?") ? "&" : "?"}section=featured`}
                className='text-sm text-neutral-500 hover:text-neutral-900 transition-colors duration-300'>
                {content.featuredProducts.viewAllText || "View All"}{" "}
                <ArrowRight className='inline w-4 h-4 ml-1' />
              </a>
            </div>

            <div className='mt-10 [&>section]:bg-transparent [&>section]:py-0 [&>section>div]:px-0 [&>section>div]:mx-0 [&>section>div]:max-w-none [&>section>div>.text-center]:hidden [&_.grid]:xl:grid-cols-3 [&_.grid]:gap-8 [&_.grid]:mb-0'>
              <HomeFeaturedProducts
                title=''
                products={featuredProducts}
                showViewAllButton={false}
                maxProducts={6}
              />
            </div>

            <div className='text-center mt-12'>
              {onCtaClick ? (
                <button
                  type='button'
                  onClick={handleCtaClick(
                    `${content.featuredProducts.viewAllLink || "/shop"}${(content.featuredProducts.viewAllLink || "/shop").includes("?") ? "&" : "?"}section=featured`,
                  )}
                  className='inline-flex items-center rounded-full border border-neutral-900 text-neutral-900 hover:bg-neutral-900 hover:text-white px-8 py-3 text-sm font-medium tracking-wide transition-colors duration-300'>
                  View All Products
                </button>
              ) : (
                <a
                  href={`${content.featuredProducts.viewAllLink || "/shop"}${(content.featuredProducts.viewAllLink || "/shop").includes("?") ? "&" : "?"}section=featured`}
                  className='inline-flex items-center rounded-full border border-neutral-900 text-neutral-900 hover:bg-neutral-900 hover:text-white px-8 py-3 text-sm font-medium tracking-wide transition-colors duration-300'>
                  {content.featuredProducts.viewAllText || "View All Products"}
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Newsletter Section — Dark Closing Statement */}
      {content.newsletter.enabled && (
        <section className='bg-neutral-900 text-white py-16 md:py-24'>
          <div className='max-w-xl mx-auto text-center px-6 sm:px-8'>
            <h2 className='text-2xl md:text-3xl font-light'>
              {content.newsletter.title || "Join the Community"}
            </h2>
            {content.newsletter.subtitle && (
              <p className='text-neutral-400 mt-3 text-base'>
                {content.newsletter.subtitle}
              </p>
            )}

            <form
              onSubmit={(e) => e.preventDefault()}
              className='flex flex-col sm:flex-row gap-0 mt-8'>
              <input
                type='email'
                placeholder={
                  content.newsletter.placeholderText || "Your email address"
                }
                className='bg-transparent border border-neutral-700 text-white placeholder:text-neutral-500 px-4 py-3 flex-1 focus:border-white focus:outline-none transition-colors duration-300'
                required
              />
              <button
                type='submit'
                className='bg-white text-neutral-900 px-6 py-3 font-medium hover:bg-neutral-200 transition-colors duration-300'>
                {content.newsletter.ctaText || "Subscribe"}
              </button>
            </form>

            {content.newsletter.privacyText && (
              <p className='text-xs text-neutral-500 mt-4'>
                {content.newsletter.privacyText}
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

// Display name for debugging
LandingTemplateModern.displayName = "LandingTemplateModern";
