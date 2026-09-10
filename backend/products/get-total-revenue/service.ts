import type { ClientSession } from "#root/backend/auth/shared/entities";
import { query } from "#root/shared/database/drizzle/db";
import { order } from "#root/shared/database/drizzle/schema";
import { ServerError } from "#root/shared/error/server";
import { sum } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";

export const getTotalRevenueSchema = z.object({});

export const getTotalRevenue = (
  input: z.infer<typeof getTotalRevenueSchema>,
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

    return yield* $(
      query(async (db) => {
        // Sum up all order totals for single-shop mode
        const result = await db
          .select({
            totalRevenue: sum(order.total),
          })
          .from(order);

        return Number(result[0]?.totalRevenue || 0);
      }),
    );
  });
