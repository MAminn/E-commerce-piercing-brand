import { query } from "#root/shared/database/drizzle/db";
import { storeSettings } from "#root/shared/database/drizzle/schema";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { ServerError } from "#root/shared/error/server";
import {
  DEFAULT_SHIPPING_RULES,
  parseShippingRules,
  validateShippingRules,
  type ShippingRulesConfig,
} from "#root/shared/shipping/rules";

/** Any client that can `select` — the pool or a transaction. Same trick as get-shipping-fee.ts. */
export type SelectableDb = Pick<
  Parameters<Parameters<typeof query>[0]>[0],
  "select"
>;

export interface StoredShippingRules {
  rules: ShippingRulesConfig;
  /** Flat-mode fee (`store_settings.shipping_fee`), already parsed. */
  flatFee: number;
  /** `store_settings.updated_at` — recorded on order snapshots as the rules revision. */
  updatedAt: Date | null;
}

/**
 * One read of the settings row gives the quote service everything it needs.
 * A missing row or a NULL/unparseable `shipping_rules` resolves to flat mode,
 * so a store that never opened the new admin card behaves exactly as before.
 */
export async function getShippingRulesRaw(db: SelectableDb): Promise<StoredShippingRules> {
  const rows = await db
    .select({
      shippingRules: storeSettings.shippingRules,
      shippingFee: storeSettings.shippingFee,
      updatedAt: storeSettings.updatedAt,
    })
    .from(storeSettings)
    .where(eq(storeSettings.key, "default"))
    .limit(1);

  const row = rows[0];
  if (!row) return { rules: DEFAULT_SHIPPING_RULES, flatFee: 0, updatedAt: null };

  return {
    rules: parseShippingRules(row.shippingRules),
    flatFee: row.shippingFee ? Number.parseFloat(row.shippingFee) : 0,
    updatedAt: row.updatedAt ?? null,
  };
}

export const getShippingRules = () =>
  Effect.gen(function* ($) {
    return yield* $(query(async (db) => getShippingRulesRaw(db)));
  });

/**
 * Upsert the rules. Refuses a zones config that could accept no order at all
 * (no governorate rates AND no fallback) — the same check the admin form runs.
 */
export const updateShippingRules = (rules: ShippingRulesConfig) =>
  Effect.gen(function* ($) {
    const problem = validateShippingRules(rules);
    if (problem) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "InvalidShippingRules",
            message: `Rejected shipping rules: ${problem}`,
            statusCode: 400,
            clientMessage: problem,
          }),
        ),
      );
    }

    const updated = yield* $(
      query(async (db) =>
        db
          .update(storeSettings)
          .set({ shippingRules: rules, updatedAt: new Date() })
          .where(eq(storeSettings.key, "default"))
          .returning({ shippingRules: storeSettings.shippingRules }),
      ),
    );
    if (updated[0]) return parseShippingRules(updated[0].shippingRules);

    const inserted = yield* $(
      query(async (db) =>
        db
          .insert(storeSettings)
          .values({ key: "default", shippingRules: rules })
          .returning({ shippingRules: storeSettings.shippingRules }),
      ),
    );
    return parseShippingRules(inserted[0]?.shippingRules ?? rules);
  });
