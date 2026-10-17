/**
 * The customer-facing order number — one rule, used by the confirmation
 * email, the confirmation page, the customer account, the admin and the
 * courier descriptions.
 *
 * `order.order_number` is a database identity column (migration 0064):
 * unique, sequential, starting at 10001, assigned by Postgres on insert and
 * backfilled for older orders in placement order. It replaces the previous
 * "first 8 characters of the UUID" display. Order ids are UUIDv7, whose
 * leading characters are a timestamp prefix, so every order placed within
 * the same ~65 seconds showed the SAME "#XXXXXXXX".
 *
 * The UUID remains the internal key (URLs, webhooks, courier references);
 * this number is only ever a display/reference label.
 */

/** First number handed out. Also the backfill base for pre-existing orders. */
export const ORDER_NUMBER_START = 10001;

/**
 * `10001` → `"#10001"`. Empty string when the number is unknown (an API
 * response from before the column existed), so callers can hide the label
 * instead of showing a made-up reference.
 */
export function formatOrderNumber(
  orderNumber: number | string | null | undefined,
): string {
  if (orderNumber === null || orderNumber === undefined) return "";
  const n = typeof orderNumber === "string" ? Number(orderNumber.trim()) : orderNumber;
  if (!Number.isInteger(n) || n <= 0) return "";
  return `#${n}`;
}

/**
 * True when free text the admin typed refers to this order number —
 * "10001", "#10001" and " #10001 " all match. Used by the dashboard search.
 */
export function matchesOrderNumber(
  query: string,
  orderNumber: number | string | null | undefined,
): boolean {
  const q = query.trim().replace(/^#/, "");
  if (q === "" || orderNumber === null || orderNumber === undefined) return false;
  return String(orderNumber).includes(q);
}
