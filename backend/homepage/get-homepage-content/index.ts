import { db } from "#root/shared/database/drizzle/db";
import { homepageContent } from "#root/shared/database/drizzle/schema";
import { eq, and } from "drizzle-orm";
import type { HomepageContent } from "#root/shared/types/homepage-content";
import { DEFAULT_HOMEPAGE_CONTENT } from "#root/shared/types/homepage-content";

/**
 * Fetches homepage content for a specific merchant and template
 * Falls back to hardcoded defaults if no content found for the template
 *
 * @param merchantId - The unique identifier for the merchant
 * @param templateId - The template ID to fetch content for
 * @returns Promise resolving to the homepage content
 */
export async function getHomepageContent(
  merchantId: string,
  templateId?: string,
): Promise<HomepageContent> {
  try {
    const database = db();
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
      .limit(1);

    if (result.length > 0 && result[0]?.content) {
      const storedContent = result[0].content as unknown as HomepageContent;
      return mergeWithDefaults(storedContent);
    }

    // If no template-specific content and this isn't already "default",
    // try the legacy "default" row for backward compatibility with existing data
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
        .limit(1);

      if (fallback.length > 0 && fallback[0]?.content) {
        const storedContent = fallback[0].content as unknown as HomepageContent;
        return mergeWithDefaults(storedContent);
      }
    }

    // Return hardcoded default content if nothing found
    return DEFAULT_HOMEPAGE_CONTENT;
  } catch (error) {
    console.error("Error fetching homepage content:", error);
    return DEFAULT_HOMEPAGE_CONTENT;
  }
}

/**
 * Recursively strips null values from an object so that
 * defaults are preserved when spreading (null overrides defaults, undefined does not).
 */
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

/**
 * Merges stored content with defaults to ensure all required fields exist
 * This prevents errors if the schema changes or data is incomplete
 */
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
