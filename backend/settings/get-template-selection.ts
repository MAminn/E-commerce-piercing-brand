import { query } from "#root/shared/database/drizzle/db";
import { storeSettings } from "#root/shared/database/drizzle/schema";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

/**
 * Get the current template selection from the store_settings table.
 * Returns the stored JSON mapping of { pageType: templateId }
 * or an empty object if no selection exists yet.
 */
export const getTemplateSelection = () =>
  Effect.gen(function* ($) {
    const rows = yield* $(
      query(async (db) =>
        db
          .select({ templateSelection: storeSettings.templateSelection })
          .from(storeSettings)
          .where(eq(storeSettings.key, "default"))
          .limit(1),
      ),
    );

    const selection = rows[0]?.templateSelection;
    return (selection ?? {}) as Record<string, string>;
  });
