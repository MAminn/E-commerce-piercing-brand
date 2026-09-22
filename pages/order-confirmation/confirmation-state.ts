/**
 * What /order-confirmation is allowed to say, and when.
 *
 * The page used to derive everything from the query string alone:
 * `isPaymentSuccess` was `!isPaymentFailed && !isPaymentPending`, and with no
 * parameters at all none of those were true — so a bare visit to
 * `/order-confirmation` rendered "Order placed" for an order that does not
 * exist. Anyone who bookmarked the page, or typed the URL, was told their
 * order had been received.
 *
 * Nothing here trusts the URL for whether an order exists. The only thing the
 * query string contributes is *which* order to look up and what the payment
 * provider claimed on the way back; the order itself has to come back from
 * `payment.verify` before the page says anything affirmative.
 *
 * Kept as a pure module so every state below is testable without a browser.
 */

/** What the `payment` query parameter claimed. Never trusted on its own. */
export type PaymentParam = "none" | "success" | "pending" | "cancelled" | "failed";

/** The payment states `order.payment_status` can hold (see schema.ts). */
export type OrderPaymentStatus =
  | "not_required"
  | "pending"
  | "processing"
  | "paid"
  | "failed"
  | "refunded";

/** The subset of the verified order this page renders from. */
export interface VerifiedOrder {
  paymentStatus: OrderPaymentStatus;
}

/**
 * Result of looking the order up on the server.
 * `missing` covers "no such order", a rejected request and a malformed
 * response alike: in every one of those cases this page does not know that an
 * order exists, which is the only thing that matters here.
 */
export type OrderLookup =
  | { status: "loading" }
  | { status: "found"; order: VerifiedOrder }
  | { status: "missing" };

export type ConfirmationView =
  | { kind: "loading" }
  | { kind: "not-found" }
  /** The order row exists. `paid` is true only when the gateway confirmed it. */
  | { kind: "placed"; paid: boolean }
  | { kind: "pending" }
  | { kind: "failed"; reason: "cancelled" | "failed" };

/**
 * Order ids are UUIDs (`order.id`), and `payment.verify` rejects anything
 * else with a Zod error. Checking the shape here means a junk `?id=` renders
 * the same neutral not-found state as a missing one instead of flashing a
 * spinner until the request comes back.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isOrderReference(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export function parsePaymentParam(raw: string | null | undefined): PaymentParam {
  if (!raw) return "none";
  switch (raw.toLowerCase()) {
    case "success":
      return "success";
    case "pending":
      return "pending";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "failed":
      return "failed";
    default:
      return "none";
  }
}

export function deriveConfirmationView(input: {
  /** Raw `?id=` value, or null when absent. */
  orderRef: string | null | undefined;
  paymentParam: PaymentParam;
  lookup: OrderLookup;
}): ConfirmationView {
  // No usable order reference — the page has nothing to confirm. This is the
  // direct-visit case, and it must never fall through to an affirmative state.
  if (!isOrderReference(input.orderRef)) return { kind: "not-found" };

  if (input.lookup.status === "loading") return { kind: "loading" };
  if (input.lookup.status === "missing") return { kind: "not-found" };

  const { paymentStatus } = input.lookup.order;

  // The stored status wins over the query string wherever it is decisive: a
  // customer who reopens a `payment=cancelled` link after the webhook landed
  // should see the payment that actually succeeded, and vice versa.
  if (paymentStatus === "paid") return { kind: "placed", paid: true };
  if (paymentStatus === "failed") {
    return {
      kind: "failed",
      reason: input.paymentParam === "cancelled" ? "cancelled" : "failed",
    };
  }

  // Gateway sent the customer back through the cancel URL and the order is
  // still unpaid.
  if (input.paymentParam === "cancelled" || input.paymentParam === "failed") {
    return { kind: "failed", reason: input.paymentParam };
  }

  // Online payment created but not yet confirmed by webhook or polling.
  if (paymentStatus === "pending" || paymentStatus === "processing") {
    return { kind: "pending" };
  }

  // `not_required` (COD) and `refunded`: the order exists and no payment is
  // outstanding at checkout time. "Order placed", with no claim about money.
  return { kind: "placed", paid: false };
}
