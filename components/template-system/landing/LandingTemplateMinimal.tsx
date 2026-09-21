import { useState, useRef, useCallback, useEffect } from "react";
import type React from "react";
import { Link } from "#root/components/utils/Link";
import { PerceHero } from "#root/components/template-system/minimal/PerceHero";
import { PerceEditorialBlock } from "#root/components/template-system/minimal/PerceEditorialBlock";
import type { HeroSlide } from "#root/components/ui/hero-carousel";
import { MinimalProductCarousel } from "#root/components/template-system/minimal/MinimalProductCarousel";
import { MinimalBundleSection } from "#root/components/bundles/MinimalBundleSection";
import type { BundleCardCampaign } from "#root/components/bundles/BundleCampaignCard";
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
  bundleCampaigns?: BundleCardCampaign[];
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
        tabIndex={-1}
        aria-hidden='true'
        className='absolute -start-2 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center border border-perce-line bg-perce-bg transition-colors hover:border-perce-cta disabled:opacity-20 md:flex'>
        <ChevronLeft className='w-4 h-4' />
      </button>
      <button
        onClick={() => scroll("right")}
        disabled={!canScrollRight}
        tabIndex={-1}
        aria-hidden='true'
        className='absolute -end-2 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center border border-perce-line bg-perce-bg transition-colors hover:border-perce-cta disabled:opacity-20 md:flex'>
        <ChevronRight className='w-4 h-4' />
      </button>

      {/* `justify-center` directly on an overflowing flex scroller clips the
          leading items and makes them unreachable — you cannot scroll left
          past the centre point. With more categories than fit (the normal
          case on a 375px phone) the first category was unreachable. Centring
          now happens via `w-max mx-auto` on the track, which collapses to
          normal start-aligned scrolling as soon as the content overflows. */}
      <div
        ref={scrollRef}
        className='overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2'>
        <div className='flex w-max mx-auto gap-4 sm:gap-6 px-4'>
        {categories.map((cat) => {
          const imgSrc = resolveImageUrl(cat.imageUrl);
          return (
            <Link
              key={cat.id}
              href={`/categories/${cat.slug}`}
              data-cat-card
              className='group relative flex-none w-[168px] sm:w-[232px] lg:w-[288px] snap-start'>
              {/* Tall portrait crop — a placement shot is a close-up of an
                  ear, which is a vertical subject. The whole tile is the
                  link, so there is no separate clickable div. */}
              <div className='relative aspect-[4/5] overflow-hidden bg-perce-surface'>
                {imgSrc ? (
                  <img
                    src={imgSrc}
                    alt=''
                    className='h-full w-full object-cover object-center transition-transform ease-out group-hover:scale-[1.04]'
                    style={{ transitionDuration: "var(--perce-duration-slow)" }}
                    loading='lazy'
                    decoding='async'
                  />
                ) : (
                  /* No category image uploaded yet: a plain warm ground, not
                     a placeholder icon pretending to be product imagery. */
                  <div className='h-full w-full bg-perce-surface' />
                )}
              </div>
              {/* Caption below the photo, not over it: no scrim, no gradient,
                  and the image stays a clean product window. */}
              <h3 className='mt-2 text-left text-[0.8125rem] font-medium text-perce-ink sm:text-sm'>
                {cat.name}
              </h3>
            </Link>
          );
        })}
        </div>
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
  bundleCampaigns = [],
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
    // The brand-statement image used to be appended here as a second hero
    // slide. It now has its own editorial section further down the page, and
    // borrowing it made a missing brand image render as a broken *hero*.
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
    <div className={`landing-template-minimal overflow-x-hidden bg-perce-bg ${className}`}>
      <ScrollToProductsButton targetId='home-products' />
      {/* ═══════════════════════════════════════════════
          3. HERO — image + campaign copy
          ═══════════════════════════════════════════════
          PerceHero replaces the old HeroCarousel here. That component rendered
          images only, so on a store with hero images the CMS title, subtitle
          and CTA never appeared at all and the page opened on a bare 16:9
          strip. PerceHero composes image and copy, uses a portrait crop on
          phones, and still degrades to image-only or text-only. */}
      <PerceHero
        hero={content.hero}
        slides={heroSlides}
        onCtaClick={onCtaClick}
      />

      {/* ═══════════════════════════════════════════════
          3. CATEGORY GRID — Clean image + title (matchperfumes style)
          ═══════════════════════════════════════════════ */}
      {/* Renders only when the store actually has categories. It previously
          fell back to four invented tiles so the grid never looked empty;
          an empty catalogue should show nothing, not fabricated navigation. */}
      {content.categories.enabled &&
        (categoriesLoading || categories.length > 0) && (
        <section className='perce-section perce-container'>
          <div>
            {/* Left-aligned editorial heading. The previous centred heading
                with a hard 2px underline bar is the single most template-like
                element on the page; a quiet left-aligned title lets the
                photography carry the section. */}
            <div className='mb-8 sm:mb-10'>
              <h2 className='perce-section-title'>
                {locale === "ar" && content.categories.titleAr
                  ? content.categories.titleAr
                  : content.categories.title}
              </h2>
              {content.categories.subtitle?.trim() && (
                <p className='mt-2 max-w-prose text-sm text-perce-ink-muted'>
                  {content.categories.subtitle}
                </p>
              )}
            </div>

            {categoriesLoading ? (
              <div className='grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-4'>
                {["s1", "s2", "s3", "s4"].map((key) => (
                  <div
                    key={key}
                    className='aspect-[4/5] animate-pulse bg-perce-surface'
                  />
                ))}
              </div>
            ) : (
              <CategoryCarousel categories={categories} />
            )}
          </div>
        </section>
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
            className='bg-perce-surface'
            onQuickView={setQuickViewProduct}
          />
        )}

      {/* ═══════════════════════════════════════════════
          7b. BUNDLES & STACKS — campaign rail (CMS: content.bundles)
          Not a product carousel: these are sets with their own purchase
          model, so they get wider cards and no quick view.
          ═══════════════════════════════════════════════ */}
      {content.bundles?.enabled !== false && bundleCampaigns.length > 0 && (
        <MinimalBundleSection
          id='bundles'
          campaigns={bundleCampaigns}
          title={
            locale === "ar" && content.bundles?.titleAr
              ? content.bundles.titleAr
              : content.bundles?.title ||
                t(
                  content.bundles?.source === "best_selling"
                    ? "bundles.best_selling_title"
                    : "bundles.section_default_title",
                )
          }
          subtitle={
            locale === "ar" && content.bundles?.subtitleAr
              ? content.bundles.subtitleAr
              : content.bundles?.subtitle
          }
          viewAllHref={content.bundles?.viewAllLink || "/bundles"}
          viewAllText={
            locale === "ar" && content.bundles?.viewAllTextAr
              ? content.bundles.viewAllTextAr
              : content.bundles?.viewAllText || t("bundles.view_all")
          }
          className='bg-perce-bg'
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
          className='bg-perce-bg'
          onQuickView={setQuickViewProduct}
        />
      )}

      {/* ═══════════════════════════════════════════════
          6. BRAND / EDITORIAL CAMPAIGN BLOCK
          ═══════════════════════════════════════════════
          Driven entirely by the existing `brandStatement` CMS fields, which
          the template never rendered before. Shows nothing at all until an
          admin publishes a heading or an image — no placeholder manifesto. */}
      <PerceEditorialBlock
        heading={content.brandStatement?.title}
        body={content.brandStatement?.description}
        imageUrl={resolveImageUrl(content.brandStatement?.image)}
        imageSide='start'
        tone='surface'
        onCtaClick={onCtaClick}
        className={
          content.brandStatement?.enabled === false ? "hidden" : undefined
        }
      />

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
            className='bg-perce-bg'
            onQuickView={setQuickViewProduct}
          />
        )}

      {/* ═══════════════════════════════════════════════
          8. STACK INSPIRATION — on-ear editorial imagery
          ═══════════════════════════════════════════════
          Reuses the existing `bottomCarousel` CMS slides, which already carry
          desktop + mobile images, an optional link and alt text. Presented as
          a full-bleed editorial rail rather than another boxed carousel.
          No shoppable hotspots and no tagged products — none exist, and
          inventing them would mean inventing product references. */}
      {(() => {
        const stackSlides = (content.bottomCarousel?.slides ?? []).filter(
          (slide) => slide.imageUrl,
        );
        if (content.bottomCarousel?.enabled === false) return null;
        if (stackSlides.length === 0) return null;
        return (
          <section className='perce-section bg-perce-bg'>
            <div className='perce-container'>
              <h2 className='perce-eyebrow mb-6'>{t("shop_the_look")}</h2>
            </div>
            <div className='overflow-x-auto scrollbar-hide snap-x snap-mandatory'>
              <div className='flex w-max gap-3 px-[var(--perce-gutter)] sm:gap-4'>
                {stackSlides.map((slide, i) => {
                  const src = resolveImageUrl(slide.imageUrl);
                  const mobileSrc = resolveImageUrl(slide.mobileImageUrl);
                  const Frame = slide.linkUrl ? "a" : "div";
                  return (
                    <Frame
                      key={slide.id ?? `${slide.imageUrl}-${i}`}
                      {...(slide.linkUrl ? { href: slide.linkUrl } : {})}
                      className='group relative w-[240px] flex-none snap-start overflow-hidden bg-perce-surface sm:w-[300px] lg:w-[360px]'>
                      <div className='aspect-[4/5]'>
                        <picture>
                          {mobileSrc && (
                            <source
                              media='(max-width: 767px)'
                              srcSet={mobileSrc}
                            />
                          )}
                          <img
                            src={src}
                            alt={slide.alt ?? ""}
                            className='h-full w-full object-cover object-center transition-transform ease-out group-hover:scale-[1.04]'
                            style={{
                              transitionDuration: "var(--perce-duration-slow)",
                            }}
                            loading='lazy'
                            decoding='async'
                          />
                        </picture>
                      </div>
                      {slide.alt?.trim() && (
                        <p className='px-1 py-3 text-xs text-perce-ink-muted'>
                          {slide.alt}
                        </p>
                      )}
                    </Frame>
                  );
                })}
              </div>
            </div>
          </section>
        );
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
