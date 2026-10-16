import { query } from "#root/shared/database/drizzle/db";
import { category, file } from "#root/shared/database/drizzle/schema";
import { compareCategories } from "#root/shared/categories/tree";
import { eq } from "drizzle-orm";

import { Effect } from "effect";

/**
 * View Main Categories
 * Returns the main (top-level) categories with their subcategory count, in
 * admin order. Includes imageId and filename for display.
 *
 * Main vs. sub is the explicit `parent_id` now. It used to be inferred here
 * as "the first row of each `type`", which is also why a main category was
 * listed as its own subcategory.
 */
export const viewMainCategories = () =>
  Effect.gen(function* ($) {
    return yield* $(
      query(async (db) => {
        const allCategories = await db
          .select({
            id: category.id,
            name: category.name,
            slug: category.slug,
            type: category.type,
            parentId: category.parentId,
            sortOrder: category.sortOrder,
            hidden: category.hidden,
            createdAt: category.createdAt,
            imageId: category.imageId,
            filename: file.diskname,
            showOnLanding: category.showOnLanding,
          })
          .from(category)
          .leftJoin(file, eq(category.imageId, file.id))
          .where(eq(category.deleted, false));

        const ids = new Set(allCategories.map((c) => c.id));
        const subcategoryCount = new Map<string, number>();
        for (const c of allCategories) {
          if (c.parentId && ids.has(c.parentId)) {
            subcategoryCount.set(c.parentId, (subcategoryCount.get(c.parentId) ?? 0) + 1);
          }
        }

        return allCategories
          .filter((c) => !c.parentId || !ids.has(c.parentId))
          .sort(compareCategories)
          .map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            imageId: c.imageId,
            filename: c.filename,
            showOnLanding: c.showOnLanding,
            subcategoryCount: subcategoryCount.get(c.id) ?? 0,
          }));
      }),
    );
  });

export type ViewMainCategoriesResult = Effect.Effect.Success<
  Awaited<ReturnType<typeof viewMainCategories>>
>;
