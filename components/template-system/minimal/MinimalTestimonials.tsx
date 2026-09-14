import { useState, useEffect } from "react";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import { trpc } from "#root/shared/trpc/client";
import { getStoreOwnerId } from "#root/shared/config/store";
import { DEFAULT_LANDING_TEMPLATE_ID } from "#root/shared/config/storefront";
import type { HomepageContent } from "#root/shared/types/homepage-content";
import { TestimonialsSection } from "#root/components/template-system/shared/TestimonialsSection";

/**
 * Testimonials for the minimal catalogue pages (/shop, /categories/[slug]).
 *
 * This component used to carry five hardcoded five-star reviews under invented
 * customer names, seeded as `useState` initial values — so they rendered on
 * every catalogue page whether or not the CMS had any testimonials, and even
 * when the admin had testimonials switched off. Publishing invented reviews as
 * genuine customer feedback is not something this store does, so the fallback
 * data is gone entirely.
 *
 * All it does now is fetch CMS content and hand it to the shared
 * TestimonialsSection, which renders nothing when testimonials are absent,
 * disabled, or empty. Nothing renders — and no vertical space is reserved —
 * until a real review is published from Dashboard > Homepage > Testimonials.
 */
export function MinimalTestimonialsSection() {
  const { locale } = useMinimalI18n();
  const [testimonials, setTestimonials] =
    useState<HomepageContent["testimonials"]>(undefined);

  useEffect(() => {
    let cancelled = false;
    trpc.homepage.getContent
      .query({
        merchantId: getStoreOwnerId(),
        templateId: DEFAULT_LANDING_TEMPLATE_ID,
      })
      .then((res) => {
        if (cancelled || !res.success || !res.result) return;
        setTestimonials((res.result as HomepageContent).testimonials);
      })
      .catch(() => {
        // Testimonials are decorative — a failed fetch simply renders nothing.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <TestimonialsSection
      testimonials={testimonials}
      variant='minimal'
      locale={locale}
    />
  );
}
