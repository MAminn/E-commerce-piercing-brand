import { homepageContent } from "#root/shared/database/drizzle/schema";
import { eq, and } from "drizzle-orm";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import type { HomepageContent } from "#root/shared/types/homepage-content";
import { DEFAULT_HOMEPAGE_CONTENT } from "#root/shared/types/homepage-content";

/**
 * Direct database query for SSR homepage content injection.
 * Accepts a DatabaseClient so it can be used in both Fastify and Hono SSR handlers
 * without relying on the global db() singleton.
 *
 * Same fallback chain as getHomepageContent:
 *   template-specific → legacy "default" row → hardcoded defaults
 */
export async function getHomepageContentRaw(
  database: DatabaseClient,
  merchantId: string,
  templateId?: string,
): Promise<HomepageContent> {
  try {
    const resolvedTemplateId = templateId || "default";

    // Find content for the specific template
    const result = await database
      .select()
      .from(homepageContent)
      .where(
        and(
          eq(homepageContent.merchantId, merchantId),
          eq(homepageContent.templateId, resolvedTemplateId),
        ),
      )
      .limit(1)
      .execute();

    if (result.length > 0 && result[0]?.content) {
      const storedContent = result[0].content as unknown as HomepageContent;
      return mergeWithDefaults(storedContent);
    }

    // If no template-specific content and this isn't already "default",
    // try the legacy "default" row for backward compatibility
    if (resolvedTemplateId !== "default") {
      const fallback = await database
        .select()
        .from(homepageContent)
        .where(
          and(
            eq(homepageContent.merchantId, merchantId),
            eq(homepageContent.templateId, "default"),
          ),
        )
        .limit(1)
        .execute();

      if (fallback.length > 0 && fallback[0]?.content) {
        const storedContent = fallback[0].content as unknown as HomepageContent;
        return mergeWithDefaults(storedContent);
      }
    }

    return DEFAULT_HOMEPAGE_CONTENT;
  } catch {
    // SSR CMS injection is an enhancement — failures must not break page rendering
    return DEFAULT_HOMEPAGE_CONTENT;
  }
}

function stripNulls<T>(obj: T): T {
  if (obj === null || obj === undefined) return undefined as unknown as T;
  if (Array.isArray(obj)) return obj.map(stripNulls) as unknown as T;
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (value !== null) {
        result[key] = typeof value === "object" ? stripNulls(value) : value;
      }
    }
    return result as T;
  }
  return obj;
}

function mergeWithDefaults(
  storedContent: Partial<HomepageContent>,
): HomepageContent {
  const clean = stripNulls(storedContent);
  return {
    meta: {
      ...DEFAULT_HOMEPAGE_CONTENT.meta,
      ...clean.meta,
    },
    hero: {
      ...DEFAULT_HOMEPAGE_CONTENT.hero,
      ...clean.hero,
    },
    brandStatement: {
      ...DEFAULT_HOMEPAGE_CONTENT.brandStatement,
      ...clean.brandStatement,
    },
    promoBanner: {
      ...DEFAULT_HOMEPAGE_CONTENT.promoBanner,
      ...clean.promoBanner,
    },
    categories: {
      ...DEFAULT_HOMEPAGE_CONTENT.categories,
      ...clean.categories,
    },
    featuredProducts: {
      ...DEFAULT_HOMEPAGE_CONTENT.featuredProducts,
      ...clean.featuredProducts,
    },
    valueProps: {
      ...DEFAULT_HOMEPAGE_CONTENT.valueProps,
      ...(clean.valueProps || {}),
      items:
        clean.valueProps?.items || DEFAULT_HOMEPAGE_CONTENT.valueProps.items,
    },
    newsletter: {
      ...DEFAULT_HOMEPAGE_CONTENT.newsletter,
      ...clean.newsletter,
    },
    footerCta: {
      ...DEFAULT_HOMEPAGE_CONTENT.footerCta,
      ...clean.footerCta,
    },
    discountedProducts:
      clean.discountedProducts ?? DEFAULT_HOMEPAGE_CONTENT.discountedProducts,
    newArrivals: clean.newArrivals ?? DEFAULT_HOMEPAGE_CONTENT.newArrivals,
    marquee: clean.marquee ?? DEFAULT_HOMEPAGE_CONTENT.marquee,
    promoLine: clean.promoLine ?? DEFAULT_HOMEPAGE_CONTENT.promoLine,
    contactBanner:
      clean.contactBanner ?? DEFAULT_HOMEPAGE_CONTENT.contactBanner,
    bottomCarousel:
      clean.bottomCarousel ?? DEFAULT_HOMEPAGE_CONTENT.bottomCarousel,
    aboutUs:
      clean.aboutUs ?? DEFAULT_HOMEPAGE_CONTENT.aboutUs,
    returnPolicy:
      clean.returnPolicy ?? DEFAULT_HOMEPAGE_CONTENT.returnPolicy,
    productCarouselTitle:
      clean.productCarouselTitle ?? DEFAULT_HOMEPAGE_CONTENT.productCarouselTitle,
    productCarouselTitleAr:
      clean.productCarouselTitleAr ?? DEFAULT_HOMEPAGE_CONTENT.productCarouselTitleAr,
    testimonials:
      clean.testimonials ?? DEFAULT_HOMEPAGE_CONTENT.testimonials,
  };
}
