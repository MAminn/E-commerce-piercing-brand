/**
 * Merchant-only order-line columns.
 *
 * `order_item.internal_code` is a snapshot of the product's merchant-only
 * internal code (see `backend/products/merchant-fields.ts` for the product
 * side). It is for admin fulfilment and history; a customer must never see
 * it — not in the checkout response, not on the confirmation page, not in
 * their order history, not in a confirmation email, invoice or receipt, and
 * not in any pixel event.
 *
 * This is a SEPARATE list from the product one on purpose. The two tables
 * happen to share a field name today, but they are audited independently and
 * a column added to one must not silently start being deleted from the other.
 *
 * The path that makes this necessary: `order.create` is a PUBLIC procedure
 * (guests check out) and it returns its inserted `order_item` rows straight
 * to the browser, so a new column on that table is customer-visible by
 * default. `viewOrders` is a PROTECTED procedure that serves an ordinary
 * signed-in shopper their own orders through the same query the admin uses,
 * so it strips for non-admins too.
 */
export const MERCHANT_ONLY_ORDER_ITEM_FIELDS = ["internalCode"] as const;

export type MerchantOnlyOrderItemField =
  (typeof MERCHANT_ONLY_ORDER_ITEM_FIELDS)[number];

/**
 * Returns a copy of `line` with every merchant-only key removed.
 *
 * The keys are deleted rather than nulled: a `null` still tells a customer
 * the field exists, and superjson would put it on the wire either way.
 */
export function stripOrderItemMerchantFields<T extends object>(
  line: T,
): Omit<T, MerchantOnlyOrderItemField> {
  const copy = { ...line } as Record<string, unknown>;
  for (const key of MERCHANT_ONLY_ORDER_ITEM_FIELDS) {
    delete copy[key];
  }
  return copy as Omit<T, MerchantOnlyOrderItemField>;
}

/** Convenience for the common "a whole order's lines" case. */
export function stripOrderItemsMerchantFields<T extends object>(
  lines: readonly T[],
): Omit<T, MerchantOnlyOrderItemField>[] {
  return lines.map(stripOrderItemMerchantFields);
}
