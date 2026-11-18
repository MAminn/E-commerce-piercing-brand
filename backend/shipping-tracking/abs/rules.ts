import { RETURNING_STATUSES, TRANSIT_STATUSES, type CanonicalStatus, type DecisionKind, type LinkRole, type LinkState, type WebsiteOrderStatus } from "./types";

/**
 * Pure rule engine: ABS shipment status × website order status → ONE
 * decision. Forward-only (never suggests moving an order backwards). In
 * Phase 1 every decision is only RECORDED (abs_tracking_decision, applied =
 * false); nothing here or downstream changes an order.
 */

export interface DecideInput {
  /** Website order status, null when the AWB has no usable link. */
  orderStatus: WebsiteOrderStatus | null;
  shipment: { status: CanonicalStatus; cash: number | null; collectedCash: number | null };
  link: { state: LinkState; role: LinkRole; reasonCode?: string | null } | null;
  /** Order total (EGP). */
  orderTotal: number | null;
  /** What ABS should collect; defaults to orderTotal (0 for a paid online order). */
  expectedCod?: number | null;
  codToleranceEgp?: number;
}

export interface Decision {
  decision: DecisionKind;
  reasonCode: string;
}

const PROBLEM_STATUSES: readonly CanonicalStatus[] = ["UNDELIVERED", "HOLD_DECISION", "REOPERATE"];
const TERMINAL_FOR_UNLINKED: readonly CanonicalStatus[] = ["DELIVERED", "RETURNED_TO_SHIPPER"];
const ALERT_ONLY: readonly CanonicalStatus[] = [
  "LOST",
  "DAMAGED",
  "INVESTIGATION",
  "CANCELED",
  "REROUTE_INITIATED",
  "STOCK_IN",
  "UNDER_REVISION",
  "UNKNOWN",
];

const d = (decision: DecisionKind, reasonCode: string): Decision => ({ decision, reasonCode });

export function decide(input: DecideInput): Decision {
  const { shipment, link, orderStatus } = input;
  const s = shipment.status;
  const tolerance = input.codToleranceEgp ?? 1;

  // Reverse / exchange / other: never a status decision on the primary order.
  if (link && link.role !== "primary") {
    if (ALERT_ONLY.includes(s) || PROBLEM_STATUSES.includes(s) || s === "PARTIALLY_DELIVERED" || s === "DELIVERY_REVERTED") {
      return d("alert", `${link.role}_shipment_${s.toLowerCase()}`);
    }
    return d("no_action", `${link.role}_shipment`);
  }

  const linked = link !== null && (link.state === "auto" || link.state === "confirmed") && orderStatus !== null;
  if (!linked) {
    if (TERMINAL_FOR_UNLINKED.includes(s)) return d("alert", "unlinked_terminal");
    if (ALERT_ONLY.includes(s)) return d("alert", s === "UNKNOWN" ? "unlinked_unknown_status" : `unlinked_${s.toLowerCase()}`);
    return d("no_action", link?.state === "needs_review" ? "link_needs_review" : "unlinked");
  }

  if (s === "NEW" || s === "AWAITING_PICKUP") return d("no_action", "not_picked_up");

  if (TRANSIT_STATUSES.includes(s)) {
    if (orderStatus === "pending" || orderStatus === "processing") return d("would_mark_shipped", "in_transit");
    return d("no_action", orderStatus === "cancelled" ? "in_transit_order_cancelled" : "order_already_ahead");
  }

  if (s === "DELIVERED") {
    if (orderStatus === "delivered") return d("no_action", "already_delivered");
    if (orderStatus === "cancelled") return d("alert", "delivered_but_cancelled");
    const expected = input.expectedCod ?? input.orderTotal;
    const collected = shipment.collectedCash ?? shipment.cash;
    if (expected === null || expected === undefined || collected === null || Math.abs(collected - expected) > tolerance) {
      return d("alert", "cod_mismatch");
    }
    return d("would_mark_delivered", "delivered_amount_ok");
  }

  if (s === "PARTIALLY_DELIVERED") return d("alert", "partially_delivered");
  if (s === "DELIVERY_REVERTED") return d("alert", "delivery_reverted");
  if (PROBLEM_STATUSES.includes(s)) return d("alert", "delivery_problem");

  if (RETURNING_STATUSES.includes(s)) {
    return d("no_action", orderStatus === "cancelled" ? "returning_order_cancelled" : "returning");
  }

  if (s === "RETURNED_TO_SHIPPER") {
    if (orderStatus === "delivered") return d("alert", "returned_after_delivered");
    if (orderStatus === "cancelled") return d("no_action", "returned_order_already_cancelled");
    // Returns are ALWAYS confirmed by a human after the parcel is physically back.
    return d("needs_return_confirmation", "returned_to_shipper");
  }

  // LOST, DAMAGED, INVESTIGATION, CANCELED, REROUTE_INITIATED, STOCK_IN, UNDER_REVISION, UNKNOWN.
  return d("alert", s === "UNKNOWN" ? "unknown_status" : `status_${s.toLowerCase()}`);
}

/** abs_tracking_decision.dedupe_key — one row per distinct observation. */
export function decisionDedupeKey(awb: string, shipmentStatus: CanonicalStatus, orderStatus: string | null, decision: DecisionKind): string {
  return `${awb}|${shipmentStatus}|${orderStatus ?? "none"}|${decision}`;
}
