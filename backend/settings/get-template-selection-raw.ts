import { storeSettings } from "#root/shared/database/drizzle/schema";
import { eq } from "drizzle-orm";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";

/**
 * Direct database query for SSR template selection injection.
 * Returns the stored { pageType: templateId } mapping so the server
 * and client render the same template from frame 1 (no hydration flicker).
 */
export async function getTemplateSelectionRaw(
  db: DatabaseClient,
): Promise<Record<string, string>> {
  try {
    const rows = await db
      .select({ templateSelection: storeSettings.templateSelection })
      .from(storeSettings)
      .where(eq(storeSettings.key, "default"))
      .limit(1)
      .execute();

    return (rows[0]?.templateSelection as Record<string, string>) ?? {};
  } catch {
    // Template selection is an enhancement — failures must not break page rendering
    return {};
  }
}
