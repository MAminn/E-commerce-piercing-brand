import { formatCategoryName } from "#root/shared/utils/format";
import { query } from "#root/shared/database/drizzle/db";
import {
  category,
  file,
  product,
  productVariant,
  productCategory,
} from "#root/shared/database/drizzle/schema";
import {
  and,
  asc,
  countDistinct,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
} from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";

export const viewProductsSchema = z.object({
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
  search: z.string().trim().max(255).optional(),
  sortBy: z.enum(["name", "price", "discountPrice", "stock"]).optional(),
  categoryId: z.string().uuid().optional(),
  /** Admin-only: include products hidden from the shop */
  includeHidden: z.boolean().optional().default(false),
});

/**
 * Admin product list and its pagination total.
 *
 * Two joins used to decide which products existed at all:
 *
 *   `.innerJoin(category, product.categoryId = category.id)` plus a
 *   `category.deleted = false` condition.
 *
 * An INNER join to `category` means a product whose category row has been
 * soft-deleted disappears from the dashboard completely — from the table AND
 * from `totalCount` — while the storefront, which filters on the product's
 * own `deleted`/`hidden` flags and never requires a live category row, goes
 * on listing and counting it. That is how the dashboard came to report a
 * smaller catalogue than /search and the category pages did: the storefront
 * numbers were right and this one was hiding rows.
 *
 * The join is now a LEFT join used only to read the category's name, and the
 * `category.deleted` condition is gone. Membership is decided by the
 * product's own flags, exactly as `searchProducts` decides it, so both sides
 * count the same catalogue.
 *
 * The total is `countDistinct(product.id)` rather than `count()`. With a
 * many-to-one left join the two are identical today; stating DISTINCT keeps
 * the total correct if anyone later joins `product_category` (many-to-many)
 * into this query, which is precisely how a count query starts
 * double-counting products.
 */
export const viewProducts = (input: z.infer<typeof viewProductsSchema>) =>
  Effect.gen(function* ($) {
    return yield* $(
      query(async (db) => {
        return await db.transaction(async (tx) => {
          const baseQueryConditions = [];
          baseQueryConditions.push(eq(product.deleted, false));
          if (!input.includeHidden) {
            baseQueryConditions.push(eq(product.hidden, false));
          }

          if (input.search) {
            baseQueryConditions.push(
              or(
                ilike(product.name, `%${input.search}%`),
                ilike(product.description, `%${input.search}%`),
                ilike(category.name, `%${input.search}%`),
              ),
            );
          }

          // Category filtering. A product can be filed into a category two
          // ways — the legacy `product.category_id` FK and the
          // `product_category` junction — and this used to honour only
          // whichever one happened to be non-empty: with ANY junction row for
          // the category it filtered on the junction ids alone and dropped
          // products attached by the FK only.
          //
          // Both are matched now, as `searchProducts` matches them, and the
          // junction ids are de-duplicated before they reach the `IN` list so
          // duplicate junction rows cannot skew anything downstream.
          if (input.categoryId) {
            const productsInCategoryRes = await tx
              .selectDistinct({
                productId: productCategory.productId,
              })
              .from(productCategory)
              .where(eq(productCategory.categoryId, input.categoryId))
              .execute();

            const productIdsInCategory = productsInCategoryRes.map(
              (p) => p.productId,
            );

            baseQueryConditions.push(
              productIdsInCategory.length > 0
                ? or(
                    inArray(product.id, productIdsInCategory),
                    eq(product.categoryId, input.categoryId),
                  )
                : eq(product.categoryId, input.categoryId),
            );
          }

          // --- Get Total Count ---
          const countQuery = tx
            .select({ count: countDistinct(product.id) })
            .from(product)
            .leftJoin(category, eq(product.categoryId, category.id))
            .where(and(...baseQueryConditions));

          const totalCountResult = await countQuery.execute();
          const totalCount = totalCountResult[0]?.count ?? 0;

          // --- Get Paginated Products ---
          const pQuery = tx
            .select()
            .from(product)
            .leftJoin(category, eq(product.categoryId, category.id))
            .leftJoin(file, eq(product.imageId, file.id))
            .where(and(...baseQueryConditions))
            .$dynamic(); // Keep dynamic for sorting/limit/offset

          if (input.sortBy) {
            pQuery.orderBy(
              asc(
                input.sortBy === "name"
                  ? product.name
                  : input.sortBy === "price"
                    ? product.price
                    : input.sortBy === "discountPrice"
                      ? product.discountPrice
                      : product.stock,
              ),
            );
          } else {
            // Default: sort by sortOrder (0 and null last), then newest first
            pQuery.orderBy(
              sql`(${product.sortOrder} IS NULL OR ${product.sortOrder} = 0)`,
              asc(product.sortOrder),
              desc(product.createdAt),
            );
          }

          const productsResult = await pQuery
            .limit(input.limit ?? 10)
            .offset(input.offset ?? 0)
            .execute();

          const productIds = productsResult.map((p) => p.product.id);

          // --- Fetch Related Data (Variants, Categories) ---
          let variants: (typeof productVariant.$inferSelect)[] = [];
          const productCategoryMap = new Map<
            string,
            { id: string; name: string }[]
          >();

          if (productIds.length > 0) {
            variants = await tx
              .select()
              .from(productVariant)
              .where(inArray(productVariant.productId, productIds))
              .execute();

            const productCategories = await tx
              .select({
                productId: productCategory.productId,
                categoryId: productCategory.categoryId,
                categoryName: category.name,
                isPrimary: productCategory.isPrimary,
              })
              .from(productCategory)
              .innerJoin(category, eq(productCategory.categoryId, category.id))
              .where(inArray(productCategory.productId, productIds))
              .execute();

            for (const pc of productCategories) {
              if (!productCategoryMap.has(pc.productId)) {
                productCategoryMap.set(pc.productId, []);
              }
              productCategoryMap.get(pc.productId)?.push({
                id: pc.categoryId,
                name: formatCategoryName(pc.categoryName),
              });
            }
          }

          // --- Format Results ---
          const formattedProducts = productsResult.map((productData) => {
            const associatedCategories =
              productCategoryMap.get(productData.product.id) || [];
            return {
              ...productData,
              // Null whenever the product's category row was hard-deleted or
              // the FK was never set — the LEFT join no longer drops the
              // product on that account, so the shape has to admit it.
              category: productData.category
                ? {
                    ...productData.category,
                    name: formatCategoryName(productData.category.name),
                  }
                : null,
              categories: associatedCategories,
              variants: variants
                .filter((variant) => variant.productId === productData.product.id)
                .map((v) => ({
                  name: v.name,
                  values: (v.values as any[]).map((val) =>
                    typeof val === "string" ? { value: val, priceModifier: 0 } : val,
                  ),
                })),
            };
          });

          // --- Return Paginated Result ---
          return {
            products: formattedProducts,
            totalCount,
          };
        });
      }),
    );
  });
