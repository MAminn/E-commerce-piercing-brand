import { db } from "#root/shared/database/drizzle/db";
import { categoryContent } from "#root/shared/database/drizzle/schema";
import { eq, and } from "drizzle-orm";
import type { CategoryContent } from "#root/shared/types/category-content";
import {
  DEFAULT_CATEGORY_CONTENT,
  mergeCategoryContentWithDefaults,
} from "#root/shared/types/category-content";

/**
 * Fetches category content for a specific merchant and category
 * Falls back to default content if not found
 *
 * @param merchantId - The unique identifier for the merchant
 * @param categoryId - The category identifier
 * @returns Promise resolving to the category content
 */
export async function getCategoryContent(
  merchantId: string,
  categoryId: string
): Promise<CategoryContent> {
  try {
    const database = db();
    const result = await database
      .select()
      .from(categoryContent)
      .where(
        and(
          eq(categoryContent.merchantId, merchantId),
          eq(categoryContent.categoryId, categoryId)
        )
      )
      .limit(1);

    if (result.length > 0 && result[0]?.content) {
      // Validate and merge with defaults to ensure all required fields exist
      const storedContent = result[0].content as unknown as CategoryContent;
      return mergeCategoryContentWithDefaults(storedContent);
    }

    // Return default content if not found
    return DEFAULT_CATEGORY_CONTENT;
  } catch (error) {
    console.error("Error fetching category content:", error);
    // Fail gracefully by returning defaults
    return DEFAULT_CATEGORY_CONTENT;
  }
}
