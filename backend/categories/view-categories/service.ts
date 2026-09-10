import { formatCategoryName } from "#root/shared/utils/format";
import { query } from "#root/shared/database/drizzle/db";
import { category, file, product } from "#root/shared/database/drizzle/schema";
import { count, eq } from "drizzle-orm";

import { Effect } from "effect";

export const viewCategories = () =>
  Effect.gen(function* ($) {
    return yield* $(
      query(async (db) => {
        const results = await db
          .select({
            id: category.id,
            name: category.name,
            slug: category.slug,
            imageId: category.imageId,
            filename: file.diskname,
            type: category.type,
            showOnLanding: category.showOnLanding,
            productCount: count(product.id),
          })
          .from(category)
          .leftJoin(file, eq(category.imageId, file.id))
          .leftJoin(product, eq(category.id, product.categoryId))
          .where(eq(category.deleted, false))
          .groupBy(category.id, file.diskname);

        // Format the category names
        return results.map((result) => ({
          ...result,
          name: result.name,
          displayName: formatCategoryName(result.name), // Add formatted name without prefix
        }));
      }),
    );
  });

export type ViewCategoriesResult = Effect.Effect.Success<
  Awaited<ReturnType<typeof viewCategories>>
>;
