import { query } from "#root/shared/database/drizzle/db";
import { storeSettings } from "#root/shared/database/drizzle/schema";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import type { LinkTreeConfig } from "#root/shared/types/link-tree";

/**
 * Upsert the link tree configuration in the store_settings table.
 * If no row exists, it inserts one; otherwise it updates.
 */
export const updateLinkTreeConfig = (config: LinkTreeConfig) =>
  Effect.gen(function* ($) {
    // Try to update existing row first
    const updated = yield* $(
      query(async (db) => {
        const result = await db
          .update(storeSettings)
          .set({ linkTreeConfig: config, updatedAt: new Date() })
          .where(eq(storeSettings.key, "default"))
          .returning({ linkTreeConfig: storeSettings.linkTreeConfig });
        return result;
      }),
    );

    if (updated.length > 0) {
      return updated[0]!.linkTreeConfig as LinkTreeConfig;
    }

    // No row exists yet — insert one
    const inserted = yield* $(
      query(async (db) => {
        const result = await db
          .insert(storeSettings)
          .values({ key: "default", linkTreeConfig: config })
          .returning({ linkTreeConfig: storeSettings.linkTreeConfig });
        return result;
      }),
    );

    return (inserted[0]?.linkTreeConfig ?? config) as LinkTreeConfig;
  });
