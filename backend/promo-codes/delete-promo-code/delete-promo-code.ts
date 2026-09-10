import type { ClientSession } from "#root/backend/auth/shared/entities";
import { query } from "#root/shared/database/drizzle/db";
import {
  promoCode,
  promoCodeProducts, // For cascade delete verification if needed, though DB should handle
  promoCodeCategories, // For cascade delete verification if needed
} from "#root/shared/database/drizzle/schema";
import { ServerError } from "#root/shared/error/server";
import { Effect } from "effect";
import { z } from "zod";
import { eq } from "drizzle-orm";

export const deletePromoCodeSchema = z.object({
  id: z.string().uuid("Invalid promo code ID"),
});

export type DeletePromoCodeInput = z.infer<typeof deletePromoCodeSchema>;

export const deletePromoCode = (
  input: DeletePromoCodeInput,
  session?: ClientSession
) =>
  Effect.gen(function* ($) {
    if (!session || (session.role !== "admin" && session.role !== "superadmin")) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "Unauthorized",
            statusCode: 401,
            clientMessage: "Unauthorized",
          })
        )
      );
    }

    const existingPromo = yield* $(
      query(async (db) =>
        db
          .select({ id: promoCode.id })
          .from(promoCode)
          .where(eq(promoCode.id, input.id))
          .limit(1)
          .then((res) => res[0])
      )
    );

    if (!existingPromo) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "NotFound",
            statusCode: 404,
            clientMessage: "Promo code not found.",
          })
        )
      );
    }

    const deletedResult = yield* $(
      query(async (db) =>
        // Drizzle ORM handles cascading deletes if defined in the schema
        // promoCodeProducts and promoCodeCategories have onDelete: "cascade"
        // so they will be deleted automatically by the database.
        db
          .delete(promoCode)
          .where(eq(promoCode.id, input.id))
          .returning({ deletedId: promoCode.id })
      )
    );

    if (
      !deletedResult ||
      deletedResult.length === 0 ||
      !deletedResult[0]?.deletedId
    ) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "InternalServerError",
            clientMessage: "Failed to delete promo code.",
          })
        )
      );
    }

    return {
      id: deletedResult[0].deletedId,
      message: "Promo code deleted successfully.",
    };
  });
