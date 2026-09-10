import type React from "react";
import { useState, memo } from "react";
import { Button } from "#root/components/ui/button";
import { Skeleton } from "#root/components/ui/skeleton";
import { Input } from "#root/components/ui/input";
import { Label } from "#root/components/ui/label";
import type {
  HomepageContent,
} from "#root/shared/types/homepage-content";
import { VALUE_PROP_ICON_MAP as ICON_MAP } from "#root/components/template-system/shared/value-prop-icons";
import type { FeaturedProduct } from "../home/HomeFeaturedProducts";
import type { CategoryStripItem } from "#root/components/shop/CategoryStrip";
import type { NewArrivalProduct } from "#root/components/shop/NewArrivals";
import { getProductUrl } from "#root/lib/utils/route-helpers";
import { EditorialChrome } from "../editorial/EditorialChrome";
import { Reveal } from "../motion/Reveal";
import { StaggerContainer, StaggerItem } from "../motion/Stagger";
import { ParallaxImage } from "../motion/ParallaxImage";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface LandingTemplateEditorialProps {
  content: HomepageContent;
  featuredProducts?: FeaturedProduct[];
  discountedProducts?: FeaturedProduct[];
  categories?: CategoryStripItem[];
  categoriesLoading?: boolean;
  newArrivals?: NewArrivalProduct[];
  newArrivalsLoading?: boolean;
  className?: string;
  onCtaClick?: (link: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const NOISE_SVG =
  "data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function safePrice(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? Number.parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

function formatPrice(v: number): string {
  return `EGP ${v.toFixed(2)}`;
}

/** Normalize a raw file path / URL so it resolves correctly in the browser. */
function normalizeUrl(raw: string): string {
  if (raw.startsWith("http") || raw.startsWith("/")) return raw;
  return `/uploads/${raw}`;
}

function resolveImage(
  product: FeaturedProduct | NewArrivalProduct,
): string | null {
  const primary = product.images?.find((i) => i.isPrimary);
  if (primary?.url) return normalizeUrl(primary.url);
  if (product.images?.[0]?.url) return normalizeUrl(product.images[0].url);
  if (product.imageUrl) return normalizeUrl(product.imageUrl);
  return null;
}

function resolveSecondaryImage(
  product: FeaturedProduct | NewArrivalProduct,
): string | null {
  if (!product.images || product.images.length < 2) return null;
  const primaryIdx = product.images.findIndex((i) => i.isPrimary);
  const secondIdx = primaryIdx >= 0 ? (primaryIdx === 0 ? 1 : 0) : 1;
  const url = product.images[secondIdx]?.url;
  return url ? normalizeUrl(url) : null;
}

/** Normalize a category image URL (raw filename from DB). */
function resolveCategoryImage(
  imageUrl: string | null | undefined,
): string | null {
  if (!imageUrl) return null;
  return normalizeUrl(imageUrl);
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */

export const EditorialProductTile = memo(function EditorialProductTile({
  product,
}: {
  product: FeaturedProduct | NewArrivalProduct;
}) {
  const img = resolveImage(product);
  const secondaryImg = resolveSecondaryImage(product);
  const discount = safePrice(product.discountPrice);
  const hasDiscount = discount != null && discount < product.price;
  const isSoldOut = !product.available || product.stock <= 0;

  return (
    <a
      href={getProductUrl(product)}
      className='group block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-stone-900/25 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-50'>
      <div className='relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-stone-200'>
        {img ? (
          <>
            <img
              src={img}
              alt={product.name}
              loading='lazy'
              decoding='async'
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
                secondaryImg ? "group-hover:opacity-0" : ""
              }`}
            />
            {secondaryImg && (
              <img
                src={secondaryImg}
                alt=''
                loading='lazy'
                decoding='async'
                className='absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-200 group-hover:opacity-100'
              />
            )}
          </>
        ) : (
          <div className='absolute inset-0 flex items-center justify-center'>
            <span className='text-xs tracking-[0.28em] uppercase text-stone-400'>
              No image
            </span>
          </div>
        )}
      </div>
      <div className='mt-3'>
        {product.categoryName && (
          <p className='text-[10px] tracking-[0.28em] uppercase text-stone-500'>
            {product.categoryName}
          </p>
        )}
        <p className='mt-1 text-sm font-medium text-stone-900 line-clamp-2'>
          {product.name}
        </p>
        <div className='mt-1 flex items-center gap-2 text-sm'>
          {hasDiscount ? (
            <>
              <span className='font-medium text-stone-900'>
                {formatPrice(discount)}
              </span>
              <span className='text-stone-500 line-through'>
                {formatPrice(product.price)}
              </span>
            </>
          ) : (
            <span className='text-stone-700'>{formatPrice(product.price)}</span>
          )}
        </div>
        {isSoldOut && (
          <p className='mt-2 text-[10px] tracking-[0.28em] uppercase text-stone-500'>
            Sold out
          </p>
        )}
      </div>
    </a>
  );
});

function SkeletonTile() {
  return (
    <div>
      <Skeleton className='aspect-[4/5] w-full rounded-2xl' />
      <Skeleton className='mt-3 h-3 w-20 rounded' />
      <Skeleton className='mt-2 h-4 w-32 rounded' />
    </div>
  );
}

function SkeletonTileGrid({ count = 8 }: { count?: number }) {
  return (
    <div className='grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4'>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonTile key={i} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                    */
/* ------------------------------------------------------------------ */

export function LandingTemplateEditorial({
  content,
  featuredProducts,
  discountedProducts,
  categories,
  categoriesLoading = false,
  newArrivals,
  newArrivalsLoading = false,
  className = "",
  onCtaClick,
}: LandingTemplateEditorialProps) {
  const [newsletterSubmitted, setNewsletterSubmitted] = useState(false);

  const handleCta =
    (link: string) => (e: React.MouseEvent<HTMLButtonElement>) => {
      if (onCtaClick) {
        e.preventDefault();
        onCtaClick(link);
      }
    };

  return (
    <EditorialChrome>
      <div className={`landing-template-editorial bg-stone-50 ${className}`}>
        {/* ============================================================ */}
        {/*  HERO                                                        */}
        {/* ============================================================ */}
        {content.hero.enabled && (
          <section className='relative isolate min-h-svh w-full overflow-hidden bg-stone-950'>
            {/* Background image / fallback */}
            {content.hero.backgroundImage ? (
              <>
                {/* Mobile / tablet: <picture> with optional mobile image */}
                <div className='absolute inset-0 lg:hidden'>
                  <picture>
                    {content.hero.mobileBackgroundImage && (
                      <source
                        media='(max-width: 640px)'
                        srcSet={content.hero.mobileBackgroundImage}
                      />
                    )}
                    <img
                      src={content.hero.backgroundImage}
                      alt=''
                      className='h-full w-full object-cover object-[center_30%] sm:object-[center_35%]'
                    />
                  </picture>
                </div>
                {/* Desktop: parallax */}
                <div className='absolute inset-0 hidden lg:block'>
                  <ParallaxImage
                    src={content.hero.backgroundImage}
                    alt=''
                    strength={18}
                    className='object-center'
                  />
                </div>
              </>
            ) : (
              <div className='absolute inset-0 bg-linear-to-b from-stone-800 via-stone-900 to-stone-950' />
            )}

            {/* Bottom-weighted gradient for text readability */}
            <div className='absolute inset-0 bg-linear-to-t from-black/70 via-black/30 to-black/5' />

            {/* Hero content — bottom-left editorial composition */}
            <div className='relative z-10 flex min-h-svh items-end'>
              <div className='w-full max-w-2xl px-6 pb-16 sm:px-10 sm:pb-20 lg:px-16 lg:pb-24'>
                {/* Eyebrow */}
                <Reveal variant='fadeIn' delay={0.2}>
                  <p className='text-[10px] sm:text-[11px] tracking-[0.35em] uppercase text-white/50 font-light'>
                    {content.hero.subtitle || "New Collection"}
                  </p>
                </Reveal>

                {/* Headline */}
                <Reveal variant='fadeUp' delay={0.35}>
                  <h1 className='mt-5 sm:mt-6 text-[clamp(2.5rem,7vw,5.5rem)] font-light tracking-[-0.02em] text-white leading-[1.05]'>
                    {content.hero.title}
                  </h1>
                </Reveal>

                {/* CTA — single, refined, editorial */}
                <Reveal variant='fadeUp' delay={0.55}>
                  <div className='mt-10 sm:mt-12'>
                    {onCtaClick ? (
                      <button
                        type='button'
                        onClick={() => onCtaClick(content.hero.ctaLink)}
                        className='inline-flex items-center justify-center border border-white/40 bg-transparent px-10 py-3.5 text-[11px] tracking-[0.2em] uppercase text-white font-light hover:bg-white hover:text-stone-900 transition-all duration-500'>
                        {content.hero.ctaText}
                      </button>
                    ) : (
                      <a
                        href={content.hero.ctaLink}
                        className='inline-flex items-center justify-center border border-white/40 bg-transparent px-10 py-3.5 text-[11px] tracking-[0.2em] uppercase text-white font-light hover:bg-white hover:text-stone-900 transition-all duration-500'>
                        {content.hero.ctaText}
                      </a>
                    )}
                  </div>
                </Reveal>
              </div>
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/*  BRAND STATEMENT — Editorial Mosaic                          */}
        {/* ============================================================ */}
        {content.brandStatement.enabled && (
          <section className='bg-white'>
            {/* ── ROW 1: Primary Image + Text ── */}
            <div className='grid grid-cols-1 lg:grid-cols-12'>
              {/* PRIMARY IMAGE — 7 columns, full height */}
              <Reveal variant='clipReveal' className='lg:col-span-7'>
                <div className='relative aspect-3/4 sm:aspect-4/5 lg:aspect-auto lg:min-h-[75vh] w-full overflow-hidden bg-stone-100'>
                  {content.brandStatement.image ? (
                    <>
                      {/* Mobile: plain img */}
                      <img
                        src={content.brandStatement.image}
                        alt={content.brandStatement.title}
                        loading='lazy'
                        decoding='async'
                        className='absolute inset-0 h-full w-full object-cover lg:hidden'
                      />
                      {/* Desktop: parallax */}
                      <div className='absolute inset-0 hidden lg:block'>
                        <ParallaxImage
                          src={content.brandStatement.image}
                          alt={content.brandStatement.title}
                          strength={12}
                        />
                      </div>
                    </>
                  ) : (
                    <div className='absolute inset-0 flex items-center justify-center'>
                      <span className='text-[10px] tracking-[0.35em] uppercase text-stone-300 font-light'>
                        The Edit
                      </span>
                    </div>
                  )}
                  {/* Noise overlay */}
                  <div
                    className='pointer-events-none absolute inset-0 opacity-[0.06] mix-blend-overlay'
                    style={{
                      backgroundImage: `url("${NOISE_SVG}")`,
                      backgroundSize: "128px 128px",
                    }}
                  />
                </div>
              </Reveal>

              {/* TEXT BLOCK — 5 columns */}
              <Reveal
                variant='fadeUp'
                delay={0.15}
                className='lg:col-span-5 flex flex-col justify-center bg-stone-100 px-8 py-16 sm:px-12 sm:py-20 lg:px-16 xl:px-20'>
                <p className='text-[10px] tracking-[0.35em] uppercase text-stone-400/80 font-light'>
                  The Edit
                </p>
                <h2 className='mt-6 text-[clamp(1.75rem,3.5vw,3rem)] font-light tracking-[-0.01em] text-stone-900 leading-[1.12]'>
                  {content.brandStatement.title}
                </h2>
                <div className='mt-8 w-12 h-px bg-stone-300' />
                <p className='mt-8 text-[15px] leading-[1.85] text-stone-500 font-light max-w-sm'>
                  {content.brandStatement.description}
                </p>
                {content.categories.enabled &&
                  (onCtaClick ? (
                    <button
                      type='button'
                      onClick={() => onCtaClick("/shop")}
                      className='mt-10 inline-block text-start text-[12px] tracking-[0.2em] uppercase text-stone-900 font-normal underline underline-offset-8 decoration-stone-900/20 hover:decoration-stone-900/50 transition-colors duration-500'>
                      {content.categories.ctaText || "Explore the Collection"}
                    </button>
                  ) : (
                    <a
                      href='/shop'
                      className='mt-10 inline-block text-[12px] tracking-[0.2em] uppercase text-stone-900 font-normal underline underline-offset-8 decoration-stone-900/20 hover:decoration-stone-900/50 transition-colors duration-500'>
                      {content.categories.ctaText || "Explore the Collection"}
                    </a>
                  ))}
              </Reveal>
            </div>

            {/* ── ROW 2: Category Tiles ── */}
            {categories && categories.length >= 2 && (
              <StaggerContainer className='grid grid-cols-1 sm:grid-cols-3'>
                {categories.slice(0, 3).map((cat) => {
                  const catImg = cat.imageUrl?.startsWith("http")
                    ? cat.imageUrl
                    : cat.imageUrl
                      ? `/uploads/${cat.imageUrl}`
                      : null;
                  return (
                    <StaggerItem key={cat.id}>
                      <a
                        href={`/categories/${cat.slug}`}
                        className='group relative block aspect-4/3 w-full overflow-hidden bg-stone-200'>
                        {catImg ? (
                          <img
                            src={catImg}
                            alt={cat.name}
                            loading='lazy'
                            decoding='async'
                            className='absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]'
                          />
                        ) : (
                          <div className='absolute inset-0 bg-stone-200' />
                        )}
                        <div className='absolute inset-0 bg-linear-to-t from-black/40 to-transparent' />
                        <p className='absolute bottom-5 left-6 text-[13px] tracking-[0.15em] uppercase text-white font-light'>
                          {cat.name}
                        </p>
                      </a>
                    </StaggerItem>
                  );
                })}
              </StaggerContainer>
            )}
          </section>
        )}

        {/* ============================================================ */}
        {/*  CATEGORIES — Editorial Listing Cards                        */}
        {/* ============================================================ */}
        {content.categories.enabled && (
          <section className='py-20 sm:py-28 lg:py-32 bg-white' id='categories'>
            <div className='mx-auto max-w-5xl px-6 sm:px-8 lg:px-10'>
              {/* Header row */}
              <Reveal variant='fadeUp'>
                <div className='flex items-end justify-between mb-12 sm:mb-14'>
                  <p className='text-[10px] tracking-[0.35em] uppercase text-stone-400 font-light'>
                    The Collection
                  </p>
                  {onCtaClick ? (
                    <button
                      type='button'
                      onClick={() => onCtaClick("/shop")}
                      className='text-[11px] tracking-[0.2em] uppercase text-stone-400 font-normal hover:text-stone-900 transition-colors duration-300'>
                      Browse All →
                    </button>
                  ) : (
                    <a
                      href='/shop'
                      className='text-[11px] tracking-[0.2em] uppercase text-stone-400 font-normal hover:text-stone-900 transition-colors duration-300'>
                      Browse All →
                    </a>
                  )}
                </div>
              </Reveal>

              {/* Category listing */}
              {categoriesLoading ? (
                <div className='space-y-6'>
                  {Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className='flex items-center gap-6'>
                      <Skeleton className='w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-none' />
                      <Skeleton className='h-6 w-40 rounded' />
                    </div>
                  ))}
                </div>
              ) : categories && categories.length > 0 ? (
                <StaggerContainer className='divide-y divide-stone-200/80'>
                  {categories.map((cat) => {
                    const catImg = cat.imageUrl?.startsWith("http")
                      ? cat.imageUrl
                      : cat.imageUrl
                        ? `/uploads/${cat.imageUrl}`
                        : null;
                    return (
                      <StaggerItem key={cat.id}>
                        <a
                          href={`/categories/${cat.slug}`}
                          className='group flex items-center gap-6 sm:gap-8 py-7 sm:py-9 px-4 sm:px-5 -mx-4 sm:-mx-5 rounded-sm hover:bg-stone-50 transition-all duration-300'>
                          {/* Square thumbnail */}
                          <div className='relative w-24 h-24 sm:w-28 sm:h-28 lg:w-32 lg:h-32 shrink-0 overflow-hidden bg-stone-100'>
                            {catImg ? (
                              <img
                                src={catImg}
                                alt={cat.name}
                                loading='lazy'
                                decoding='async'
                                className='absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]'
                              />
                            ) : (
                              <div className='absolute inset-0 flex items-center justify-center'>
                                <span className='text-[9px] tracking-[0.3em] uppercase text-stone-300 font-light'>
                                  {cat.name.charAt(0)}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Category name + explore prompt */}
                          <div className='flex-1 flex items-center justify-between min-w-0'>
                            <h3 className='text-lg sm:text-xl lg:text-2xl font-normal tracking-[-0.01em] text-stone-900 group-hover:text-stone-500 transition-colors duration-300 truncate'>
                              {cat.name}
                            </h3>
                            <span className='inline-flex text-[10px] sm:text-[11px] tracking-[0.2em] uppercase text-stone-400 font-light group-hover:text-stone-900 transition-all duration-300 shrink-0 ml-6 group-hover:translate-x-0.5'>
                              Explore →
                            </span>
                          </div>
                        </a>
                      </StaggerItem>
                    );
                  })}
                </StaggerContainer>
              ) : null}
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/*  NEW ARRIVALS                                                */}
        {/* ============================================================ */}
        {(newArrivalsLoading || (newArrivals && newArrivals.length > 0)) && content.newArrivals?.enabled !== false && (
          <section className='py-16 sm:py-20 bg-stone-50'>
            <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-10'>
              <div className='flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4'>
                <div>
                  <p className='text-xs tracking-[0.32em] uppercase text-stone-500'>
                    New In
                  </p>
                  <h2 className='mt-3 text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl leading-tight'>
                    {content.newArrivals?.title || "Just Arrived"}
                  </h2>
                  <p className='mt-3 text-sm text-stone-600 leading-relaxed'>
                    The latest additions to our collection.
                  </p>
                </div>
                <a
                  href={`${content.newArrivals?.viewAllLink || '/shop'}${(content.newArrivals?.viewAllLink || '/shop').includes('?') ? '&' : '?'}section=newarrivals`}
                  className='inline-flex text-sm font-medium text-stone-900 underline underline-offset-8 decoration-stone-900/20 hover:decoration-stone-900/40 transition-colors shrink-0'>
                  {content.newArrivals?.viewAllText || "View All"}
                </a>
              </div>
              <div className='mt-10'>
                {newArrivalsLoading ? (
                  <SkeletonTileGrid count={4} />
                ) : (
                  <StaggerContainer className='grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4'>
                    {newArrivals!.slice(0, 8).map((product) => (
                      <StaggerItem key={product.id}>
                        <EditorialProductTile product={product} />
                      </StaggerItem>
                    ))}
                  </StaggerContainer>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/*  DISCOUNTED PRODUCTS                                         */}
        {/* ============================================================ */}
        {content.discountedProducts?.enabled && discountedProducts && discountedProducts.length > 0 && (
          <section className='py-16 sm:py-20 bg-white'>
            <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-10'>
              <div className='flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4'>
                <div>
                  <p className='text-xs tracking-[0.32em] uppercase text-stone-500'>
                    Offers
                  </p>
                  <h2 className='mt-3 text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl leading-tight'>
                    {content.discountedProducts.title}
                  </h2>
                </div>
                {onCtaClick ? (
                  <button
                    type='button'
                    onClick={() =>
                      onCtaClick(`${content.discountedProducts!.viewAllLink || '/shop'}${(content.discountedProducts!.viewAllLink || '/shop').includes('?') ? '&' : '?'}section=offers`)
                    }
                    className='inline-flex text-sm font-medium text-stone-900 underline underline-offset-8 decoration-stone-900/20 hover:decoration-stone-900/40 transition-colors shrink-0'>
                    {content.discountedProducts.viewAllText || "View All"}
                  </button>
                ) : (
                  <a
                    href={`${content.discountedProducts.viewAllLink || '/shop'}${(content.discountedProducts.viewAllLink || '/shop').includes('?') ? '&' : '?'}section=offers`}
                    className='inline-flex text-sm font-medium text-stone-900 underline underline-offset-8 decoration-stone-900/20 hover:decoration-stone-900/40 transition-colors shrink-0'>
                    {content.discountedProducts.viewAllText || "View All"}
                  </a>
                )}
              </div>
              <div className='mt-10'>
                <StaggerContainer className='grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4'>
                  {discountedProducts.map((product) => (
                    <StaggerItem key={product.id}>
                      <EditorialProductTile product={product} />
                    </StaggerItem>
                  ))}
                </StaggerContainer>
              </div>
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/*  FEATURED PRODUCTS                                           */}
        {/* ============================================================ */}
        {content.featuredProducts.enabled && (
          <section className='py-16 sm:py-20 bg-stone-50'>
            <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-10'>
              <div className='flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4'>
                <div>
                  <p className='text-xs tracking-[0.32em] uppercase text-stone-500'>
                    Curated
                  </p>
                  <h2 className='mt-3 text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl leading-tight'>
                    {content.featuredProducts.title}
                  </h2>
                  {content.featuredProducts.subtitle && (
                    <p className='mt-3 text-sm text-stone-600 sm:text-base leading-relaxed max-w-lg'>
                      {content.featuredProducts.subtitle}
                    </p>
                  )}
                </div>
                {onCtaClick ? (
                  <button
                    type='button'
                    onClick={() =>
                      onCtaClick(`${content.featuredProducts.viewAllLink || '/shop'}${(content.featuredProducts.viewAllLink || '/shop').includes('?') ? '&' : '?'}section=featured`)
                    }
                    className='inline-flex text-sm font-medium text-stone-900 underline underline-offset-8 decoration-stone-900/20 hover:decoration-stone-900/40 transition-colors'>
                    {content.featuredProducts.viewAllText || "View All"}
                  </button>
                ) : (
                  <a
                    href={`${content.featuredProducts.viewAllLink || '/shop'}${(content.featuredProducts.viewAllLink || '/shop').includes('?') ? '&' : '?'}section=featured`}
                    className='inline-flex text-sm font-medium text-stone-900 underline underline-offset-8 decoration-stone-900/20 hover:decoration-stone-900/40 transition-colors'>
                    {content.featuredProducts.viewAllText || "View All"}
                  </a>
                )}
              </div>
              <div className='mt-10'>
                {!featuredProducts ? (
                  <SkeletonTileGrid count={8} />
                ) : featuredProducts.length > 0 ? (
                  <StaggerContainer className='grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4'>
                    {featuredProducts.map((product) => (
                      <StaggerItem key={product.id}>
                        <EditorialProductTile product={product} />
                      </StaggerItem>
                    ))}
                  </StaggerContainer>
                ) : null}
              </div>
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/*  VALUE PROPS                                                 */}
        {/* ============================================================ */}
        {content.valueProps.enabled && content.valueProps.items.length > 0 && (
          <section className='py-14 sm:py-16 bg-stone-50'>
            <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-10'>
              <div className='mb-10 h-px w-full bg-stone-900/10' />
              <StaggerContainer className='grid grid-cols-1 gap-8 sm:grid-cols-3'>
                {content.valueProps.items.map((item, idx) => {
                  const IconComp = ICON_MAP[item.icon];
                  return (
                    <StaggerItem key={idx}>
                      <div className='flex items-start gap-4'>
                        <div className='mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-stone-900/10 bg-stone-100'>
                          <IconComp
                            className='h-4 w-4 text-stone-700'
                            aria-hidden='true'
                          />
                        </div>
                        <div>
                          <p className='text-sm font-medium text-stone-900'>
                            {item.title}
                          </p>
                          <p className='mt-1 text-sm text-stone-600 leading-relaxed'>
                            {item.description}
                          </p>
                        </div>
                      </div>
                    </StaggerItem>
                  );
                })}
              </StaggerContainer>
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/*  NEWSLETTER                                                  */}
        {/* ============================================================ */}
        {content.newsletter.enabled && (
          <section className='py-16 sm:py-20 bg-stone-950 text-white'>
            <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-10'>
              <div className='grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-end'>
                <Reveal variant='fadeUp' className='lg:col-span-6'>
                  <p className='text-xs tracking-[0.32em] uppercase text-white/60'>
                    Stay in the loop
                  </p>
                  <h2 className='mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-white'>
                    {content.newsletter.title}
                  </h2>
                  <p className='mt-4 text-sm sm:text-base text-white/70 leading-relaxed'>
                    {content.newsletter.subtitle}
                  </p>
                </Reveal>
                <Reveal variant='fadeUp' delay={0.15} className='lg:col-span-6'>
                  {newsletterSubmitted ? (
                    <p className='text-sm text-white/80'>
                      Thank you for subscribing.
                    </p>
                  ) : (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        setNewsletterSubmitted(true);
                        setTimeout(() => setNewsletterSubmitted(false), 3000);
                      }}
                      className='flex flex-col gap-3 sm:flex-row'>
                      <Label
                        htmlFor='editorial-newsletter-email'
                        className='sr-only'>
                        Email
                      </Label>
                      <Input
                        id='editorial-newsletter-email'
                        type='email'
                        required
                        placeholder={content.newsletter.placeholderText}
                        className='h-12 flex-1 rounded-full bg-white/5 text-white placeholder:text-white/40 border border-white/15 focus-visible:ring-2 focus-visible:ring-white/40'
                      />
                      <Button
                        type='submit'
                        size='lg'
                        className='h-12 rounded-full px-7 text-sm tracking-wide'>
                        {content.newsletter.ctaText}
                      </Button>
                    </form>
                  )}
                  {content.newsletter.privacyText && (
                    <p className='mt-4 text-xs text-white/40 leading-relaxed'>
                      {content.newsletter.privacyText}
                    </p>
                  )}
                </Reveal>
              </div>
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/*  FOOTER CTA                                                  */}
        {/* ============================================================ */}
        {content.footerCta.enabled && (
          <section className='py-16 sm:py-20 bg-stone-50'>
            <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-10'>
              <div className='mb-10 h-px w-full bg-stone-900/10' />
              <Reveal variant='fadeUp'>
                <div className='mx-auto max-w-2xl text-center'>
                  <p className='text-xs tracking-[0.32em] uppercase text-stone-500'>
                    {content.footerCta.subtitle}
                  </p>
                  <h2 className='mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-stone-900 leading-tight'>
                    {content.footerCta.title}
                  </h2>
                  <div className='mt-8'>
                    <Button
                      size='lg'
                      className='rounded-full px-8 py-6 text-sm tracking-wide'
                      onClick={handleCta(content.footerCta.ctaLink)}
                      asChild={!onCtaClick}>
                      {onCtaClick ? (
                        content.footerCta.ctaText
                      ) : (
                        <a href={content.footerCta.ctaLink}>
                          {content.footerCta.ctaText}
                        </a>
                      )}
                    </Button>
                  </div>
                </div>
              </Reveal>
            </div>
          </section>
        )}
      </div>
    </EditorialChrome>
  );
}

LandingTemplateEditorial.displayName = "LandingTemplateEditorial";
