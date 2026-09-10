import type { ClientSession } from "#root/backend/auth/shared/entities";
import { query } from "#root/shared/database/drizzle/db";
import { order } from "#root/shared/database/drizzle/schema";
import { ServerError } from "#root/shared/error/server";
import { count, eq } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";

export const getOrderStatsSchema = z.object({});

export interface OrderStats {
  pending: number;
  processing: number;
  shipped: number;
  delivered: number;
  cancelled: number;
}

function normalizeCount(rows: { count: number }[]): number {
  return rows[0]?.count ?? 0;
}

export const getOrderStats = (
  _input: z.infer<typeof getOrderStatsSchema>,
  session?: ClientSession,
) =>
  Effect.gen(function* ($) {
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

    if (session.role !== "admin" && session.role !== "superadmin") {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "Forbidden",
            statusCode: 403,
            clientMessage: "Admin access required",
          }),
        ),
      );
    }

    return yield* $(
      query(async (db) => {
        const pendingCount = await db
          .select({ count: count() })
          .from(order)
          .where(eq(order.status, "pending"))
          .then(normalizeCount);

        const processingCount = await db
          .select({ count: count() })
          .from(order)
          .where(eq(order.status, "processing"))
          .then(normalizeCount);

        const shippedCount = await db
          .select({ count: count() })
          .from(order)
          .where(eq(order.status, "shipped"))
          .then(normalizeCount);

        const deliveredCount = await db
          .select({ count: count() })
          .from(order)
          .where(eq(order.status, "delivered"))
          .then(normalizeCount);

        const cancelledCount = await db
          .select({ count: count() })
          .from(order)
          .where(eq(order.status, "cancelled"))
          .then(normalizeCount);

        const orderStats: OrderStats = {
          pending: pendingCount,
          processing: processingCount,
          shipped: shippedCount,
          delivered: deliveredCount,
          cancelled: cancelledCount,
        };

        return orderStats;
      }),
    );
  });
