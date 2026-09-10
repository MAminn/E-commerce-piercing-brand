import { useState, useRef, useCallback, useEffect } from "react";
import type React from "react";
import { Link } from "#root/components/utils/Link";
import { Button } from "#root/components/ui/button";
import { HeroCarousel } from "#root/components/ui/hero-carousel";
import type { HeroSlide } from "#root/components/ui/hero-carousel";
import { MinimalProductCarousel } from "#root/components/template-system/minimal/MinimalProductCarousel";
import { QuickViewDialog } from "#root/components/template-system/minimal/QuickViewDialog";
import { TestimonialsSection } from "#root/components/template-system/shared/TestimonialsSection";
import type { MinimalProduct } from "#root/components/template-system/minimal/MinimalProductCard";
import { HomeFeaturedProducts } from "../home/HomeFeaturedProducts";
import { ScrollToProductsButton } from "#root/components/template-system/minimal/ScrollToProductsButton";
import type { FeaturedProduct } from "../home/HomeFeaturedProducts";
import type { CategoryStripItem } from "#root/components/shop/CategoryStrip";
import type { NewArrivalProduct } from "#root/components/shop/NewArrivals";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
} from "lucide-react";
import type {
  HomepageContent,
} from "#root/shared/types/homepage-content";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { VALUE_PROP_ICON_MAP as ICON_MAP } from "#root/components/template-system/shared/value-prop-icons";

/**
 * Props for the LandingTemplateMinimal component
 */
export interface LandingTemplateMinimalProps {
  content: HomepageContent;
  featuredProducts?: FeaturedProduct[];
  discountedProducts?: FeaturedProduct[];
  categories?: CategoryStripItem[];
  categoriesLoading?: boolean;
  newArrivals?: (NewArrivalProduct & {
    categories?: { id: string; name: string }[];
  })[];
  newArrivalsLoading?: boolean;
  className?: string;
  onCtaClick?: (link: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────

function resolveImageUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http")) return url;
  if (url.startsWith("/")) return url;
  return `/uploads/${url}`;
}

// ─── Category Carousel ───────────────────────────────────────────────

function CategoryCarousel({ categories }: { categories: CategoryStripItem[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [checkScroll, categories]);

  const scroll = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const card = el.querySelector("[data-cat-card]");
    const cardWidth = card?.clientWidth ?? 240;
    const gap = 24;
    const distance = (cardWidth + gap) * 2;
    el.scrollBy({
      left: direction === "right" ? distance : -distance,
      behavior: "smooth",
    });
  };

  return (
    <div className='relative'>
      <button
        onClick={() => scroll("left")}
        disabled={!canScrollLeft}
        className='absolute -start-2 top-1/2 -translate-y-1/2 z-10 hidden md:flex w-9 h-9 items-center justify-center border border-stone-200 bg-white hover:border-stone-900 disabled:opacity-20 disabled:cursor-not-allowed transition-colors'
        aria-label='Scroll left'>
        <ChevronLeft className='w-4 h-4' />
      </button>
      <button
        onClick={() => scroll("right")}
        disabled={!canScrollRight}
        className='absolute -end-2 top-1/2 -translate-y-1/2 z-10 hidden md:flex w-9 h-9 items-center justify-center border border-stone-200 bg-white hover:border-stone-900 disabled:opacity-20 disabled:cursor-not-allowed transition-colors'
        aria-label='Scroll right'>
        <ChevronRight className='w-4 h-4' />
      </button>

      <div
        ref={scrollRef}
        className='flex justify-center gap-4 sm:gap-6 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2 px-4'>
        {categories.map((cat) => {
          const imgSrc = resolveImageUrl(cat.imageUrl);
          return (
            <Link
              key={cat.id}
              href={`/categories/${cat.slug}`}
              data-cat-card
              className='group text-center flex-none w-[180px] sm:w-[220px] lg:w-[260px] snap-start'>
              <div className='aspect-[4/5] overflow-hidden bg-stone-50'>
                {imgSrc ? (
                  <img
                    src={imgSrc}
                    alt={cat.name}
                    className='w-full h-full object-cover transition-transform duration-500 group-hover:scale-105'
                    loading='lazy'
                  />
                ) : (
                  <div className='w-full h-full flex items-center justify-center bg-stone-100'>
                    <ShoppingBag className='w-12 h-12 text-stone-300' />
                  </div>
                )}
              </div>
              <h3 className='mt-3 text-sm sm:text-base font-normal text-stone-800 group-hover:text-stone-600 transition-colors'>
                {cat.name}
              </h3>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Minimal Landing Page — Commerce-First
 *
 * Inspired by matchperfumes.com. Image-heavy, clean, designed to sell:
 * - Scrolling marquee announcement bar
 * - Full-width hero image carousel
 * - Visual category grid with images
 * - Horizontal product carousels (Featured + New Arrivals)
 * - Full-width promotional banner
 * - Value propositions strip
 * - Newsletter + closing CTA
 */
export function LandingTemplateMinimal({
  content,
  featuredProducts = [],
  discountedProducts = [],
  categories = [],
  categoriesLoading = false,
  newArrivals = [],
  newArrivalsLoading = false,
  className = "",
  onCtaClick,
}: LandingTemplateMinimalProps) {
  const { t, locale } = useMinimalI18n();
  const [quickViewProduct, setQuickViewProduct] =
    useState<MinimalProduct | null>(null);

  const navigate = (link: string) => {
    if (onCtaClick) {
      onCtaClick(link);
    } else {
      window.location.href = link;
    }
  };

  // ─── Build hero slides from CMS ───
  // Priority: heroSlides array > legacy single backgroundImage
  const heroSlides: HeroSlide[] = (() => {
    // 1. Use heroSlides array if it has entries
    if (content.hero.heroSlides && content.hero.heroSlides.length > 0) {
      return content.hero.heroSlides.map((slide) => ({
        imageUrl: resolveImageUrl(slide.imageUrl) || "",
        mobileImageUrl: resolveImageUrl(slide.mobileImageUrl),
        linkUrl: slide.linkUrl,
        alt: slide.alt,
      }));
    }

    // 2. Fallback: build from legacy backgroundImage + brandStatement
    const slides: HeroSlide[] = [];
    if (content.hero.backgroundImage) {
      slides.push({
        imageUrl: resolveImageUrl(content.hero.backgroundImage) || "",
        mobileImageUrl: resolveImageUrl(content.hero.mobileBackgroundImage),
        linkUrl: content.hero.ctaLink,
        alt: content.hero.title,
      });
    }
    if (content.brandStatement.enabled && content.brandStatement.image) {
      slides.push({
        imageUrl: resolveImageUrl(content.brandStatement.image) || "",
        linkUrl: content.categories.ctaLink || "/shop",
        alt: content.brandStatement.title,
      });
    }
    return slides;
  })();

  // Convert newArrivals to MinimalProduct[] for the carousel
  const newArrivalProducts: MinimalProduct[] = newArrivals.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    price: p.price,
    discountPrice: p.discountPrice,
    stock: p.stock,
    imageUrl: p.imageUrl,
    images: p.images,
    categoryName: p.categoryName ?? undefined,
    available: p.available,
    categories: p.categories,
    isNew: true,
  }));

  // Convert featuredProducts to MinimalProduct[]
  const featuredMinimal: MinimalProduct[] = featuredProducts.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    price: p.price,
    discountPrice: p.discountPrice,
    stock: p.stock,
    imageUrl: p.imageUrl,
    images: p.images,
    categoryName: p.categoryName ?? undefined,
    available: p.available,
    categories: p.categories,
  }));

  // Convert discountedProducts to MinimalProduct[]
  const discountedMinimal: MinimalProduct[] = discountedProducts.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    price: p.price,
    discountPrice: p.discountPrice,
    stock: p.stock,
    imageUrl: p.imageUrl,
    images: p.images,
    categoryName: p.categoryName ?? undefined,
    available: p.available,
    categories: p.categories,
  }));

  return (
    <div className={`landing-template-minimal overflow-x-hidden bg-white ${className}`}>
      <ScrollToProductsButton targetId='home-products' />
      {/* ═══════════════════════════════════════════════
          2. HERO IMAGE CAROUSEL
          ═══════════════════════════════════════════════ */}
      {content.hero.enabled && heroSlides.length > 0 ? (
        <HeroCarousel slides={heroSlides} interval={5000} className="h-fit mt-24" />
      ) : content.hero.enabled ? (
        /* Fallback: text-only hero when no images are uploaded */
        <section className='relative min-h-[50vh] flex items-center justify-center bg-stone-100'>
          <div className='max-w-3xl mx-auto text-center px-6'>
            <h1 className='text-4xl sm:text-5xl lg:text-7xl font-light text-stone-900 mb-6 leading-[1.1] tracking-tight'>
              {content.hero.title}
            </h1>
            <p className='text-lg sm:text-xl text-stone-500 font-light mb-10 leading-relaxed'>
              {content.hero.subtitle}
            </p>
            <Button
              variant='primary'
              size='lg'
              onClick={() => navigate(content.hero.ctaLink)}
              asChild={!onCtaClick}>
              {onCtaClick ? (
                <>{content.hero.ctaText}</>
              ) : (
                <a href={content.hero.ctaLink}>{content.hero.ctaText}</a>
              )}
            </Button>
          </div>
        </section>
      ) : null}

      {/* ═══════════════════════════════════════════════
          3. CATEGORY GRID — Clean image + title (matchperfumes style)
          ═══════════════════════════════════════════════ */}
      {content.categories.enabled && (
        <section className='py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-8'>
          <div className='max-w-[1400px] mx-auto'>
            {/* Centred heading with underline */}
            <div className='text-center mb-10 sm:mb-14'>
              <h2 className='text-2xl sm:text-3xl lg:text-4xl font-light text-stone-900 tracking-tight inline-block relative pb-3'>
                {locale === "ar" && content.categories.titleAr
                  ? content.categories.titleAr
                  : content.categories.title}
                <span className='absolute bottom-0 left-1/4 right-1/4 h-[2px] bg-stone-900' />
              </h2>
            </div>

            {categoriesLoading ? (
              <div className='grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6'>
                {[...Array(4)].map((_, i) => (
                  <div key={i}>
                    <div className='aspect-[4/5] bg-stone-100 animate-pulse' />
                    <div className='h-4 bg-stone-100 animate-pulse mt-3 mx-auto w-24' />
                  </div>
                ))}
              </div>
            ) : categories.length > 0 ? (
              <CategoryCarousel categories={categories} />
            ) : (
              <div className='grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6'>
                {[
                  t("new_arrivals"),
                  t("featured"),
                  t("categories"),
                  t("on_sale"),
                ].map((label, i) => (
                  <div
                    key={i}
                    className='group text-center cursor-pointer'
                    onClick={() => navigate("/shop")}>
                    <div className='aspect-[4/5] bg-stone-100 flex items-center justify-center'>
                      <ShoppingBag className='w-12 h-12 text-stone-300' />
                    </div>
                    <h3 className='mt-3 text-sm sm:text-base font-normal text-stone-800'>
                      {label}
                    </h3>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════
          4. DISCOUNTED / ON-SALE PRODUCTS CAROUSEL
          ═══════════════════════════════════════════════ */}
      <div id='home-products' className='scroll-mt-24' />
      {content.discountedProducts?.enabled !== false &&
        discountedMinimal.length > 0 && (
          <MinimalProductCarousel
            products={discountedMinimal}
            title={
              locale === "ar" && content.discountedProducts?.titleAr
                ? content.discountedProducts.titleAr
                : content.discountedProducts?.title || t("on_sale")
            }
            viewAllHref={`${content.discountedProducts?.viewAllLink || "/shop"}${(content.discountedProducts?.viewAllLink || "/shop").includes("?") ? "&" : "?"}section=offers`}
            viewAllText={
              locale === "ar" && content.discountedProducts?.viewAllTextAr
                ? content.discountedProducts.viewAllTextAr
                : content.discountedProducts?.viewAllText || t("view_all")
            }
            className='bg-white'
            onQuickView={setQuickViewProduct}
          />
        )}

      {/* ═══════════════════════════════════════════════
          5. FEATURED PRODUCTS — Minimal card carousel
          ═══════════════════════════════════════════════ */}
      {content.featuredProducts.enabled && featuredMinimal.length > 0 && (
        <MinimalProductCarousel
          products={featuredMinimal}
          title={
            locale === "ar" && content.featuredProducts.titleAr
              ? content.featuredProducts.titleAr
              : content.featuredProducts.title
          }
          viewAllHref={`${content.featuredProducts.viewAllLink || "/shop"}${(content.featuredProducts.viewAllLink || "/shop").includes("?") ? "&" : "?"}section=featured`}
          viewAllText={
            locale === "ar" && content.featuredProducts.viewAllTextAr
              ? content.featuredProducts.viewAllTextAr
              : content.featuredProducts.viewAllText
          }
          className='bg-stone-50'
          onQuickView={setQuickViewProduct}
        />
      )}

      {/* ═══════════════════════════════════════════════
          7. NEW ARRIVALS — Minimal card carousel
          ═══════════════════════════════════════════════ */}
      {content.newArrivals?.enabled !== false &&
        newArrivalProducts.length > 0 && (
          <MinimalProductCarousel
            products={newArrivalProducts}
            title={
              locale === "ar" && content.newArrivals?.titleAr
                ? content.newArrivals.titleAr
                : content.newArrivals?.title || t("new_arrivals")
            }
            viewAllHref={`${content.newArrivals?.viewAllLink || "/shop"}${(content.newArrivals?.viewAllLink || "/shop").includes("?") ? "&" : "?"}section=newarrivals`}
            viewAllText={
              locale === "ar" && content.newArrivals?.viewAllTextAr
                ? content.newArrivals.viewAllTextAr
                : content.newArrivals?.viewAllText || t("view_all")
            }
            className='bg-stone-50'
            onQuickView={setQuickViewProduct}
          />
        )}

      {/* ═══════════════════════════════════════════════
          BOTTOM IMAGE CAROUSEL (above testimonials)
          ═══════════════════════════════════════════════ */}
      {(() => {
        const bottomSlides: HeroSlide[] = (content.bottomCarousel?.slides ?? [])
          .filter((s) => s.imageUrl)
          .map((s) => ({
            imageUrl: resolveImageUrl(s.imageUrl) || "",
            mobileImageUrl: resolveImageUrl(s.mobileImageUrl),
            linkUrl: s.linkUrl,
            alt: s.alt,
          }));
        return content.bottomCarousel?.enabled !== false &&
          bottomSlides.length > 0 ? (
          <div className='max-w-[1400px] mx-auto '>
            <HeroCarousel slides={bottomSlides} interval={5000} autoHeight />
          </div>
        ) : null;
      })()}

      {/* ═══════════════════════════════════════════════
          8. TESTIMONIALS
          ═══════════════════════════════════════════════ */}
      <TestimonialsSection
        testimonials={content.testimonials}
        variant='minimal'
        locale={locale}
      />

      {/* Quick View Dialog */}
      <QuickViewDialog
        product={quickViewProduct}
        open={!!quickViewProduct}
        onClose={() => setQuickViewProduct(null)}
      />
    </div>
  );
}

LandingTemplateMinimal.displayName = "LandingTemplateMinimal";
