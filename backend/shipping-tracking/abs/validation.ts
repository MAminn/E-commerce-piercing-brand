import { and, gte, inArray, lte, or, sql } from "drizzle-orm";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import {
  absAuditLog,
  absOrderLink,
  absShipment,
  absShipmentStatusHistory,
  absSyncRun,
  absTrackingDecision,
  order,
  orderLog,
} from "#root/shared/database/drizzle/schema";
import { parseMoney } from "./normalize";
import { RETURNING_STATUSES, TRANSIT_STATUSES } from "./types";

/**
 * Shadow validation report — the gate before anyone proposes live mode.
 *
 * Measures Shadow against what admins actually did on the website
 * (order_log `status_changed`), using only SELECTs on abs_*, `order` and
 * `order_log`. Writes nothing.
 *
 *   Delivered agreement  every order that got would_mark_delivered, and whether an
 *                        admin later set it delivered (lead time = decision first
 *                        seen → admin change).
 *   Delivered misses     orders an admin set delivered in the range that have an
 *                        auto|confirmed primary ABS link but never got
 *                        would_mark_delivered — each with the rule that explains it.
 *   False positives      would_mark_delivered whose order was later cancelled, whose
 *                        ABS status later left DELIVERED, or whose link a human
 *                        later rejected / unlinked / replaced.
 *   Matching quality     auto links later overruled by a human (precision), review
 *                        links confirmed as the top candidate, unmatched rate —
 *                        split by method.
 *   Shipped agreement    the same for would_mark_shipped (secondary).
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
/** ABS statuses that mean "not delivered after all". */
export const MOVED_AWAY_FROM_DELIVERED: readonly string[] = ["DELIVERY_REVERTED", "PARTIALLY_DELIVERED", ...RETURNING_STATUSES, "RETURNED_TO_SHIPPER"];

export interface FactDecision {
  id: string;
  awb: string;
  orderId: string | null;
  decision: string;
  reasonCode: string | null;
  shipmentStatus: string;
  orderStatusSeen: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  acknowledgedAt: Date | null;
}
export interface FactLink {
  awb: string;
  orderId: string | null;
  state: string;
  role: string;
  method: string | null;
}
export interface FactOrder {
  id: string;
  orderNumber: number;
  status: string;
  total: number;
}
export interface FactStatusChange {
  orderId: string;
  newStatus: string | null;
  at: Date;
}
export interface FactHistory {
  awb: string;
  status: string;
  observedAt: Date;
}
export interface FactAudit {
  action: string;
  awb: string | null;
  at: Date;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}
export interface ValidationFacts {
  shadowStartedAt: Date | null;
  decisions: FactDecision[];
  links: FactLink[];
  orders: Map<string, FactOrder>;
  statusChanges: FactStatusChange[];
  history: FactHistory[];
  shipmentStatus: Map<string, string>;
  /** status_raw of shipments the normaliser mapped to UNKNOWN. */
  unknownStatuses: string[];
  audit: FactAudit[];
}

export interface ProposalRow {
  orderId: string;
  orderNumber: number | null;
  awb: string;
  firstSeenAt: string;
  outcome: "agreed" | "pending" | "false_positive";
  reason: string | null;
  websiteStatus: string | null;
  websiteChangedAt: string | null;
  leadHours: number | null;
}
export interface MissRow {
  orderId: string;
  orderNumber: number | null;
  awb: string;
  websiteChangedAt: string;
  reason: string;
}
export interface AgreementBlock {
  proposed: number;
  agreed: number;
  pending: number;
  falsePositives: number;
  misses: number;
  /** agreed / (agreed + false positives); null when nothing is settled yet. */
  precision: number | null;
  /** agreed / (agreed + misses); null when nothing to measure. */
  recall: number | null;
  medianLeadHours: number | null;
  proposals: ProposalRow[];
  missList: MissRow[];
}
export interface MethodQuality {
  autoLinks: number;
  overruled: number;
  precision: number | null;
}
export interface ValidationReport {
  from: string;
  to: string;
  shadowStartedAt: string | null;
  shadowDays: number;
  delivered: AgreementBlock;
  shipped: AgreementBlock;
  matching: {
    byMethod: Record<string, MethodQuality>;
    autoLinks: number;
    autoOverruled: number;
    autoPrecision: number | null;
    reviewConfirmed: number;
    reviewConfirmedTopCandidate: number;
    manualLinks: number;
    links: number;
    unmatched: number;
    unmatchedRate: number | null;
  };
  openAlertsByReason: Record<string, number>;
  absDeliveredOrders: number;
  unknownStatuses: string[];
  targets: Array<{ name: string; met: boolean; value: string }>;
}

const ratio = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 10_000) / 10_000);
const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Open = the AWB's LATEST decision is an alert / return confirmation nobody acknowledged. */
export function latestDecisionPerAwb<T extends { awb: string; lastSeenAt: Date; createdAt: Date }>(rows: T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const r of rows) {
    const cur = out.get(r.awb);
    if (!cur || r.lastSeenAt.getTime() > cur.lastSeenAt.getTime() || (r.lastSeenAt.getTime() === cur.lastSeenAt.getTime() && r.createdAt.getTime() > cur.createdAt.getTime())) {
      out.set(r.awb, r);
    }
  }
  return out;
}
export const ACKNOWLEDGEABLE: readonly string[] = ["alert", "needs_return_confirmation"];
export function isOpenAlert(d: { decision: string; acknowledgedAt: Date | null }): boolean {
  return ACKNOWLEDGEABLE.includes(d.decision) && d.acknowledgedAt === null;
}

function agreement(
  facts: ValidationFacts,
  range: { from: Date; to: Date },
  kind: "delivered" | "shipped",
): AgreementBlock {
  const proposal = kind === "delivered" ? "would_mark_delivered" : "would_mark_shipped";
  const reached = kind === "delivered" ? ["delivered"] : ["shipped", "delivered"];
  const inRange = (d: Date) => d.getTime() >= range.from.getTime() && d.getTime() <= range.to.getTime();
  const primaryLinks = facts.links.filter((l) => l.role === "primary" && (l.state === "auto" || l.state === "confirmed") && l.orderId);

  // First proposal per order (in range).
  const first = new Map<string, FactDecision>();
  for (const d of facts.decisions) {
    if (d.decision !== proposal || !d.orderId || !inRange(d.createdAt)) continue;
    const cur = first.get(d.orderId);
    if (!cur || d.createdAt.getTime() < cur.createdAt.getTime()) first.set(d.orderId, d);
  }
  const everProposed = new Set(facts.decisions.filter((d) => d.decision === proposal && d.orderId).map((d) => d.orderId as string));

  const proposals: ProposalRow[] = [];
  const leads: number[] = [];
  for (const [orderId, d] of first) {
    const o = facts.orders.get(orderId);
    const t0 = d.createdAt.getTime();
    const changes = facts.statusChanges.filter((c) => c.orderId === orderId).sort((a, b) => a.at.getTime() - b.at.getTime());
    const reachedChange = changes.find((c) => c.newStatus && reached.includes(c.newStatus) && c.at.getTime() >= t0) ?? changes.find((c) => c.newStatus && reached.includes(c.newStatus));
    const cancelledLater = changes.some((c) => c.newStatus === "cancelled" && c.at.getTime() > t0) || o?.status === "cancelled";
    let reason: string | null = null;
    if (cancelledLater) reason = "order_cancelled_later";
    if (!reason && kind === "delivered") {
      const away =
        facts.history.find((h) => h.awb === d.awb && MOVED_AWAY_FROM_DELIVERED.includes(h.status) && h.observedAt.getTime() > t0)?.status ??
        (MOVED_AWAY_FROM_DELIVERED.includes(facts.shipmentStatus.get(d.awb) ?? "") ? facts.shipmentStatus.get(d.awb) : undefined);
      if (away) reason = `abs_status_moved_to_${away.toLowerCase()}`;
    }
    if (!reason) {
      const overruled = facts.audit.find(
        (a) =>
          a.awb === d.awb &&
          a.at.getTime() > t0 &&
          (a.before?.orderId ?? null) === orderId &&
          (a.action === "link_reject" || a.action === "link_unlink" || (a.action === "link_manual" && (a.after?.orderId ?? null) !== orderId)),
      );
      const label: Record<string, string> = { link_reject: "link_rejected_by_admin", link_unlink: "link_unlinked_by_admin", link_manual: "link_replaced_by_admin" };
      if (overruled) reason = label[overruled.action] ?? "link_changed_by_admin";
    }
    const lead = reachedChange ? (reachedChange.at.getTime() - t0) / HOUR_MS : null;
    const outcome: ProposalRow["outcome"] = reason ? "false_positive" : reachedChange || (o && reached.includes(o.status)) ? "agreed" : "pending";
    if (outcome === "agreed" && lead !== null && lead >= 0) leads.push(lead);
    proposals.push({
      orderId,
      orderNumber: o?.orderNumber ?? null,
      awb: d.awb,
      firstSeenAt: d.createdAt.toISOString(),
      outcome,
      reason,
      websiteStatus: o?.status ?? null,
      websiteChangedAt: iso(reachedChange?.at),
      leadHours: lead === null ? null : Math.round(lead * 10) / 10,
    });
  }

  // Misses: admin moved a linked order to the target status in range, Shadow never proposed it.
  const missList: MissRow[] = [];
  const seenOrder = new Set<string>();
  const target = kind === "delivered" ? "delivered" : "shipped";
  for (const c of [...facts.statusChanges].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    if (c.newStatus !== target || !inRange(c.at) || seenOrder.has(c.orderId)) continue;
    seenOrder.add(c.orderId);
    const link = primaryLinks.find((l) => l.orderId === c.orderId);
    if (!link || everProposed.has(c.orderId)) continue;
    const decs = facts.decisions.filter((d) => d.awb === link.awb);
    const hist = new Set([...facts.history.filter((h) => h.awb === link.awb).map((h) => h.status), facts.shipmentStatus.get(link.awb) ?? ""]);
    let reason: string;
    if (kind === "delivered") {
      const alert = decs.find((d) => d.decision === "alert" && d.reasonCode !== "cod_mismatch" && !String(d.reasonCode).startsWith("unlinked"));
      if (!hist.has("DELIVERED")) reason = "not_delivered_at_abs";
      else if (decs.some((d) => d.reasonCode === "cod_mismatch")) reason = "cod_mismatch";
      else if (alert) reason = `alert:${alert.reasonCode}`;
      else if (decs.some((d) => d.shipmentStatus === "DELIVERED" && ["unlinked", "link_needs_review", "unlinked_terminal"].includes(String(d.reasonCode)))) reason = "unlinked_when_delivered";
      else if (decs.some((d) => d.reasonCode === "already_delivered")) reason = "website_delivered_first";
      else reason = "unexplained";
    } else {
      const moved = [...TRANSIT_STATUSES, "DELIVERED", ...MOVED_AWAY_FROM_DELIVERED].some((s) => hist.has(s));
      if (decs.some((d) => d.reasonCode === "order_already_ahead")) reason = "website_shipped_first";
      else if (!moved) reason = "not_in_transit_at_abs";
      else if (decs.some((d) => ["unlinked", "link_needs_review"].includes(String(d.reasonCode)))) reason = "unlinked_when_in_transit";
      else if (decs.some((d) => d.decision === "alert")) reason = `alert:${decs.find((d) => d.decision === "alert")?.reasonCode}`;
      else reason = "unexplained";
    }
    missList.push({ orderId: c.orderId, orderNumber: facts.orders.get(c.orderId)?.orderNumber ?? null, awb: link.awb, websiteChangedAt: c.at.toISOString(), reason });
  }

  const agreed = proposals.filter((p) => p.outcome === "agreed").length;
  const fp = proposals.filter((p) => p.outcome === "false_positive").length;
  const med = median(leads);
  return {
    proposed: proposals.length,
    agreed,
    pending: proposals.filter((p) => p.outcome === "pending").length,
    falsePositives: fp,
    misses: missList.length,
    precision: ratio(agreed, agreed + fp),
    recall: ratio(agreed, agreed + missList.length),
    medianLeadHours: med === null ? null : Math.round(med * 10) / 10,
    proposals: proposals.sort((a, b) => a.firstSeenAt.localeCompare(b.firstSeenAt)),
    missList,
  };
}

/** Pure: every number in the report comes from here (unit-tested on fixtures). */
export function computeValidation(facts: ValidationFacts, range: { from: Date; to: Date }): ValidationReport {
  const delivered = agreement(facts, range, "delivered");
  const shipped = agreement(facts, range, "shipped");

  // Matching quality (since Shadow started; audit rows up to `to`).
  const audit = facts.audit.filter((a) => a.at.getTime() <= range.to.getTime());
  const autoMethod = new Map<string, string>();
  for (const l of facts.links) if (l.state === "auto") autoMethod.set(l.awb, l.method ?? "unknown");
  for (const a of audit) if (a.awb && a.before?.state === "auto") autoMethod.set(a.awb, String(a.before?.method ?? "unknown"));
  const overruled = new Set<string>();
  for (const a of audit) {
    if (!a.awb || a.before?.state !== "auto") continue;
    if (a.action === "link_reject" || a.action === "link_unlink") overruled.add(a.awb);
    if (a.action === "link_manual" && (a.after?.orderId ?? null) !== (a.before?.orderId ?? null)) overruled.add(a.awb);
  }
  const byMethod: Record<string, MethodQuality> = {};
  for (const [awb, method] of autoMethod) {
    const m = byMethod[method] ?? { autoLinks: 0, overruled: 0, precision: null };
    byMethod[method] = m;
    m.autoLinks++;
    if (overruled.has(awb)) m.overruled++;
  }
  for (const m of Object.values(byMethod)) m.precision = ratio(m.autoLinks - m.overruled, m.autoLinks);
  const reviewConfirms = audit.filter((a) => a.action === "link_confirm" && a.before?.state === "needs_review");
  const topConfirms = reviewConfirms.filter((a) => {
    const c = (a.before?.candidates as Array<{ orderId?: string }> | undefined)?.[0];
    return c?.orderId && c.orderId === a.after?.orderId;
  });
  const unmatched = facts.links.filter((l) => l.state === "unmatched").length;

  // Open alerts (latest decision per AWB, unacknowledged).
  const openAlertsByReason: Record<string, number> = {};
  for (const d of latestDecisionPerAwb(facts.decisions).values()) {
    if (!isOpenAlert(d)) continue;
    const k = d.decision === "alert" ? String(d.reasonCode) : d.decision;
    openAlertsByReason[k] = (openAlertsByReason[k] ?? 0) + 1;
  }

  const deliveredAwbs = new Set([...facts.history.filter((h) => h.status === "DELIVERED").map((h) => h.awb), ...[...facts.shipmentStatus].filter(([, s]) => s === "DELIVERED").map(([a]) => a)]);
  const absDeliveredOrders = new Set(
    facts.links.filter((l) => l.role === "primary" && (l.state === "auto" || l.state === "confirmed") && l.orderId && deliveredAwbs.has(l.awb)).map((l) => l.orderId),
  ).size;
  const shadowDays = facts.shadowStartedAt ? Math.floor((range.to.getTime() - facts.shadowStartedAt.getTime()) / DAY_MS) : 0;
  const autoLinks = autoMethod.size;
  const autoPrecision = ratio(autoLinks - overruled.size, autoLinks);
  const unexplained = [...delivered.missList, ...shipped.missList].filter((m) => m.reason === "unexplained").length;
  const pctText = (x: number | null) => (x === null ? "n/a" : `${Math.round(x * 1000) / 10}%`);

  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    shadowStartedAt: iso(facts.shadowStartedAt),
    shadowDays,
    delivered,
    shipped,
    matching: {
      byMethod,
      autoLinks,
      autoOverruled: overruled.size,
      autoPrecision,
      reviewConfirmed: reviewConfirms.length,
      reviewConfirmedTopCandidate: topConfirms.length,
      manualLinks: audit.filter((a) => a.action === "link_manual").length,
      links: facts.links.length,
      unmatched,
      unmatchedRate: ratio(unmatched, facts.links.length),
    },
    openAlertsByReason,
    absDeliveredOrders,
    unknownStatuses: facts.unknownStatuses,
    targets: [
      { name: "At least 7 days of Shadow and 40 ABS-delivered orders", met: shadowDays >= 7 && absDeliveredOrders >= 40, value: `${shadowDays} day(s), ${absDeliveredOrders} order(s)` },
      { name: "Delivered precision 100%", met: delivered.precision === 1 && delivered.falsePositives === 0, value: `${pctText(delivered.precision)} (${delivered.falsePositives} false positive(s))` },
      { name: "Every miss explained by a rule", met: unexplained === 0, value: `${unexplained} unexplained of ${delivered.misses + shipped.misses}` },
      { name: "Auto-link precision 100%", met: overruled.size === 0, value: `${pctText(autoPrecision)} (${overruled.size} overruled of ${autoLinks})` },
      { name: "Zero UNKNOWN statuses", met: facts.unknownStatuses.length === 0, value: facts.unknownStatuses.length ? facts.unknownStatuses.join(", ") : "none" },
    ],
  };
}

// ─── Read-only loader ───────────────────────────────────────────────────────

export async function loadValidationFacts(db: DatabaseClient, range: { from: Date; to: Date }): Promise<ValidationFacts> {
  const [started] = await db
    .select({ at: sql<Date | null>`min(${absSyncRun.startedAt})` })
    .from(absSyncRun)
    .where(inArray(absSyncRun.outcome, ["ok", "partial"]));
  const decisions = await db
    .select({
      id: absTrackingDecision.id,
      awb: absTrackingDecision.awb,
      orderId: absTrackingDecision.orderId,
      decision: absTrackingDecision.decision,
      reasonCode: absTrackingDecision.reasonCode,
      shipmentStatus: absTrackingDecision.shipmentStatus,
      orderStatusSeen: absTrackingDecision.orderStatusSeen,
      createdAt: absTrackingDecision.createdAt,
      lastSeenAt: absTrackingDecision.lastSeenAt,
      acknowledgedAt: absTrackingDecision.acknowledgedAt,
    })
    .from(absTrackingDecision);
  const links = await db
    .select({ awb: absOrderLink.awb, orderId: absOrderLink.orderId, state: absOrderLink.state, role: absOrderLink.linkRole, method: absOrderLink.method })
    .from(absOrderLink);
  // SELECT only: admin status changes since the range start.
  const changes = await db
    .select({ orderId: orderLog.orderId, newStatus: orderLog.newStatus, action: orderLog.action, at: orderLog.createdAt })
    .from(orderLog)
    .where(and(gte(orderLog.createdAt, range.from), or(sql`${orderLog.action} = 'status_changed'`, sql`${orderLog.action} = 'cancelled'`)));
  const history = await db
    .select({ awb: absShipmentStatusHistory.awb, status: absShipmentStatusHistory.status, observedAt: absShipmentStatusHistory.observedAt })
    .from(absShipmentStatusHistory);
  const shipments = await db.select({ awb: absShipment.awb, status: absShipment.status, statusRaw: absShipment.statusRaw }).from(absShipment);
  const audit = await db
    .select({ action: absAuditLog.action, awb: absAuditLog.awb, at: absAuditLog.at, before: absAuditLog.before, after: absAuditLog.after })
    .from(absAuditLog)
    .where(lte(absAuditLog.at, range.to));

  const orderIds = [...new Set([...decisions.map((d) => d.orderId), ...links.map((l) => l.orderId), ...changes.map((c) => c.orderId)].filter((x): x is string => !!x))];
  const orders = new Map<string, FactOrder>();
  for (let i = 0; i < orderIds.length; i += 500) {
    const rows = await db
      .select({ id: order.id, orderNumber: order.orderNumber, status: order.status, total: order.total })
      .from(order)
      .where(inArray(order.id, orderIds.slice(i, i + 500)));
    for (const r of rows) orders.set(r.id, { id: r.id, orderNumber: r.orderNumber, status: r.status, total: parseMoney(r.total) ?? 0 });
  }

  return {
    shadowStartedAt: started?.at ? new Date(started.at) : null,
    decisions,
    links,
    orders,
    statusChanges: changes.map((c) => ({ orderId: c.orderId, newStatus: c.action === "cancelled" ? "cancelled" : c.newStatus, at: c.at })),
    history,
    shipmentStatus: new Map(shipments.map((s) => [s.awb, s.status])),
    unknownStatuses: [...new Set(shipments.filter((s) => s.status === "UNKNOWN").map((s) => (s.statusRaw ?? "(empty)").slice(0, 60)))].sort(),
    audit: audit.map((a) => ({ ...a, before: (a.before ?? null) as Record<string, unknown> | null, after: (a.after ?? null) as Record<string, unknown> | null })),
  };
}

/** Range defaults: from = Shadow start (else 7 days ago), to = now. */
export async function getAbsValidationReport(db: DatabaseClient, input: { from?: Date | null; to?: Date | null } = {}, now: Date = new Date()): Promise<ValidationReport> {
  const to = input.to ?? now;
  let from = input.from ?? null;
  if (!from) {
    const [started] = await db
      .select({ at: sql<Date | null>`min(${absSyncRun.startedAt})` })
      .from(absSyncRun)
      .where(inArray(absSyncRun.outcome, ["ok", "partial"]));
    from = started?.at ? new Date(started.at) : new Date(to.getTime() - 7 * DAY_MS);
  }
  const facts = await loadValidationFacts(db, { from, to });
  return computeValidation(facts, { from, to });
}
