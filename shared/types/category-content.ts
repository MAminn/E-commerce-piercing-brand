/**
 * Category Page Content Management Schema
 *
 * This file defines the content structure for category pages that merchants can edit.
 * Layout and styling are NOT part of this schema - only editable content.
 *
 * Philosophy: Similar to Homepage Content v1
 * - Merchants control CONTENT only, NOT layout
 * - Layout quality is a product guarantee
 * - Content is stored per category
 */

/**
 * Category hero section content
 */
export interface CategoryHeroContent {
  enabled: boolean;
  imageUrl?: string;
}

/**
 * Category description section content
 */
export interface CategoryDescriptionContent {
  enabled: boolean;
  text: string;
}

/**
 * Complete category page content structure
 */
export interface CategoryContent {
  /**
   * Category display title
   */
  title: string;

  /**
   * Optional category description
   */
  description: CategoryDescriptionContent;

  /**
   * Optional hero image section
   */
  hero: CategoryHeroContent;
}

/**
 * Default category content
 * Used as fallback when no custom content is set
 */
export const DEFAULT_CATEGORY_CONTENT: CategoryContent = {
  title: "Products",
  description: {
    enabled: false,
    text: "",
  },
  hero: {
    enabled: false,
    imageUrl: undefined,
  },
};

/**
 * Helper to merge stored content with defaults
 * Ensures all required fields exist even if schema changes
 */
export function mergeCategoryContentWithDefaults(
  storedContent: Partial<CategoryContent>
): CategoryContent {
  return {
    title: storedContent.title || DEFAULT_CATEGORY_CONTENT.title,
    description: {
      ...DEFAULT_CATEGORY_CONTENT.description,
      ...storedContent.description,
    },
    hero: {
      ...DEFAULT_CATEGORY_CONTENT.hero,
      ...storedContent.hero,
    },
  };
}
