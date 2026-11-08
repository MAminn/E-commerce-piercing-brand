import { useMemo, type ReactNode } from "react";
import { PerceHero } from "#root/components/template-system/minimal/PerceHero";
import type { HeroSlide } from "#root/components/ui/hero-carousel";
import { BundleCampaignCard, type BundleCardCampaign } from "#root/components/bundles/BundleCampaignCard";
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
import { cn } from "#root/lib/utils";
import { FeaturedObject } from "#root/components/storefront/FeaturedObject";
import { buttonClass } from "#root/components/storefront/Button";
import { useStorefrontCategories } from "#root/hooks/useStorefrontCategories";
import { placementTree, type Placement } from "#root/shared/categories/placements";

/**
 * Props for the LandingTemplateMinimal component
 */
export interface LandingTemplateMinimalProps {
  content: HomepageContent;
  featuredProducts?: FeaturedProduct[];
  /** Accepted for the page contract; the homepage has no sale rail. */
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

/** "New in" fills whole desktop rows of four, up to this many pieces. */
export const NEW_IN_MAX = 8;
/** Fewer in-stock pieces than one full row and the section stays away. */
export const NEW_IN_MIN = 4;
/** The sets merchandised on the homepage; the rest are one tap away on /bundles. */
const SETS_MAX = 4;
/** The second product grid needs at least one full row. */
const MORE_COUNT = 4;

/** A homepage section's heading row: one title, one optional text link. */
function SectionHead({
  id,
  title,
  intro,
  action,
  dark = false,
}: {
  id: string;
  title: string;
  intro?: string;
  action?: { href: string; text: string };
  dark?: boolean;
}) {
  return (
    <div className='mb-4 flex items-end justify-between gap-4 lg:mb-6'>
      <div className='min-w-0'>
        <h2 id={id} className={cn("t-h1", dark ? "text-bg" : "text-ink")}>
          {title}
        </h2>
        {intro && <p className={cn("mt-2 max-w-prose t-body", dark ? "text-bg/75" : "text-ink-2")}>{intro}</p>}
      </div>
      {action && (
        <a
          href={action.href}
          className={buttonClass({
            variant: "text",
            size: "sm",
            className: cn("shrink-0", dark && "text-bg hover:text-bg/75"),
          })}>
          {action.text}
        </a>
      )}
    </div>
  );
}

// ─── Shop by placement ───────────────────────────────────

/** A placement and the photo that represents it, when there is one. */
type PlacementTile = { placement: Placement; image: string | undefined };

/**
 * Photo blocks for browsing by placement: the first large, the rest around it.
 *
 *   Desktop  one 2×2 block with four single blocks beside it. Other counts
 *            stretch the last blocks, so the mosaic never leaves a hole.
 *   Phones   the first full width, the rest two-up, an odd last one full width.
 *
 * A placement with sub-placements carries them as links on its large block. A
 * placement with no photo at all is a solid ink block, never a grey hole.
 */
function PlacementMosaic({ tiles }: { tiles: PlacementTile[] }) {
  const rest = tiles.length - 1;

  const tileClass = (i: number): string => {
    if (tiles.length === 1) return "col-span-2 aspect-[4/3] lg:col-span-4 lg:aspect-[21/9]";
    if (i === 0) {
      return rest === 1
        ? "col-span-2 aspect-[4/3] lg:aspect-square"
        : "col-span-2 aspect-[4/3] lg:row-span-2 lg:aspect-auto";
    }
    if (rest === 1) return "col-span-2 aspect-[4/3] lg:aspect-square";
    const isLast = i === rest;
    // Two beside the large block: each a wide block filling its half.
    if (rest === 2) return "aspect-[4/5] lg:col-span-2 lg:aspect-[2/1]";
    // Three: two single blocks, then a wide one under them.
    if (rest === 3) return isLast ? "col-span-2 aspect-[2/1]" : "aspect-[4/5]";
    // An odd count leaves a phone's last block alone on its row.
    return cn("aspect-[4/5]", isLast && rest % 2 === 1 && "col-span-2 aspect-[2/1] lg:col-span-1 lg:aspect-[4/5]");
  };

  return (
    <ul className='grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3' data-testid='placement-tiles'>
      {tiles.map(({ placement: p, image }, i) => (
        <li
          key={p.id}
          data-placement-tile={p.slug}
          className={cn("group relative overflow-hidden", image ? "bg-surface-2" : "bg-ink", tileClass(i))}>
          {image && (
            <img
              src={image}
              alt=''
              loading={i < 3 ? "eager" : "lazy"}
              decoding='async'
              className='absolute inset-0 h-full w-full object-cover transition-transform duration-[var(--perce-duration-slow)] ease-out motion-reduce:transition-none lg:group-hover:scale-[1.03]'
            />
          )}
          {image && (
            <div
              aria-hidden
              className='pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-ink/65 to-transparent'
            />
          )}
          {/* The whole block is the link; sub-placements sit above it as links of their own. */}
          <a href={p.href} className='absolute inset-0 flex items-end p-3 lg:p-5'>
            <span
              className={cn(
                "text-bg",
                i === 0 ? "t-h1" : "t-h2",
                i === 0 && p.children.length > 0 && "mb-12 lg:mb-14",
              )}>
              {p.label}
            </span>
          </a>
          {i === 0 && p.children.length > 0 && (
            <ul className='absolute inset-x-3 bottom-3 flex flex-wrap gap-1.5 lg:inset-x-5 lg:bottom-5 lg:gap-2'>
              {p.children.map((c) => (
                <li key={c.id}>
                  <a
                    href={c.href}
                    className='inline-flex h-9 items-center bg-bg px-3 t-label text-ink transition-colors hover:bg-ink hover:text-bg'>
                    {c.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

// ─── Sets ────────────────────────────────────────────────

/**
 * The sets as large photo cards, on a black band that sets them apart from the
 * products. Phones swipe through them, each card nearly the screen's width,
 * with the next one showing at the edge. From 1024px they fill the row. Every
 * figure on a card is the campaign's own (see BundleCampaignCard).
 */
function SetsMerch({ campaigns }: { campaigns: BundleCardCampaign[] }) {
  const count = campaigns.length;
  const single = count === 1;
  return (
    <ul
      data-testid='sets-merch'
      className={cn(
        "-mx-[var(--perce-gutter)] flex snap-x snap-mandatory scroll-px-[var(--perce-gutter)] gap-2 overflow-x-auto px-[var(--perce-gutter)] scrollbar-hide",
        "lg:mx-0 lg:grid lg:gap-3 lg:overflow-visible lg:px-0",
        count === 1 && "lg:grid-cols-1",
        count === 2 && "lg:grid-cols-2",
        count === 3 && "lg:grid-cols-3",
        count >= 4 && "lg:grid-cols-4",
      )}>
      {campaigns.map((campaign, index) => (
        <li
          key={campaign.id}
          className={cn("shrink-0 snap-start lg:w-auto lg:max-w-none", single ? "w-full" : "w-[82vw] max-w-[24rem]")}>
          <BundleCampaignCard
            campaign={campaign}
            eager={index < 2}
            className={cn(single && "lg:aspect-[21/9]", count === 2 && "lg:aspect-[5/4]")}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * Homepage — the shop window.
 *
 * Image first, in one clear order:
 *   Hero → Sets → Shop by placement → New in → one large piece → more pieces
 * (then the global footer). Each block reads its data from the existing sources
 * and disappears when that data is not there. The CMS section switches still
 * apply (categories, new arrivals, featured products, bundles).
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
        alt: label(content.hero.title),
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

  // New in — whole rows of in-stock pieces, newest first, or nothing.
  const inStockNew = newArrivals.filter((p) => p.available && p.stock > 0);
  const newInCount = Math.min(NEW_IN_MAX, Math.floor(inStockNew.length / NEW_IN_MIN) * NEW_IN_MIN);
  const newIn: MinimalProduct[] =
    content.newArrivals?.enabled === false || newInCount < NEW_IN_MIN
      ? []
      : inStockNew.slice(0, newInCount).map((p) => ({
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
  const newInLink = content.newArrivals?.viewAllLink || "/shop";
  const newInHref = `${newInLink}${newInLink.includes("?") ? "&" : "?"}section=newarrivals`;

  // The large piece — the merchant's first featured pick that is in stock and
  // not already in New in, else the next new piece. Then a second grid of what
  // is left, if a full row is. No product appears twice.
  const shownIds = new Set(newIn.map((p) => p.id));
  const candidates = content.featuredProducts.enabled
    ? [...featuredProducts.filter((p) => p.available && p.stock > 0), ...inStockNew.map((p) => ({ ...p, categoryName: p.categoryName ?? "" }))].filter(
        (p, i, all) => !shownIds.has(p.id) && all.findIndex((x) => x.id === p.id) === i,
      )
    : [];
  const featured = candidates[0];
  const moreLeft = candidates.slice(1);
  const more = moreLeft.length >= MORE_COUNT ? moreLeft.slice(0, MORE_COUNT) : [];

  // Placement photos: the category's own image, else a photo of a piece that is
  // already on this page and sits in that placement. Each photo is used once.
  const tiles = useMemo<PlacementTile[]>(() => {
    const rows = categoryRows ?? [];
    const placements = placementTree(rows);
    const realImage = (url: string | null | undefined) =>
      url && !/placeholder/i.test(url) ? resolveImageUrl(url) : undefined;
    const productPhoto = (p: {
      imageUrl?: string | null;
      images?: { url: string; isPrimary?: boolean }[];
    }) => realImage((p.images?.find((i) => i.isPrimary) ?? p.images?.[0])?.url ?? p.imageUrl);
    const pool = [...newArrivals, ...featuredProducts];
    const used = new Set<string>();
    return placements.map((placement) => {
      const family = [placement, ...placement.children];
      const ids = new Set(family.map((x) => x.id));
      const names = new Set(
        rows.filter((r) => ids.has(r.id)).map((r) => r.name.trim().toLowerCase()),
      );
      const own = realImage(rows.find((r) => r.id === placement.id)?.filename);
      let image = own;
      if (!image) {
        for (const product of pool) {
          const inFamily =
            product.categories?.some((c) => ids.has(c.id)) ||
            names.has((product.categoryName ?? "").trim().toLowerCase());
          const photo = inFamily ? productPhoto(product) : undefined;
          if (photo && !used.has(photo)) {
            image = photo;
            break;
          }
        }
      }
      if (image) used.add(image);
      return { placement, image };
    });
  }, [categoryRows, newArrivals, featuredProducts]);
  const showPlacements = content.categories.enabled && tiles.length > 0;

  // Sets — Pick Your Set first, then Ready Sets; buyable ones only.
  const sets =
    content.bundles?.enabled === false
      ? []
      : [...setCampaigns, ...bundleCampaigns.filter((c) => c.type === "curated_stack")]
          .filter((c, i, all) => c.availability === "available" && all.findIndex((x) => x.id === c.id) === i)
          .slice(0, SETS_MAX);

  return (
    <div className={`landing-template-minimal bg-bg ${className}`}>
      <PerceHero
        hero={{
          ...content.hero,
          title: label(content.hero.title),
          subtitle: label(content.hero.subtitle),
          ctaText: label(content.hero.ctaText),
        }}
        slides={heroSlides}
        video={heroVideo}
        onCtaClick={onCtaClick}
      />

      {/* Promotional offer block (shared/config/promo-layer, off) */}
      <OfferBlock />

      {sets.length > 0 && (
        <section aria-labelledby='home-sets-title' data-home-section='home-sets' className='bg-ink py-8 lg:py-12'>
          <div className='perce-container'>
            <SectionHead
              dark
              id='home-sets-title'
              title={label(content.bundles?.title, content.bundles?.titleAr, "bundles.section_default_title")}
              intro={t("bundles.page_intro")}
              action={{ href: content.bundles?.viewAllLink || "/bundles", text: t("view_all") }}
            />
            <SetsMerch campaigns={sets} />
          </div>
        </section>
      )}

      {showPlacements && (
        <HomeSection id='home-placement'>
          <SectionHead
            id='home-placement-title'
            title={label(content.categories.title, content.categories.titleAr, "home.shop_by_placement")}
            action={{ href: "/shop", text: t("home.shop_all") }}
          />
          <PlacementMosaic tiles={tiles} />
        </HomeSection>
      )}

      {newIn.length > 0 && (
        <HomeSection id='home-new-in'>
          <SectionHead
            id='home-new-in-title'
            title={label(content.newArrivals?.title, content.newArrivals?.titleAr, "new_arrivals")}
            action={{ href: newInHref, text: t("view_all") }}
          />
          {/* Phones: one large piece, then two-up. An even count would leave the
              last piece alone on its row, so it waits for a wider screen. */}
          <div className='-mx-2 grid grid-cols-2 gap-x-2 gap-y-6 lg:mx-0 lg:grid-cols-4 lg:gap-x-3 lg:gap-y-10'>
            {newIn.map((p, i) => (
              <MinimalProductCard
                key={p.id}
                product={p}
                className={cn(i === 0 && "max-lg:col-span-2", i === newIn.length - 1 && "max-lg:hidden")}
              />
            ))}
          </div>
        </HomeSection>
      )}

      {featured && (
        <section aria-label={featured.name} data-home-section='home-object' className='py-2 lg:py-4'>
          <div className='lg:perce-container'>
            <FeaturedObject product={featured} variant='editorial' />
          </div>
        </section>
      )}

      {more.length > 0 && (
        <HomeSection id='home-more'>
          <SectionHead
            id='home-more-title'
            title={label(content.featuredProducts.title, content.featuredProducts.titleAr, "featured")}
            action={{
              href: content.featuredProducts.viewAllLink || "/shop",
              text: label(content.featuredProducts.viewAllText, content.featuredProducts.viewAllTextAr, "view_all"),
            }}
          />
          <div className='-mx-2 grid grid-cols-2 gap-x-2 gap-y-6 lg:mx-0 lg:grid-cols-4 lg:gap-x-3'>
            {more.map((p) => (
              <MinimalProductCard key={p.id} product={p} />
            ))}
          </div>
        </HomeSection>
      )}
    </div>
  );
}

/** A section on the stone ground. */
function HomeSection({ id, children }: { id: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} data-home-section={id} className='py-8 lg:py-12'>
      <div className='perce-container'>{children}</div>
    </section>
  );
}

LandingTemplateMinimal.displayName = "LandingTemplateMinimal";
