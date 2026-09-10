import { useEffect } from "react";
import type { HomepageContent } from "#root/shared/types/homepage-content";
import type { FeaturedProduct } from "../home/HomeFeaturedProducts";
import type { CategoryStripItem } from "#root/components/shop/CategoryStrip";
import type { NewArrivalProduct } from "#root/components/shop/NewArrivals";
import { NoirChrome } from "./NoirChrome";
import { NoirHero } from "./NoirHero";
import { NoirBestSellers } from "./NoirBestSellers";
import { NoirBenefitsStrip } from "./NoirBenefitsStrip";
import { NoirWhyUs } from "./NoirWhyUs";
import { NoirExploreGrid } from "./NoirExploreGrid";
import { NoirReviews } from "./NoirReviews";
import { NoirNewsletter } from "./NoirNewsletter";
import { NoirFooterCta } from "./NoirFooterCta";

/**
 * LandingTemplateNoir — Demo 5 "Noir" dark-luxury landing page.
 *
 * Consumes the exact landing props contract that pages/index/+Page.tsx
 * passes to every registered landing template (same shape as
 * LandingTemplateModernProps) — registration alone makes it work.
 *
 * Sections intentionally DEFERRED to a later phase (no CMS fields yet):
 * - FAQ accordion — HomepageContent has no FAQ section fields.
 * - Feature/campaign card — no campaign-card fields exist.
 * - Testimonial video thumbnails — testimonial items have no media field.
 */
export interface LandingTemplateNoirProps {
  /** Homepage content (editable by merchants) */
  content: HomepageContent;
  /** Featured products data (fetched dynamically) */
  featuredProducts?: FeaturedProduct[];
  /** Discounted products */
  discountedProducts?: FeaturedProduct[];
  /** Categories data (not rendered by Noir in this phase) */
  categories?: CategoryStripItem[];
  /** Loading state for categories */
  categoriesLoading?: boolean;
  /** New arrivals products (latest added, fetched dynamically) */
  newArrivals?: NewArrivalProduct[];
  /** Loading state for new arrivals */
  newArrivalsLoading?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Callback when any CTA button is clicked */
  onCtaClick?: (link: string) => void;
  /** Admin preview mode — disables the <html> chrome side effect */
  previewMode?: boolean;
}

export function LandingTemplateNoir({
  content,
  featuredProducts,
  discountedProducts,
  categories: _categories,
  categoriesLoading: _categoriesLoading,
  newArrivals,
  newArrivalsLoading = false,
  className = "",
  onCtaClick,
  previewMode = false,
}: LandingTemplateNoirProps) {
  // Hide the footer's own newsletter when this template renders one
  // (mirrors LandingTemplateModern's data-has-template-newsletter toggle)
  const hasNewsletter = content.newsletter.enabled;
  useEffect(() => {
    if (!hasNewsletter || previewMode) return;
    document.documentElement.dataset.hasTemplateNewsletter = "true";
    return () => {
      delete document.documentElement.dataset.hasTemplateNewsletter;
    };
  }, [hasNewsletter, previewMode]);

  // CMS promo banner feeds the announcement bar text
  const announcementText = content.promoBanner.enabled
    ? content.promoBanner.text
    : undefined;

  return (
    <NoirChrome announcementText={announcementText} previewMode={previewMode}>
      <div className={className}>
        <NoirHero hero={content.hero} onCtaClick={onCtaClick} />

        <NoirBestSellers
          content={content.featuredProducts}
          products={featuredProducts}
        />

        <NoirBenefitsStrip valueProps={content.valueProps} />

        <NoirWhyUs brandStatement={content.brandStatement} />

        <NoirExploreGrid
          newArrivalsContent={content.newArrivals}
          newArrivals={newArrivals}
          newArrivalsLoading={newArrivalsLoading}
          discountedContent={content.discountedProducts}
          discountedProducts={discountedProducts}
        />

        <NoirReviews testimonials={content.testimonials} />

        <NoirNewsletter newsletter={content.newsletter} />

        <NoirFooterCta footerCta={content.footerCta} onCtaClick={onCtaClick} />
      </div>
    </NoirChrome>
  );
}

LandingTemplateNoir.displayName = "LandingTemplateNoir";
