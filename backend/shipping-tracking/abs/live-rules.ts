import type { HistoryEvent } from "./parse";
import type { CanonicalStatus } from "./types";

/**
 * ABS Live — the pure eligibility rules for the ONE automatic transition
 * (`pending | processing | shipped → delivered`). No I/O. The writer
 * (live.ts) gathers `LiveFacts` inside the transaction that applies the
 * change, with the order row locked, and applies only when every rule below
 * passes. Any doubt → skip (and, for the cases a person must look at, the
 * "Needs your attention" list).
 *
 * Two phases, because the fresh ABS history is a network call that must not
 * run while the order row is locked:
 *   preCheck      everything we know locally (decision, link, shipment,
 *                 order compare-and-set, human activity, COD, age);
 *   historyCheck  the fresh GET /tracking/:awb/history and the settle window.
 * The writer runs preCheck before fetching the history and BOTH again inside
 * the transaction.
 */

export const LIVE_FROM_STATUSES = ["pending", "processing", "shipped"] as const;
export type LiveFromStatus = (typeof LIVE_FROM_STATUSES)[number];

/** ABS lastEventCode values that mean "not (fully) delivered" even when the status column says DELIVERED. */
export const NOT_DELIVERED_EVENT_CODES: ReadonlySet<string> = new Set(["SHP_PRTL_DLVD", "SHP_DLVD_RVRT"]);

/** Alert reasons that block an automatic Delivered while unacknowledged (on this AWB, or any AWB of the order). */
export const BLOCKING_ALERT_REASONS: ReadonlySet<string> = new Set([
  "cod_mismatch",
  "returned_after_delivered",
  "delivered_but_cancelled",
  "partially_delivered",
  "delivery_reverted",
  // NOT "delivery_problem": a hold / undelivered attempt BEFORE the delivery is normal.
  "unknown_status",
  "status_lost",
  "status_damaged",
  "status_investigation",
  "status_canceled",
  "status_reroute_initiated",
  "status_stock_in",
  "status_under_revision",
]);
/** Alerts on reverse / exchange / other shipments of the same order always block (`<role>_shipment_<status>`). */
export function isBlockingAlert(reasonCode: string | null): boolean {
  if (!reasonCode) return false;
  if (BLOCKING_ALERT_REASONS.has(reasonCode)) return true;
  return /^(reverse|exchange|other)_shipment_/.test(reasonCode);
}

export type LiveSkipReason =
  // decision
  | "decision_missing"
  | "decision_superseded"
  | "not_proposed"
  | "suppressed_by_human"
  | "already_applied"
  // order
  | "order_missing"
  | "already_delivered"
  | "order_cancelled"
  | "order_status_not_allowed"
  | "order_status_changed"
  | "order_total_changed"
  | "stock_restored"
  // link
  | "link_missing"
  | "link_not_usable"
  | "link_not_primary"
  | "link_method_not_allowed"
  | "link_changed"
  // shipment
  | "shipment_not_delivered"
  | "partial_or_reverted_event"
  | "under_revision"
  | "under_revision_unknown"
  | "reverse_service"
  // humans / exceptions
  | "human_changed"
  | "previously_delivered"
  | "open_alert"
  | "multiple_awbs"
  | "human_unlinked"
  // money
  | "cod_missing_collected"
  | "cod_mismatch"
  | "prepaid_not_paid"
  | "prepaid_cash_collected"
  // age
  | "no_delivery_date"
  | "too_old"
  // history
  | "history_unavailable"
  | "history_no_delivered"
  | "history_event_after_delivered"
  | "history_undated"
  | "settling"
  // writer-level
  | "paused"
  | "daily_cap"
  | "tick_cap"
  | "awaiting_approval"
  | "not_live";

/**
 * Reasons a person should look at ("Needs your attention"). Everything else
 * is either transient (settling, history unavailable, a change the next tick
 * recomputes), already handled (already delivered / applied) or a human's own
 * choice (suppressed).
 */
export const ATTENTION_REASONS: ReadonlySet<LiveSkipReason> = new Set<LiveSkipReason>([
  "order_cancelled",
  "stock_restored",
  "link_method_not_allowed",
  "partial_or_reverted_event",
  "under_revision",
  "under_revision_unknown",
  "reverse_service",
  "human_changed",
  "previously_delivered",
  "open_alert",
  "multiple_awbs",
  "human_unlinked",
  "cod_missing_collected",
  "cod_mismatch",
  "prepaid_not_paid",
  "prepaid_cash_collected",
  "no_delivery_date",
  "too_old",
  "history_no_delivered",
  "history_event_after_delivered",
  "history_undated",
  "daily_cap",
]);

export interface LiveFacts {
  now: Date;
  decision: {
    id: string;
    awb: string;
    orderId: string | null;
    decision: string;
    createdAt: Date;
    lastSeenAt: Date;
    acknowledgedAt: Date | null;
    applied: boolean;
    orderStatusAtDecision: string | null;
    orderTotalAtDecision: number | null;
    /** Is this the latest decision for its AWB? */
    isLatest: boolean;
  } | null;
  link: {
    state: string;
    role: string;
    method: string | null;
    orderId: string | null;
    updatedAt: Date;
    recomputeRequestedAt: Date | null;
  } | null;
  shipment: {
    status: CanonicalStatus;
    lastEventCode: string | null;
    cmpService: string | null;
    collectedCash: number | null;
    deliveryDate: Date | null;
    /** raw.isUnderRevision: true / false / null when ABS did not send it. */
    isUnderRevision: boolean | null;
    /** When WE first observed this AWB as DELIVERED (abs_shipment_status_history). */
    firstSeenDeliveredAt: Date | null;
  } | null;
  order: {
    id: string;
    status: string;
    total: number;
    paymentMethod: string;
    paymentStatus: string;
    stockRestored: boolean;
  } | null;
  /**
   * order_log status changes (status_changed / cancelled) not written by ABS,
   * after ABS first proposed Delivered for this AWB + order (the earliest
   * would_mark_delivered row, so a recomputed decision does not hide them).
   */
  humanStatusChangesSinceDecision: number;
  /** order_log shows the order was `delivered` at some point (old or new status). */
  everDelivered: boolean;
  /** Unacknowledged blocking alerts (decision id + reason) on this AWB or another AWB linked to the order. */
  openAlerts: Array<{ id: string; reasonCode: string }>;
  /** Other AWBs tied to this order: linked (any role, auto/confirmed) or listing it as a review candidate. */
  otherAwbs: number;
  /** abs_audit_log: a reject / unlink of this AWB after its last confirm / manual link. */
  humanUnlinked: boolean;
  /** An `applied` abs_live_application exists for this decision or for (order, delivered). */
  alreadyApplied: boolean;
}

export interface LiveRulesConfig {
  settleMinutes: number;
  maxAgeDays: number;
  codToleranceEgp: number;
}

export type LiveVerdict = { ok: true } | { ok: false; reason: LiveSkipReason; detail?: Record<string, unknown> };

const MIN = 60_000;
const DAY = 86_400_000;
const skip = (reason: LiveSkipReason, detail?: Record<string, unknown>): LiveVerdict => ({ ok: false, reason, ...(detail ? { detail } : {}) });
const OK: LiveVerdict = { ok: true };

export interface PreCheckOptions {
  /** An admin approved an old delivery ("delivered more than N days ago"): only the age rule is waived. */
  ignoreAge?: boolean;
}

/** Everything that does not need ABS. Order of the checks = which reason is reported. */
export function preCheck(f: LiveFacts, cfg: LiveRulesConfig, opts: PreCheckOptions = {}): LiveVerdict {
  const d = f.decision;
  // 1. The decision.
  if (!d) return skip("decision_missing");
  if (d.applied || f.alreadyApplied) return skip("already_applied");
  if (!d.isLatest) return skip("decision_superseded");
  if (d.decision !== "would_mark_delivered") return skip("not_proposed");
  if (d.acknowledgedAt) return skip("suppressed_by_human");

  // 2. The order exists and is in a state we may move forward.
  const o = f.order;
  if (!o) return skip("order_missing");
  if (o.status === "delivered") return skip("already_delivered");
  if (o.status === "cancelled") return skip("order_cancelled");
  if (!(LIVE_FROM_STATUSES as readonly string[]).includes(o.status)) return skip("order_status_not_allowed", { status: o.status });

  // 3. The link: primary, auto by reference / exact phone+amount, or human-confirmed; unchanged since the decision.
  const l = f.link;
  if (!l) return skip("link_missing");
  if (l.state !== "auto" && l.state !== "confirmed") return skip("link_not_usable", { state: l.state });
  if (l.role !== "primary") return skip("link_not_primary", { role: l.role });
  if (l.state === "auto" && l.method !== "reference" && l.method !== "phone_amount") return skip("link_method_not_allowed", { method: l.method });
  if (!l.orderId || l.orderId !== d.orderId || l.orderId !== o.id) return skip("link_changed");
  if (l.recomputeRequestedAt || l.updatedAt.getTime() > d.lastSeenAt.getTime()) return skip("link_changed");

  // 4. The shipment.
  const s = f.shipment;
  if (!s || s.status !== "DELIVERED") return skip("shipment_not_delivered", { status: s?.status ?? null });
  if (s.lastEventCode && NOT_DELIVERED_EVENT_CODES.has(s.lastEventCode.trim().toUpperCase())) return skip("partial_or_reverted_event", { lastEventCode: s.lastEventCode });
  if (s.isUnderRevision === true) return skip("under_revision");
  if (s.isUnderRevision === null) return skip("under_revision_unknown");
  const service = (s.cmpService ?? "").trim().toUpperCase();
  if (service && service !== "DELIVERY") return skip("reverse_service", { service });

  // 5. Never overwrite a human; never act on an open exception.
  if (f.humanStatusChangesSinceDecision > 0) return skip("human_changed", { changes: f.humanStatusChangesSinceDecision });
  if (f.everDelivered) return skip("previously_delivered");
  if (f.openAlerts.length > 0) return skip("open_alert", { alerts: f.openAlerts.slice(0, 5) });
  if (f.otherAwbs > 0) return skip("multiple_awbs", { otherAwbs: f.otherAwbs });
  if (f.humanUnlinked) return skip("human_unlinked");

  // 6. Compare-and-set against what the decision saw.
  if (d.orderStatusAtDecision !== o.status) return skip("order_status_changed", { atDecision: d.orderStatusAtDecision, now: o.status });
  if (d.orderTotalAtDecision === null || Math.abs(d.orderTotalAtDecision - o.total) > 0.001) {
    return skip("order_total_changed", { atDecision: d.orderTotalAtDecision, now: o.total });
  }
  if (o.stockRestored) return skip("stock_restored");

  // 7. Money. COD: collectedCash must be there and equal the total (cash alone is not enough).
  if (o.paymentMethod === "cod") {
    if (s.collectedCash === null) return skip("cod_missing_collected");
    if (Math.abs(s.collectedCash - o.total) > cfg.codToleranceEgp) return skip("cod_mismatch", { collected: s.collectedCash, total: o.total });
  } else {
    if (o.paymentStatus !== "paid") return skip("prepaid_not_paid", { paymentStatus: o.paymentStatus });
    if (s.collectedCash !== null && Math.abs(s.collectedCash) > 0.001) return skip("prepaid_cash_collected", { collected: s.collectedCash });
  }

  // 8. Delivery age.
  if (!s.deliveryDate) return skip("no_delivery_date");
  if (!opts.ignoreAge && f.now.getTime() - s.deliveryDate.getTime() > cfg.maxAgeDays * DAY) {
    return skip("too_old", { deliveredDaysAgo: Math.floor((f.now.getTime() - s.deliveryDate.getTime()) / DAY) });
  }
  return OK;
}

export type HistoryResult = { ok: true; events: HistoryEvent[] } | { ok: false; error: string };

/**
 * The fresh ABS history: it must contain DELIVERED, nothing may come after
 * the last DELIVERED, and DELIVERED must have been stable for the settle
 * window — counted from the LATER of ABS's last DELIVERED event and our own
 * first sighting of DELIVERED. An undated event makes the order unknowable →
 * skip.
 */
export function historyCheck(h: HistoryResult | null, f: Pick<LiveFacts, "now" | "shipment">, cfg: LiveRulesConfig): LiveVerdict {
  if (!h || !h.ok) return skip("history_unavailable", h && !h.ok ? { error: h.error.slice(0, 120) } : undefined);
  const events = h.events;
  const delivered = events.filter((e) => e.status === "DELIVERED");
  if (delivered.length === 0) return skip("history_no_delivered", { events: events.length });
  if (events.some((e) => e.occurredAt === null)) return skip("history_undated");
  const lastDelivered = Math.max(...delivered.map((e) => (e.occurredAt as Date).getTime()));
  const after = events.filter((e) => e.status !== "DELIVERED" && (e.occurredAt as Date).getTime() >= lastDelivered);
  if (after.length > 0) return skip("history_event_after_delivered", { after: after.slice(0, 3).map((e) => e.status) });
  const firstSeen = f.shipment?.firstSeenDeliveredAt?.getTime() ?? null;
  const settledFrom = Math.max(lastDelivered, firstSeen ?? lastDelivered);
  const waited = f.now.getTime() - settledFrom;
  if (waited < cfg.settleMinutes * MIN) return skip("settling", { minutesLeft: Math.ceil((cfg.settleMinutes * MIN - waited) / MIN) });
  return OK;
}

/** Both phases (tests, and the writer's in-transaction re-check). */
export function evaluateLive(f: LiveFacts, h: HistoryResult | null, cfg: LiveRulesConfig, opts: PreCheckOptions = {}): LiveVerdict {
  const pre = preCheck(f, cfg, opts);
  if (!pre.ok) return pre;
  return historyCheck(h, f, cfg);
}

/** The Cairo calendar day of an instant (`YYYY-MM-DD`): daily cap, skip dedupe, digest. */
export function cairoDay(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** Cairo wall-clock hour (0–23). */
export function cairoHour(at: Date): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", hour12: false }).format(at);
  return Number(h) % 24;
}

/** The order_log note of an automatic Delivered: no phone, no full AWB. */
export function liveNote(awb: string, decisionId: string, approvedBy: "auto" | "approval" | "approve_old"): string {
  const how = approvedBy === "auto" ? "" : approvedBy === "approval" ? " Approved on the ABS screen." : " Old delivery approved on the ABS screen.";
  return `[ABS auto] Delivered at ABS (AWB …${awb.slice(-4)}, decision ${decisionId}).${how}`;
}

export function undoNote(awb: string, applicationId: string, toStatus: string): string {
  return `[ABS auto-undo] Automatic Delivered undone, back to ${toStatus} (AWB …${awb.slice(-4)}, application ${applicationId}).`;
}

/** order_log notes written by ABS itself (not "a human change"). */
export function isAbsSystemNote(note: string | null): boolean {
  return typeof note === "string" && note.startsWith("[ABS auto]");
}
