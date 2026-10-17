/**
 * WHERE-clause pieces shared by the storefront listing queries
 * (`product.search` and `product.facets`), so a filter means exactly the same
 * thing in the grid as in the counts next to it.
 */

import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import { product, productCategory } from "#root/shared/database/drizzle/schema";
import { and, eq, exists, gt, ilike, inArray, isNotNull, lt, or, sql, type SQL } from "drizzle-orm";

type Db = Pick<DatabaseClient, "select">;

/**
 * The price the shopper pays: the discount price when it is a real discount
 * (set and below the list price), otherwise the list price — the same rule
 * MinimalProductCard uses to decide what to show.
 */
export const effectivePrice = sql<string>`(CASE WHEN ${product.discountPrice} IS NOT NULL AND ${product.discountPrice} < ${product.price} THEN ${product.discountPrice} ELSE ${product.price} END)`;

/** Live, shopper-visible products only. */
export function visibleProductCondition(): SQL {
  return and(eq(product.deleted, false), eq(product.hidden, false)) as SQL;
}

/** In any of `categoryIds`, through the junction table or the primary FK. */
export function inCategoriesCondition(db: Db, categoryIds: readonly string[]): SQL {
  return or(
    exists(
      db
        .select({ productId: productCategory.productId })
        .from(productCategory)
        .where(
          and(
            eq(productCategory.productId, product.id),
            inArray(productCategory.categoryId, [...categoryIds]),
          ),
        ),
    ),
    inArray(product.categoryId, [...categoryIds]),
  ) as SQL;
}

export function searchCondition(term: string): SQL {
  return or(ilike(product.name, `%${term}%`), ilike(product.description, `%${term}%`)) as SQL;
}

export function inStockCondition(): SQL {
  return gt(product.stock, 0);
}

export function onSaleCondition(): SQL {
  return and(isNotNull(product.discountPrice), lt(product.discountPrice, product.price)) as SQL;
}

export function priceRangeCondition(min?: number | null, max?: number | null): SQL | undefined {
  const parts: SQL[] = [];
  if (min != null) parts.push(sql`${effectivePrice} >= ${min}`);
  if (max != null) parts.push(sql`${effectivePrice} <= ${max}`);
  return parts.length > 0 ? (and(...parts) as SQL) : undefined;
}
