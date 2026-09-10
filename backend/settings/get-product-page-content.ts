import { query } from "#root/shared/database/drizzle/db";
import { storeSettings } from "#root/shared/database/drizzle/schema";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

export type ProductPageContent = {
  shippingText?: string;
  shippingTextAr?: string;
  returnsText?: string;
  returnsTextAr?: string;
  faqs?: Array<{ question: string; questionAr?: string; answer: string; answerAr?: string }>;
};

/**
 * Get the admin-controlled Shipping / Returns / FAQs text shown on the
 * product page. Returns an empty object if nothing has been configured yet
 * (the product page falls back to its own defaults in that case).
 */
export const getProductPageContent = () =>
  Effect.gen(function* ($) {
    const rows = yield* $(
      query(async (db) =>
        db
          .select({ productPageContent: storeSettings.productPageContent })
          .from(storeSettings)
          .where(eq(storeSettings.key, "default"))
          .limit(1),
      ),
    );

    return (rows[0]?.productPageContent ?? {}) as ProductPageContent;
  });
