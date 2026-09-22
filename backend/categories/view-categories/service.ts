import { formatCategoryName } from "#root/shared/utils/format";
import { query } from "#root/shared/database/drizzle/db";
import { category, file, product } from "#root/shared/database/drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { storefrontVisibleInCategory } from "../category-products";

import { Effect } from "effect";

/**
 * Public category list (navbar, homepage, /shop, /categories/[slug]) with the
 * number of products a shopper can actually reach in each one.
 *
 * `productCount` used to be `count(product.id)` over a
 * `leftJoin(product, category.id = product.categoryId)` with a `groupBy`.
 * Three things were wrong with that:
 *
 *   1. It only saw the legacy `product.category_id` FK and ignored
 *      `product_category` entirely, so a product filed into a category
 *      through the junction table — which is how the admin UI assigns
 *      categories — did not count towards it.
 *   2. It counted soft-deleted (`deleted`) and hidden products, so the badge
 *      promised more than the category page then rendered.
 *   3. Counting over a join is only correct while the join stays one-to-one.
 *      Adding `product_category` to that shape (the obvious fix for 1) makes
 *      it many-to-many, and `count(product.id)` would then count a product
 *      once per matching junction row.
 *
 * The count is now a correlated scalar subquery over `product` alone, built
 * from the shared `storefrontVisibleInCategory` predicate in
 * ../category-products.ts. There is no join to duplicate: each product is
 * examined once and contributes at most 1, whatever `product_category` holds
 * — including duplicate junction rows, which the `product_category_unique`
 * index prevents going forward but which older data may still contain.
 *
 * That module is also what the category delete guards use, so what this badge
 * calls "in the category" and what a destructive action calls "not empty"
 * cannot drift apart again. The two policies differ on hidden products only,
 * deliberately; the reasoning is documented there.
 */
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
            // Correlated against `category.id` on the row being selected.
            productCount: sql<number>`(select count(*)::int from ${product} where ${storefrontVisibleInCategory(category.id)})`,
          })
          .from(category)
          .leftJoin(file, eq(category.imageId, file.id))
          .where(eq(category.deleted, false));

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
