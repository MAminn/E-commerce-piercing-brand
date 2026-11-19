/**
 * Plain-English labels for the ABS tracking screen (the owner reads this on
 * a phone; no courier or accounting jargon).
 */

const ABS_STATUS: Record<string, string> = {
  NEW: "Created at ABS",
  AWAITING_PICKUP: "Waiting for pickup",
  PICKED_UP: "Picked up",
  AT_ORIGIN_BRANCH: "At ABS branch",
  IN_TRANSIT: "On the way",
  AT_DESTINATION_BRANCH: "At delivery branch",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  PARTIALLY_DELIVERED: "Partly delivered",
  DELIVERY_REVERTED: "Delivery cancelled by ABS",
  UNDELIVERED: "Not delivered",
  HOLD_DECISION: "On hold",
  REOPERATE: "Trying again",
  RETURN_INITIATED: "Return started",
  RETURN_IN_TRANSIT: "Coming back",
  AT_RETURN_BRANCH: "Back at ABS branch",
  OUT_FOR_RETURN: "On the way back to us",
  RETURNED_TO_SHIPPER: "Returned to us",
  REROUTE_INITIATED: "Re-routed",
  INVESTIGATION: "Under investigation",
  LOST: "Lost",
  DAMAGED: "Damaged",
  CANCELED: "Cancelled at ABS",
  STOCK_IN: "Stocked in at ABS",
  UNDER_REVISION: "Under revision",
  UNKNOWN: "Unknown status",
};
export const absStatusLabel = (s: string | null | undefined) => (s ? (ABS_STATUS[s] ?? s) : "—");

const WEBSITE_STATUS: Record<string, string> = {
  pending: "Pending",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
export const websiteStatusLabel = (s: string | null | undefined) => (s ? (WEBSITE_STATUS[s] ?? s) : "Not linked");

const REASON: Record<string, string> = {
  // decisions
  delivered_amount_ok: "ABS delivered it and collected the right amount",
  in_transit: "ABS has it on the way",
  cod_mismatch: "ABS collected a different amount than the order total",
  delivery_problem: "Delivery problem at ABS (on hold, not delivered or retrying)",
  partially_delivered: "ABS says only part was delivered",
  delivery_reverted: "ABS cancelled the delivery after marking it delivered",
  returned_to_shipper: "ABS returned the parcel to us",
  returned_after_delivered: "ABS returned it, but the website says Delivered",
  delivered_but_cancelled: "ABS delivered it, but the order is cancelled",
  unlinked_terminal: "Delivered or returned at ABS, but not linked to a website order",
  unknown_status: "ABS sent a status we do not know yet",
  unlinked_unknown_status: "Unknown ABS status, not linked to an order",
  // links
  multiple_candidates: "Several open orders match this phone and amount",
  fuzzy_phone: "The phone almost matches (typing mistake?)",
  fuzzy_multiple: "Several orders with an almost-matching phone",
  reference_phone_mismatch: "ABS Reference names an order, but the phone differs",
  order_already_linked: "The matching order is already linked to another shipment",
  reverse_shipment: "Return shipment — pick the original order",
  exchange_shipment: "Exchange shipment — pick the original order",
  other_shipment: "Special ABS service — pick the order",
  previously_unlinked: "You unlinked this shipment before — please choose",
  no_candidate: "No website order with this phone",
  no_phone: "ABS has no usable phone for this shipment",
  no_cod_amount: "ABS shows no cash amount",
  cancelled_order_match: "Only a cancelled order matches",
  unlinked_by_admin: "Unlinked by an admin",
  rejected_by_admin: "Rejected by an admin",
  manual_link: "Linked by an admin",
};
export function reasonLabel(code: string | null | undefined): string {
  if (!code) return "";
  if (REASON[code]) return REASON[code];
  const status = /^(?:unlinked_|status_|reverse_shipment_|exchange_shipment_|other_shipment_)(.+)$/.exec(code);
  if (status?.[1]) return `ABS status: ${absStatusLabel(status[1].toUpperCase())}`;
  return code.replace(/_/g, " ");
}

export function candidateReasonLabel(r: string): string {
  if (r === "phone_exact") return "same phone";
  if (r === "phone_fuzzy") return "phone almost the same";
  if (r === "amount_ok") return "amount matches";
  if (r === "reference") return "order number in ABS Reference";
  if (r === "outside_window") return "outside the usual dates";
  if (r === "order_cancelled") return "order is cancelled";
  if (r === "already_linked") return "already linked to another shipment";
  if (r === "no_cod_amount") return "no ABS amount";
  const m = /^cod_mismatch:([\d.]+)vs([\d.]+)$/.exec(r);
  if (m) return `order ${m[1]} vs ABS ${m[2]}`;
  return r.replace(/_/g, " ");
}

export const MISS_REASON: Record<string, string> = {
  not_delivered_at_abs: "ABS never showed it delivered (e.g. our own courier delivered it)",
  cod_mismatch: "Amount differed, so Shadow held back (correct)",
  unlinked_when_delivered: "Shipment was not linked yet when ABS delivered it",
  website_delivered_first: "Marked Delivered on the website before ABS reported it",
  website_shipped_first: "Marked Shipped on the website before ABS picked it up",
  not_in_transit_at_abs: "ABS never showed it moving",
  unlinked_when_in_transit: "Shipment was not linked yet while on the way",
  unexplained: "Not explained by a rule — please report",
};
export const missReasonLabel = (r: string) => MISS_REASON[r] ?? (r.startsWith("alert:") ? `Shadow raised a problem instead: ${reasonLabel(r.slice(6))}` : r);

export const FP_REASON: Record<string, string> = {
  order_cancelled_later: "The order was cancelled later",
  link_rejected_by_admin: "An admin rejected the link",
  link_unlinked_by_admin: "An admin unlinked it",
  link_replaced_by_admin: "An admin linked it to a different order",
};
export const fpReasonLabel = (r: string | null) =>
  r ? (FP_REASON[r] ?? (r.startsWith("abs_status_moved_to_") ? `ABS later changed it to: ${absStatusLabel(r.slice(20).toUpperCase())}` : r)) : "";

export const FILTER_LABELS: Record<string, string> = {
  all: "All",
  needs_review: "Needs review",
  unmatched: "Not matched",
  alerts: "Problems",
  would_change: "Would change the website",
  delivered_not_on_website: "Delivered at ABS, not on website",
  returned_to_us: "Returned to us",
};

export const AUDIT_LABELS: Record<string, string> = {
  link_confirm: "Confirmed a match",
  link_reject: "Rejected a match",
  link_manual: "Linked to an order by hand",
  link_unlink: "Unlinked",
  alert_ack: "Acknowledged",
  poll_now: "Checked ABS now",
  live_apply: "Marked Delivered (ABS)",
  live_undo: "Undid an automatic Delivered",
  live_pause: "Paused automatic Delivered",
  live_resume: "Resumed automatic Delivered",
  live_suppress: "Said: don't mark this one",
  alert_email: "Alert email",
  digest_email: "Daily summary email",
};

/** Why live mode did not mark an order Delivered (owner-facing). */
export const LIVE_REASON: Record<string, string> = {
  order_cancelled: "The order is cancelled on the website",
  stock_restored: "The order's stock was already put back",
  link_method_not_allowed: "Matched only by a similar phone number — please confirm the match",
  partial_or_reverted_event: "ABS reports a partial or reverted delivery",
  under_revision: "ABS has this shipment under revision",
  under_revision_unknown: "ABS did not say whether this shipment is under revision",
  reverse_service: "This is a return or exchange shipment",
  human_changed: "Someone changed this order's status after ABS delivered it",
  previously_delivered: "This order was Delivered before and then changed back",
  open_alert: "There is an open problem on this order or shipment",
  multiple_awbs: "More than one ABS shipment is tied to this order",
  human_unlinked: "Someone unlinked this shipment",
  cod_missing_collected: "ABS has not confirmed the collected amount yet",
  cod_mismatch: "ABS collected a different amount than the order total",
  prepaid_not_paid: "Paid-online order, but the website does not show it as paid",
  prepaid_cash_collected: "Paid-online order, but ABS collected cash",
  no_delivery_date: "ABS gave no delivery date",
  too_old: "Delivered a while ago — approve to mark it Delivered",
  history_no_delivered: "ABS's own history does not show a delivery",
  history_event_after_delivered: "ABS's history shows something after the delivery (return or dispute)",
  history_undated: "ABS's history has events without a date",
  daily_cap: "Daily limit reached — will continue tomorrow",
  apply_error: "Something went wrong; nothing was changed",
};
export const liveReasonLabel = (r: string) => LIVE_REASON[r] ?? r;

/** Attention groups for live rows (the rest go to "Couldn't mark Delivered automatically"). */
export const LIVE_AMOUNT_REASONS = ["cod_mismatch", "cod_missing_collected", "prepaid_not_paid", "prepaid_cash_collected"];
export const LIVE_DISPUTE_REASONS = ["history_event_after_delivered", "partial_or_reverted_event", "previously_delivered", "open_alert", "under_revision", "under_revision_unknown"];

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `EGP ${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

export function ago(d: Date | string | null | undefined, now: Date = new Date()): string {
  if (!d) return "never";
  const ms = now.getTime() - new Date(d).getTime();
  if (ms < 60_000) return "just now";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function shortDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Cairo" });
}

export function pct(x: number | null | undefined): string {
  return x === null || x === undefined ? "n/a" : `${Math.round(x * 1000) / 10}%`;
}
