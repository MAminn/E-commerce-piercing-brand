/**
 * When an order BECOMES a GA4 purchase — pure, unit-tested.
 *
 *   COD     — at the persisted order creation (payment_status not_required),
 *             and only there. A later edit of a COD order never enqueues: an
 *             order placed while the browser owned the purchase has already
 *             been reported by the browser.
 *   online  — at the transition to payment_status `paid` (Paymob webhook,
 *             payment.verify polling, Stripe webhook, or an admin marking it
 *             paid). A repeated callback for an already-paid order is not a
 *             transition, and the outbox's unique order_id absorbs races.
 *
 * Never: pending / processing / failed / refunded payments, cancelled orders,
 * or any other update of an existing order.
 */
export type PurchaseSource = "order_create" | "payment_confirmed" | "stripe_webhook" | "admin_edit";

export interface OrderPaymentState {
  paymentMethod: string;
  paymentStatus: string;
  status: string;
}

export function isPurchaseMilestone(
  source: PurchaseSource,
  before: OrderPaymentState | null,
  after: OrderPaymentState,
): boolean {
  if (after.status === "cancelled") return false;
  if (source === "order_create") {
    return before === null && after.paymentMethod === "cod" && after.paymentStatus === "not_required";
  }
  if (!before) return false;
  return after.paymentMethod !== "cod" && after.paymentStatus === "paid" && before.paymentStatus !== "paid";
}
