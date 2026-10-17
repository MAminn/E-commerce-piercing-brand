import { query } from "#root/shared/database/drizzle/db";
import { category, product } from "#root/shared/database/drizzle/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import {
  effectivePrice,
  inCategoriesCondition,
  onSaleCondition,
  searchCondition,
  visibleProductCondition,
} from "../listing-conditions";
import { computeListingFacets } from "./compute";

/**
 * The scope fields mirror `product.search` (they are the route's own
 * narrowing: a category page, a search term, a homepage section); the filter
 * fields are the shopper's.
 */
export const listingFacetsSchema = z.object({
  categoryIds: z.array(z.string().uuid()).max(200).optional(),
  search: z.string().trim().max(255).optional(),
  productIds: z.array(z.string().uuid()).max(500).optional(),
  discountedOnly: z.boolean().optional(),
  filterCategoryIds: z.array(z.string().uuid()).max(200).optional(),
  minPrice: z.number().min(0).max(1_000_000).optional(),
  maxPrice: z.number().min(0).max(1_000_000).optional(),
  inStock: z.boolean().optional(),
  onSale: z.boolean().optional(),
});

/** A whole-catalogue scope is a few hundred rows; this only guards against surprises. */
const MAX_SCOPE_ROWS = 5000;

export const getListingFacets = (input: z.infer<typeof listingFacetsSchema>) =>
  Effect.gen(function* ($) {
    return yield* $(
      query(async (db) => {
        const rows = await db
          .select({
            id: product.id,
            price: effectivePrice,
            stock: product.stock,
            onSale: sql<boolean>`(${onSaleCondition()})`,
            primaryCategoryId: product.categoryId,
            // Comma-joined rather than a uuid[]: the driver's array parsing
            // is not something this needs to depend on. Written out with an
            // alias on purpose: in a single-table select drizzle renders
            // column references unqualified, so `${productCategory.productId}
            // = ${product.id}` came out as `"product_id" = "id"` — both
            // resolving to the junction row itself, matching nothing.
            categoryIds: sql<string>`array_to_string(array(select pc.category_id from product_category pc where pc.product_id = "product"."id"), ',')`,
          })
          .from(product)
          .where(
            and(
              visibleProductCondition(),
              input.productIds && input.productIds.length > 0
                ? inArray(product.id, input.productIds)
                : undefined,
              input.categoryIds && input.categoryIds.length > 0
                ? inCategoriesCondition(db, input.categoryIds)
                : undefined,
              input.search ? searchCondition(input.search) : undefined,
              input.discountedOnly ? onSaleCondition() : undefined,
            ),
          )
          .limit(MAX_SCOPE_ROWS);

        const categories = await db
          .select({ id: category.id, parentId: category.parentId })
          .from(category)
          .where(eq(category.deleted, false));

        return computeListingFacets(
          rows.map((r) => ({
            id: r.id,
            price: Number(r.price),
            stock: r.stock,
            onSale: r.onSale === true,
            categoryIds: [
              ...new Set([r.primaryCategoryId, ...(r.categoryIds ? r.categoryIds.split(",") : [])]),
            ],
          })),
          categories,
          {
            filterCategoryIds: input.filterCategoryIds,
            minPrice: input.minPrice ?? null,
            maxPrice: input.maxPrice ?? null,
            inStock: input.inStock,
            onSale: input.onSale,
          },
        );
      }),
    );
  });
