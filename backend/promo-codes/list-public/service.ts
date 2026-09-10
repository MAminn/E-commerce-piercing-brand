import { query } from "#root/shared/database/drizzle/db";
import { promoCode } from "#root/shared/database/drizzle/schema";
import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { Effect } from "effect";

/**
 * Publicly listable promo codes for the storefront Offers page.
 * Only exposes fields safe to show customers — no usage counts, creator, etc.
 */
export const listPublicPromoCodes = () =>
  Effect.gen(function* ($) {
    const now = new Date();
    const rows = yield* $(
      query((db) =>
        db
          .select({
            id: promoCode.id,
            code: promoCode.code,
            description: promoCode.description,
            discountType: promoCode.discountType,
            discountValue: promoCode.discountValue,
            minPurchaseAmount: promoCode.minPurchaseAmount,
          })
          .from(promoCode)
          .where(
            and(
              eq(promoCode.status, "active"),
              eq(promoCode.showOnOffersPage, true),
              or(isNull(promoCode.startDate), lte(promoCode.startDate, now)),
              or(isNull(promoCode.endDate), gte(promoCode.endDate, now)),
            ),
          ),
      ),
    );

    return rows.map((row) => ({
      ...row,
      discountValue: Number.parseFloat(row.discountValue),
      minPurchaseAmount: row.minPurchaseAmount
        ? Number.parseFloat(row.minPurchaseAmount)
        : null,
    }));
  });
