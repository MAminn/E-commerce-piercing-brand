import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import {
  promoCodeCategories,
  promoCodeExcludedProducts,
  promoCodeProducts,
  type promoCode,
} from "#root/shared/database/drizzle/schema";
import type { CartPromoInput } from "#root/shared/bundles/cart-pricing";
import type { EligibleQuantityRule, PromoEligibilityRules } from "#root/shared/pricing/eligible-units";
import { eq } from "drizzle-orm";

type PromoCodeRow = typeof promoCode.$inferSelect;
type Db = Pick<DatabaseClient, "select">;

/**
 * The code's full eligibility configuration — included products, included
 * categories and excluded products — read in three small queries. The same
 * loader backs `promoCode.validate` (preview) and create-order
 * (authoritative), so both judge a cart by identical rules.
 */
export async function loadPromoEligibility(
  db: Db,
  row: Pick<PromoCodeRow, "id" | "appliesToAllProducts">,
): Promise<PromoEligibilityRules> {
  const [products, categories, excluded] = await Promise.all([
    row.appliesToAllProducts
      ? Promise.resolve([])
      : db
          .select({ id: promoCodeProducts.productId })
          .from(promoCodeProducts)
          .where(eq(promoCodeProducts.promoCodeId, row.id)),
    row.appliesToAllProducts
      ? Promise.resolve([])
      : db
          .select({ id: promoCodeCategories.categoryId })
          .from(promoCodeCategories)
          .where(eq(promoCodeCategories.promoCodeId, row.id)),
    db
      .select({ id: promoCodeExcludedProducts.productId })
      .from(promoCodeExcludedProducts)
      .where(eq(promoCodeExcludedProducts.promoCodeId, row.id)),
  ]);
  return {
    appliesToAllProducts: row.appliesToAllProducts,
    productIds: products.map((p) => p.id),
    categoryIds: categories.map((c) => c.id),
    excludedProductIds: excluded.map((p) => p.id),
  };
}

export function promoQuantityRule(
  row: Pick<PromoCodeRow, "eligibleMinQuantity" | "eligibleMaxQuantity">,
): EligibleQuantityRule {
  return { minQuantity: row.eligibleMinQuantity ?? null, maxQuantity: row.eligibleMaxQuantity ?? null };
}

/** A stored code as the shared pricing layer consumes it. Never the client's copy. */
export function toCartPromoInput(
  row: Pick<PromoCodeRow, "discountType" | "discountValue" | "eligibleMinQuantity" | "eligibleMaxQuantity" | "freeShipping">,
  eligibility: PromoEligibilityRules,
): CartPromoInput {
  return {
    discountType: row.discountType,
    discountValue: Number(row.discountValue),
    eligibility,
    quantityRule: promoQuantityRule(row),
    freeShipping: row.freeShipping,
  };
}
