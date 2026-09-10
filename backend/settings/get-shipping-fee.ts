import { query } from "#root/shared/database/drizzle/db";
import { storeSettings } from "#root/shared/database/drizzle/schema";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

/**
 * Get the current shipping fee from the store_settings table.
 * If no row exists yet, returns the default (0).
 */
export const getShippingFee = () =>
  Effect.gen(function* ($) {
    const rows = yield* $(
      query(async (db) =>
        db
          .select({ shippingFee: storeSettings.shippingFee })
          .from(storeSettings)
          .where(eq(storeSettings.key, "default"))
          .limit(1),
      ),
    );

    const fee = rows[0]?.shippingFee;
    return fee ? Number.parseFloat(fee) : 0;
  });

/**
 * Raw (non-Effect) version for use in contexts that don't use Effect,
 * such as tRPC procedures that just need a quick read.
 * Accepts both a full DB client and a transaction.
 */
export async function getShippingFeeRaw(
  db: Pick<Parameters<Parameters<typeof query>[0]>[0], "select">,
): Promise<number> {
  const rows = await db
    .select({ shippingFee: storeSettings.shippingFee })
    .from(storeSettings)
    .where(eq(storeSettings.key, "default"))
    .limit(1);

  const fee = rows[0]?.shippingFee;
  return fee ? Number.parseFloat(fee) : 0;
}
