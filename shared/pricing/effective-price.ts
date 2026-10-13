/**
 * THE effective-price rule — what one unit of a product costs before any
 * promotion (bundle, promo code, automatic offer) is applied.
 *
 *   A sale price counts only when it is VALID: present, not negative, and
 *   strictly below the regular price. Otherwise the regular price applies.
 *
 * This is the rule the storefront has always DISPLAYED (product cards, product
 * page, bundle builder: `discountPrice < price`). The order path used to
 * charge `discountPrice ?? price`, which differed only for a misconfigured row
 * (a "sale" price at or above the regular price): the page showed the regular
 * price while checkout charged the higher one. Every pricing path now goes
 * through this helper so they can't disagree.
 *
 * Promotion base: percentage promotions (Pick Your Set percentage tiers,
 * percentage promo codes) are computed on this effective price — the price the
 * shopper would otherwise pay — exactly like fixed-price bundles' savings,
 * automatic offers and promo codes always were. A sale price is a catalogue
 * price, not a promotion, so a shopper never gets more than ONE promotional
 * discount on a unit, and a promotion never re-discounts the regular price a
 * sale already reduced. Merchants who do not want sale items in a promotion
 * keep them out through the promotion's eligibility (pool / products /
 * categories / exclusions).
 */
export function effectiveUnitPrice(price: number, discountPrice: number | null | undefined): number {
  if (discountPrice === null || discountPrice === undefined) return price;
  if (!Number.isFinite(discountPrice) || discountPrice < 0) return price;
  return discountPrice < price ? discountPrice : price;
}

/** Same rule for the DB's decimal strings. */
export function effectiveUnitPriceFromRow(row: { price: string | number; discountPrice: string | number | null }): number {
  return effectiveUnitPrice(
    Number(row.price),
    row.discountPrice === null || row.discountPrice === "" ? null : Number(row.discountPrice),
  );
}
