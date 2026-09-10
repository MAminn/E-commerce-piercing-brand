import { db } from "#root/shared/database/drizzle/db";
import { layoutSettings } from "#root/shared/database/drizzle/schema";
import { eq, and } from "drizzle-orm";
import type { LayoutSettings } from "#root/shared/types/layout-settings";
import { v7 as uuidv7 } from "uuid";

/**
 * Updates or creates layout settings for a specific merchant and template.
 */
export async function updateLayoutSettings(
  merchantId: string,
  content: LayoutSettings,
  templateId: string = "default",
): Promise<LayoutSettings> {
  const database = db();
  const now = new Date();

  const existing = await database
    .select()
    .from(layoutSettings)
    .where(
      and(
        eq(layoutSettings.merchantId, merchantId),
        eq(layoutSettings.templateId, templateId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await database
      .update(layoutSettings)
      .set({
        content: content as any,
        updatedAt: now,
      })
      .where(
        and(
          eq(layoutSettings.merchantId, merchantId),
          eq(layoutSettings.templateId, templateId),
        ),
      );
  } else {
    await database.insert(layoutSettings).values({
      id: uuidv7(),
      merchantId,
      templateId,
      content: content as any,
      createdAt: now,
      updatedAt: now,
    });
  }

  return content;
}
