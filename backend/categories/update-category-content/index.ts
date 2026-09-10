import { db } from "#root/shared/database/drizzle/db";
import { categoryContent } from "#root/shared/database/drizzle/schema";
import { eq, and } from "drizzle-orm";
import type { CategoryContent } from "#root/shared/types/category-content";

/**
 * Updates or creates category content for a specific merchant and category
 *
 * @param merchantId - The unique identifier for the merchant
 * @param categoryId - The category identifier
 * @param content - The category content to save
 * @returns Promise resolving to the updated content
 */
export async function updateCategoryContent(
  merchantId: string,
  categoryId: string,
  content: CategoryContent
): Promise<CategoryContent> {
  try {
    const database = db();

    // Check if content already exists
    const existing = await database
      .select()
      .from(categoryContent)
      .where(
        and(
          eq(categoryContent.merchantId, merchantId),
          eq(categoryContent.categoryId, categoryId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Update existing content
      await database
        .update(categoryContent)
        .set({
          content: content as any,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(categoryContent.merchantId, merchantId),
            eq(categoryContent.categoryId, categoryId)
          )
        );
    } else {
      // Insert new content
      await database.insert(categoryContent).values({
        merchantId,
        categoryId,
        content: content as any,
      });
    }

    return content;
  } catch (error) {
    console.error("Error updating category content:", error);
    throw new Error("Failed to update category content");
  }
}
