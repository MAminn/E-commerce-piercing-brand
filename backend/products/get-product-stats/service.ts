import type { ClientSession } from "#root/backend/auth/shared/entities";
import { query } from "#root/shared/database/drizzle/db";
import { product } from "#root/shared/database/drizzle/schema";
import { ServerError } from "#root/shared/error/server";
import { and, count, eq, gt, lte } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";

export const getProductStatsSchema = z.object({
  lowStockThreshold: z.number().default(5), // Low stock threshold
});

export interface ProductStats {
  total: number;
  outOfStock: number;
  lowStock: number;
  newThisWeek: number;
}

function normalizeCount(rows: { count: number }[]): number {
  return rows[0]?.count ?? 0;
}

export const getProductStats = (
  input: z.infer<typeof getProductStatsSchema>,
  session?: ClientSession,
) =>
  Effect.gen(function* ($) {
    // Check for authorization
    if (!session) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "Unauthorized",
            statusCode: 401,
            clientMessage: "Unauthorized",
          }),
        ),
      );
    }

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    return yield* $(
      query(async (db) => {
        // Get total products count (exclude soft-deleted)
        const totalCount = await db
          .select({ count: count() })
          .from(product)
          .where(eq(product.deleted, false))
          .then(normalizeCount);

        // Get out of stock products count
        const outOfStockCount = await db
          .select({ count: count() })
          .from(product)
          .where(and(eq(product.stock, 0), eq(product.deleted, false)))
          .then(normalizeCount);

        // Get low stock products count
        const lowStockCount = await db
          .select({ count: count() })
          .from(product)
          .where(
            and(
              gt(product.stock, 0),
              lte(product.stock, input.lowStockThreshold),
              eq(product.deleted, false),
            ),
          )
          .then(normalizeCount);

        // Get new products count (created in the last 7 days)
        const newProductsCount = await db
          .select({ count: count() })
          .from(product)
          .where(and(gt(product.createdAt, oneWeekAgo), eq(product.deleted, false)))
          .then(normalizeCount);

        // Return product stats
        const productStats: ProductStats = {
          total: totalCount,
          outOfStock: outOfStockCount,
          lowStock: lowStockCount,
          newThisWeek: newProductsCount,
        };

        return productStats;
      }),
    );
  });
