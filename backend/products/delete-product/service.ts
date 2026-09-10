import type { ClientSession } from "#root/backend/auth/shared/entities";
import { query } from "#root/shared/database/drizzle/db.js";
import { product } from "#root/shared/database/drizzle/schema.js";
import { ServerError } from "#root/shared/error/server";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";

export const deleteProductSchema = z.object({
  id: z.string().uuid(),
});

export const deleteProduct = (
  data: z.infer<typeof deleteProductSchema>,
  session?: ClientSession,
) =>
  Effect.gen(function* ($) {
    // Only admins can delete products (vendor role no longer valid)
    if (!session || (session.role !== "admin" && session.role !== "superadmin")) {
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

    // Single-shop mode: Soft-delete the product (keep for order history)
    return yield* $(
      query(async (db) => {
        await db
          .update(product)
          .set({ deleted: true })
          .where(eq(product.id, data.id));
        return;
      }),
    );
  });
