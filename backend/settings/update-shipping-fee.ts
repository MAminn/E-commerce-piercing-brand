import { query } from "#root/shared/database/drizzle/db";
import { storeSettings } from "#root/shared/database/drizzle/schema";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { ServerError } from "#root/shared/error/server";

/**
 * Upsert the shipping fee in the store_settings table.
 * If no row exists, it inserts one; otherwise it updates.
 */
export const updateShippingFee = (fee: number) =>
  Effect.gen(function* ($) {
    if (fee < 0) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "InvalidShippingFee",
            statusCode: 400,
            clientMessage: "Shipping fee cannot be negative",
          }),
        ),
      );
    }

    const feeStr = fee.toFixed(2);

    // Try to update existing row first
    const updated = yield* $(
      query(async (db) => {
        const result = await db
          .update(storeSettings)
          .set({ shippingFee: feeStr, updatedAt: new Date() })
          .where(eq(storeSettings.key, "default"))
          .returning();
        return result;
      }),
    );

    if (updated.length > 0) {
      return { shippingFee: Number.parseFloat(updated[0]!.shippingFee) };
    }

    // No row exists yet — insert one
    const inserted = yield* $(
      query(async (db) => {
        const result = await db
          .insert(storeSettings)
          .values({ key: "default", shippingFee: feeStr })
          .returning();
        return result;
      }),
    );

    if (!inserted[0]) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "FailedToUpdateShippingFee",
            statusCode: 500,
            clientMessage: "Failed to save shipping fee",
          }),
        ),
      );
    }

    return { shippingFee: Number.parseFloat(inserted[0].shippingFee) };
  });
