import { query } from "#root/shared/database/drizzle/db";
import {
  category,
  productCategory,
} from "#root/shared/database/drizzle/schema";
import { eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { formatCategoryName } from "#root/shared/utils/format";

export const getCategoriesSchema = z.object({
  productId: z.string().uuid(),
});

export const getCategories = (input: z.infer<typeof getCategoriesSchema>) =>
  Effect.gen(function* ($) {
    return yield* $(
      query(async (db) => {
        // Get categories via the productCategory table
        const productCategories = await db
          .select({
            categoryId: productCategory.categoryId,
            isPrimary: productCategory.isPrimary,
            name: category.name,
            type: category.type,
          })
          .from(productCategory)
          .innerJoin(category, eq(productCategory.categoryId, category.id))
          .where(eq(productCategory.productId, input.productId))
          .orderBy(productCategory.isPrimary)
          .execute();

        return productCategories.map((c) => ({
          id: c.categoryId,
          name: formatCategoryName(c.name),
          type: c.type,
          isPrimary: c.isPrimary,
        }));
      }),
    );
  });
