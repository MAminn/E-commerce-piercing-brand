import type { WaButtonAction, WaReviewType, WaState } from "./types";

/**
 * The ONE place that decides what a customer's button press does. Pure, so
 * the full matrix (mode × order status × ABS link × previous answer × button)
 * is unit-tested without a database.
 *
 * Hard rules:
 *   - The only order change ever produced is `pending → processing`, on
 *     `confirm`, when the order is still pending, not archived, has no ABS
 *     link / decision, the mode may act on this number, and the row carries
 *     the shopper's own checkout consent.
 *   - `modify` and `cancel` NEVER change the order; they open a staff item.
 *   - A repeated press of the same button is a no-op.
 *   - A late or conflicting answer never reverts anything; staff decide.
 */

export interface DecisionFacts {
  action: WaButtonAction;
  /** May this mode change orders for this recipient? (pilot+allow-listed, or live) */
  canAct: boolean;
  /** Does the row carry the shopper's own checkout consent? (default true for callers that predate it) */
  consented?: boolean;
  orderStatus: "pending" | "processing" | "shipped" | "delivered" | "cancelled" | null;
  archived: boolean;
  absLinked: boolean;
  current: { state: WaState; response: string | null; statusApplied: boolean };
}

export interface Decision {
  /** No write at all (duplicate press). */
  noop: boolean;
  newState: WaState;
  response: WaButtonAction;
  /** Change the order pending → processing (through applyOrderStatusChange). */
  applyProcessing: boolean;
  /** Recorded on the row when a confirm does not change the order. */
  skipReason: string | null;
  /** Shadow / not-allowed: what a confirm WOULD have done. */
  wouldApply: string | null;
  review: { type: WaReviewType; detail: string } | null;
}

const CLOSED_ORDER = new Set(["shipped", "delivered", "cancelled"]);

export function decideResponse(f: DecisionFacts): Decision {
  const base = { noop: false, response: f.action, applyProcessing: false, skipReason: null, wouldApply: null, review: null } as const;

  if (f.orderStatus === null) {
    return { ...base, newState: f.current.state, skipReason: "order_missing", review: { type: "unmatched", detail: "Reply for an order that no longer exists" } };
  }

  // Same button again (after it was recorded) → nothing.
  if (f.current.response === f.action) {
    return { ...base, noop: true, newState: f.current.state };
  }

  const closed = CLOSED_ORDER.has(f.orderStatus);

  if (f.action === "confirm") {
    let skip: string | null = null;
    if (f.archived) skip = "archived";
    else if (closed) skip = `order_${f.orderStatus}`;
    else if (f.orderStatus !== "pending") skip = "not_pending";
    else if (f.absLinked) skip = "abs_linked";

    const review =
      skip === "archived" || closed
        ? { type: "late_reply" as const, detail: `Customer confirmed but the order is ${f.archived ? "archived" : f.orderStatus}` }
        : f.current.response === "cancel" || f.current.response === "modify"
          ? { type: "late_reply" as const, detail: `Customer confirmed after asking to ${f.current.response}` }
          : null;

    if (skip) return { ...base, newState: "confirmed", skipReason: skip, review };
    // A real recipient without checkout consent: never acted on (defence in
    // depth — such a row is never messaged in the first place).
    if (f.canAct && f.consented === false) return { ...base, newState: "confirmed", skipReason: "no_consent", review };
    if (!f.canAct) return { ...base, newState: "confirmed", skipReason: "shadow", wouldApply: "apply", review };
    return { ...base, newState: "confirmed", applyProcessing: true, review };
  }

  if (f.action === "modify") {
    return {
      ...base,
      newState: "modify_requested",
      review: closed
        ? { type: "late_reply", detail: `Customer asked to modify but the order is ${f.orderStatus}` }
        : { type: "modify", detail: f.current.statusApplied ? "Asked to modify after confirming (order is processing)" : "Customer asked to modify the order" },
    };
  }

  // cancel
  return {
    ...base,
    newState: "cancel_requested",
    review: closed
      ? { type: "late_reply", detail: `Customer asked to cancel but the order is ${f.orderStatus}` }
      : { type: "cancel", detail: f.current.statusApplied ? "Asked to cancel after confirming (order is processing)" : "Customer asked to cancel the order" },
  };
}
