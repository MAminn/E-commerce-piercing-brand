import { query } from "#root/shared/database/drizzle/db";
import { storeSettings } from "#root/shared/database/drizzle/schema";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { ServerError } from "#root/shared/error/server";
import type { ProductPageContent } from "./get-product-page-content";

/**
 * Upsert the Shipping / Returns / FAQs text shown on the product page.
 * If no row exists, it inserts one; otherwise it updates.
 */
export const updateProductPageContent = (content: ProductPageContent) =>
  Effect.gen(function* ($) {
    const updated = yield* $(
      query(async (db) => {
        const result = await db
          .update(storeSettings)
          .set({ productPageContent: content, updatedAt: new Date() })
          .where(eq(storeSettings.key, "default"))
          .returning();
        return result;
      }),
    );

    if (updated.length > 0) {
      return { productPageContent: updated[0]!.productPageContent as ProductPageContent };
    }

    const inserted = yield* $(
      query(async (db) => {
        const result = await db
          .insert(storeSettings)
          .values({ key: "default", productPageContent: content })
          .returning();
        return result;
      }),
    );

    if (!inserted[0]) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "FailedToUpdateProductPageContent",
            statusCode: 500,
            clientMessage: "Failed to save product page content",
          }),
        ),
      );
    }

    return { productPageContent: inserted[0].productPageContent as ProductPageContent };
  });
