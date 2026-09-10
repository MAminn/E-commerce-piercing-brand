import { query } from "#root/shared/database/drizzle/db";
import { storeSettings } from "#root/shared/database/drizzle/schema";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

/**
 * Upsert template selection in the store_settings table.
 * Accepts a full mapping of { pageType: templateId }.
 * If no settings row exists, inserts one; otherwise updates.
 */
export const updateTemplateSelection = (selection: Record<string, string>) =>
  Effect.gen(function* ($) {
    // Try to update existing row first
    const updated = yield* $(
      query(async (db) => {
        const result = await db
          .update(storeSettings)
          .set({
            templateSelection: selection,
            updatedAt: new Date(),
          })
          .where(eq(storeSettings.key, "default"))
          .returning({ templateSelection: storeSettings.templateSelection });
        return result;
      }),
    );

    if (updated.length > 0) {
      return (updated[0]!.templateSelection ?? {}) as Record<string, string>;
    }

    // No row exists yet — insert one
    const inserted = yield* $(
      query(async (db) => {
        const result = await db
          .insert(storeSettings)
          .values({
            key: "default",
            templateSelection: selection,
          })
          .returning({ templateSelection: storeSettings.templateSelection });
        return result;
      }),
    );

    return (inserted[0]?.templateSelection ?? {}) as Record<string, string>;
  });
