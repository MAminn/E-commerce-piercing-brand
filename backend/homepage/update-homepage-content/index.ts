import { db } from "#root/shared/database/drizzle/db";
import { homepageContent } from "#root/shared/database/drizzle/schema";
import { eq, and } from "drizzle-orm";
import type { HomepageContent } from "#root/shared/types/homepage-content";
import { v7 as uuidv7 } from "uuid";

/**
 * Updates or creates homepage content for a specific merchant and template.
 *
 * Handles a legacy DB issue: an old unique constraint on merchant_id alone
 * (`homepage_content_merchant_id_key`) may still exist alongside the newer
 * composite unique index on (merchant_id, template_id). This prevents
 * inserting a second row for the same merchant with a different template_id.
 *
 * Strategy:
 *  1. Try to UPDATE the exact (merchant_id, template_id) row.
 *  2. If no row matched, try to INSERT.
 *  3. If INSERT fails with a unique violation (the legacy constraint),
 *     fall back to updating the merchant's existing row and setting its
 *     template_id to the requested value.
 *
 * Once migration 0021 drops the stale constraint, Step 3 is never reached.
 */
export async function updateHomepageContent(
  merchantId: string,
  content: HomepageContent,
  templateId: string = "default",
): Promise<HomepageContent> {
  const database = db();
  const now = new Date();

  // Step 1: Try UPDATE first (most common case — row already exists)
  const updated = await database
    .update(homepageContent)
    .set({
      content: content as any,
      updatedAt: now,
    })
    .where(
      and(
        eq(homepageContent.merchantId, merchantId),
        eq(homepageContent.templateId, templateId),
      ),
    )
    .returning({ id: homepageContent.id });

  if (updated.length > 0) {
    return content;
  }

  // Step 2: No existing row — try INSERT
  try {
    await database.insert(homepageContent).values({
      id: uuidv7(),
      merchantId,
      templateId,
      content: content as any,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error: any) {
    // Step 3: INSERT failed due to stale unique constraint on merchant_id alone
    // Fall back to updating the existing "default" row to use this template
    if (
      error?.code === "23505" &&
      error?.constraint === "homepage_content_merchant_id_key"
    ) {
      await database
        .update(homepageContent)
        .set({
          templateId,
          content: content as any,
          updatedAt: now,
        })
        .where(eq(homepageContent.merchantId, merchantId));
    } else {
      throw error; // Re-throw if it's a different error
    }
  }

  return content;
}
