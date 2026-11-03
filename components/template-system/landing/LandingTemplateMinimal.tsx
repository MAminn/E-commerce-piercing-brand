import { useMemo, type ReactNode } from "react";
import { PerceHero } from "#root/components/template-system/minimal/PerceHero";
import type { HeroSlide } from "#root/components/ui/hero-carousel";
import type { BundleCardCampaign } from "#root/components/bundles/BundleCampaignCard";
import { OfferBlock } from "#root/components/storefront/promo/PromoLayer";
import {
  MinimalProductCard,
  type MinimalProduct,
} from "#root/components/template-system/minimal/MinimalProductCard";
import type { FeaturedProduct } from "../home/HomeFeaturedProducts";
import type { CategoryStripItem } from "#root/components/shop/CategoryStrip";
import type { NewArrivalProduct } from "#root/components/shop/NewArrivals";
import type { HomepageContent } from "#root/shared/types/homepage-content";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { localizeCmsLabel } from "#root/lib/i18n/cms-copy";
import { formatItemCount } from "#root/lib/i18n/item-count";
import { IndexLine } from "#root/components/storefront/IndexLine";
import { FeaturedObject } from "#root/components/storefront/FeaturedObject";
import { buttonClass } from "#root/components/storefront/Button";
import { useStorefrontCategories } from "#root/hooks/useStorefrontCategories";
import { placementTree, type Placement } from "#root/shared/categories/placements";
import { formatMoney } from "#root/shared/pricing/format-money";

/**
 * Props for the LandingTemplateMinimal component
 */
export interface LandingTemplateMinimalProps {
  content: HomepageContent;
  featuredProducts?: FeaturedProduct[];
  /** Accepted for the page contract; the Object Index homepage has no sale rail. */
  discountedProducts?: FeaturedProduct[];
  /** Accepted for the page contract; placements come from the category tree. */
  categories?: CategoryStripItem[];
  categoriesLoading?: boolean;
  newArrivals?: (NewArrivalProduct & {
    categories?: { id: string; name: string }[];
  })[];
  newArrivalsLoading?: boolean;
  bundleCampaigns?: BundleCardCampaign[];
  /** Every live Pick Your Set campaign. */
  setCampaigns?: BundleCardCampaign[];
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

/** "New in" shows exactly this many in-stock pieces, or nothing. */
export const NEW_IN_COUNT = 4;

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * A numbered homepage section: the "01 · Placement" index line on a hairline,
 * an optional text link at the end, then the content. 48px above and below,
 * so neighbouring sections sit 96px apart on desktop (64px on phones).
 */
function IndexSection({
  index,
  label,
  id,
  action,
  children,
}: {
  index: number;
  label: string;
  id: string;
  action?: { href: string; text: string };
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} data-home-section={id} className='py-8 lg:py-12'>
      <div className='perce-container'>
        <div className='mb-6 flex items-baseline justify-between gap-4 border-b border-ink pb-3 lg:mb-8'>
          <IndexLine variant='section' index={index} label={label} id={id} />
          {action && (
            <a href={action.href} className={buttonClass({ variant: "text", size: "sm" })}>
              {action.text}
            </a>
          )}
        </div>
        {children}
      </div>
    </section>
  );
}

// ─── 01 · Placement ──────────────────────────────────────

/**
 * The placement index: each placement (Ear, Nose) as a column headed by its
 * name, its sub-placements as numbered rows — "01 Daith · 7". Counts are the
 * stored storefront counts; a placement with sub-placements shows none of its
 * own (see placementTree). Typography only: no tiles, no imagery.
 */
function PlacementIndex({ placements }: { placements: Placement[] }) {
  return (
    <div className='grid grid-cols-1 gap-x-6 gap-y-8 md:grid-cols-2' data-testid='placement-index'>
      {placements.map((p) => (
        <div key={p.id}>
          <a
            href={p.href}
            className='group flex min-h-12 items-baseline justify-between gap-4 border-b border-line py-3'>
            <span className='t-h3 text-ink group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4'>
              {p.label}
            </span>
            {p.count !== null && <span className='t-small tabular-nums text-ink-2'>{p.count}</span>}
          </a>
          {p.children.length > 0 && (
            <ol>
              {p.children.map((c, i) => (
                <li key={c.id}>
                  <a
                    href={c.href}
                    className='group grid min-h-11 grid-cols-[2.5rem_1fr] items-baseline border-b border-line py-3 t-body'>
                    <span className='tabular-nums text-ink-2'>{pad2(i + 1)}</span>
                    <span>
                      <span className='text-ink group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4'>
                        {c.label}
                      </span>
                      {c.count !== null && (
                        <span className='tabular-nums text-ink-2'>
                          {" · "}
                          {c.count}
                        </span>
                      )}
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── 03 · Sets ───────────────────────────────────────────

/**
 * Sets as index rows — "Pick your set · 3 pieces · EGP 270". The price is
 * shown only when the set has one fixed total; a percentage set states its
 * pieces and nothing it would "save". Sold-out sets are left out.
 */
function SetsIndex({ campaigns }: { campaigns: BundleCardCampaign[] }) {
  const { t, locale } = useMinimalI18n();
  return (
    <ol className='border-t border-line' data-testid='sets-index'>
      {campaigns.map((c) => {
        const pieces = c.type === "curated_stack" ? c.unitCount : c.requiredQuantity;
        const price =
          c.pricingType === "fixed_total" && typeof c.fixedBundlePrice === "number"
            ? formatMoney(c.fixedBundlePrice, { locale })
            : null;
        return (
          <li key={c.id}>
            <a
              href={`/bundles/${encodeURIComponent(c.slug)}`}
              data-set-row={c.slug}
              className='group flex min-h-13 items-baseline justify-between gap-4 border-b border-line py-4'>
              <span className='t-body'>
                <span className='text-ink group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4'>
                  {c.title}
                </span>
                {pieces > 0 && (
                  <span className='tabular-nums text-ink-2'>
                    {" · "}
                    {formatItemCount(pieces, locale, t, "home.pieces")}
                  </span>
                )}
              </span>
              {price && <span className='shrink-0 t-body tabular-nums text-ink'>{price}</span>}
            </a>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Minimal Landing Page — Object Index.
 *
 * One clear rhythm instead of five same-structure shelves:
 *   Hero → 01 · Placement → 02 · New in → one large object → 03 · Sets
 * (then the global footer). Each block reads its data from the existing
 * sources and disappears when that data is not there: no placeholder
 * placements, no "New in" padded with sold-out pieces, no invented object.
 * The CMS section switches still apply (categories, new arrivals, featured
 * products, bundles). Trust strip, editorial block, sale rail, stack
 * inspiration and testimonials are no longer part of the homepage.
 */
export function LandingTemplateMinimal({
  content,
  featuredProducts = [],
  newArrivals = [],
  bundleCampaigns = [],
  setCampaigns = [],
  className = "",
  onCtaClick,
}: LandingTemplateMinimalProps) {
  const { t, locale } = useMinimalI18n();
  const label = (en: string | null | undefined, ar?: string | null, fallbackKey?: string) =>
    localizeCmsLabel(locale, t, { en, ar }, fallbackKey);
  const { categories: categoryRows } = useStorefrontCategories();

  // ─── Build hero slides from CMS ───
  // Priority: heroSlides array > legacy single backgroundImage
  const heroSlides: HeroSlide[] = (() => {
    if (content.hero.heroSlides && content.hero.heroSlides.length > 0) {
      return content.hero.heroSlides.map((slide) => ({
        imageUrl: resolveImageUrl(slide.imageUrl) || "",
        mobileImageUrl: resolveImageUrl(slide.mobileImageUrl),
        linkUrl: slide.linkUrl,
        alt: slide.alt,
      }));
    }
    const slides: HeroSlide[] = [];
    if (content.hero.backgroundImage) {
      slides.push({
        imageUrl: resolveImageUrl(content.hero.backgroundImage) || "",
        mobileImageUrl: resolveImageUrl(content.hero.mobileBackgroundImage),
        linkUrl: content.hero.ctaLink,
        alt: content.hero.title,
      });
    }
    return slides;
  })();

  // Hero background video. The slides above stay as its poster and fallback.
  const heroVideoSrc = resolveImageUrl(content.hero.backgroundVideo);
  const heroVideo = heroVideoSrc
    ? {
        src: heroVideoSrc,
        mobileSrc: resolveImageUrl(content.hero.mobileBackgroundVideo),
      }
    : undefined;

  // 01 · Placement — the category tree (server-rendered with the page).
  const placements = useMemo(() => placementTree(categoryRows ?? []), [categoryRows]);
  const showPlacements = content.categories.enabled && placements.length > 0;

  // 02 · New in — exactly four in-stock pieces, newest first, or nothing.
  const newIn: MinimalProduct[] =
    content.newArrivals?.enabled === false
      ? []
      : newArrivals
          .filter((p) => p.available && p.stock > 0)
          .slice(0, NEW_IN_COUNT)
          .map((p) => ({
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
            requiresOptions: p.requiresOptions,
            categories: p.categories,
            catalogueNo: p.catalogueNo ?? null,
          }));
  const showNewIn = newIn.length === NEW_IN_COUNT;
  const newInLink = content.newArrivals?.viewAllLink || "/shop";
  const newInHref = `${newInLink}${newInLink.includes("?") ? "&" : "?"}section=newarrivals`;

  // The large object — the merchant's first featured pick that is in stock
  // and not already in New in.
  const shownIds = new Set(showNewIn ? newIn.map((p) => p.id) : []);
  const featured = content.featuredProducts.enabled
    ? featuredProducts.find((p) => p.available && p.stock > 0 && !shownIds.has(p.id))
    : undefined;

  // 03 · Sets — Pick Your Set first, then Ready Sets; buyable ones only.
  const sets =
    content.bundles?.enabled === false
      ? []
      : [...setCampaigns, ...bundleCampaigns.filter((c) => c.type === "curated_stack")].filter(
          (c, i, all) => c.availability === "available" && all.findIndex((x) => x.id === c.id) === i,
        );

  // Section numbers follow what is actually on the page.
  let n = 0;

  return (
    <div className={`landing-template-minimal bg-bg pb-8 lg:pb-12 ${className}`}>
      <PerceHero
        hero={{ ...content.hero, ctaText: label(content.hero.ctaText) }}
        slides={heroSlides}
        video={heroVideo}
        onCtaClick={onCtaClick}
      />

      {/* Promotional offer block (shared/config/promo-layer, off) */}
      <OfferBlock />

      {showPlacements && (
        <IndexSection
          index={++n}
          id='home-placement'
          label={t("home.index_placement")}
          action={{ href: "/shop", text: t("home.shop_all") }}>
          <PlacementIndex placements={placements} />
        </IndexSection>
      )}

      {showNewIn && (
        <IndexSection
          index={++n}
          id='home-new-in'
          label={t("home.index_new_in")}
          action={{ href: newInHref, text: t("view_all") }}>
          <div className='grid grid-cols-2 gap-x-3 gap-y-8 lg:grid-cols-4 lg:gap-x-6'>
            {newIn.map((p) => (
              <MinimalProductCard key={p.id} product={p} />
            ))}
          </div>
        </IndexSection>
      )}

      {featured && (
        <section aria-label={featured.name} data-home-section='home-object' className='py-8 lg:py-12'>
          <div className='perce-container'>
            <FeaturedObject product={featured} />
          </div>
        </section>
      )}

      {sets.length > 0 && (
        <IndexSection
          index={++n}
          id='home-sets'
          label={t("home.index_sets")}
          action={{ href: content.bundles?.viewAllLink || "/bundles", text: t("view_all") }}>
          <SetsIndex campaigns={sets} />
        </IndexSection>
      )}
    </div>
  );
}

LandingTemplateMinimal.displayName = "LandingTemplateMinimal";
