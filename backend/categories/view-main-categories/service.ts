import { query } from "#root/shared/database/drizzle/db";
import { category, file } from "#root/shared/database/drizzle/schema";
import { eq, sql, and } from "drizzle-orm";

import { Effect } from "effect";

/**
 * View Main Categories
 * Returns unique main categories (distinct by type) with subcategory count.
 * Includes imageId and filename for display.
 */
export const viewMainCategories = () =>
  Effect.gen(function* ($) {
    return yield* $(
      query(async (db) => {
        // Get all categories with their file info, then group by type in JS
        const allCategories = await db
          .select({
            id: category.id,
            name: category.name,
            type: category.type,
            imageId: category.imageId,
            filename: file.diskname,
            showOnLanding: category.showOnLanding,
          })
          .from(category)
          .leftJoin(file, eq(category.imageId, file.id))
          .where(eq(category.deleted, false))
          .orderBy(category.type, category.createdAt);

        // Group by type and get the first one as main category
        const categoryMap = new Map<
          string,
          {
            id: string;
            name: string;
            type: string;
            imageId: string | null;
            filename: string | null;
            showOnLanding: boolean;
            subcategoryCount: number;
          }
        >();

        for (const cat of allCategories) {
          if (!categoryMap.has(cat.type)) {
            // First category of this type becomes the "main" category
            categoryMap.set(cat.type, {
              id: cat.id,
              name: cat.name,
              type: cat.type,
              imageId: cat.imageId,
              filename: cat.filename,
              showOnLanding: cat.showOnLanding,
              subcategoryCount: 0,
            });
          } else {
            // Increment subcategory count
            const mainCat = categoryMap.get(cat.type)!;
            mainCat.subcategoryCount++;
          }
        }

        return Array.from(categoryMap.values());
      }),
    );
  });

export type ViewMainCategoriesResult = Effect.Effect.Success<
  Awaited<ReturnType<typeof viewMainCategories>>
>;
