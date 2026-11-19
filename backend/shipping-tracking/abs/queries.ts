import { and, desc, eq, gte, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import {
  effectiveAbsTrackingMode,
  getAbsTrackingBootStatus,
  readAbsTrackingMode,
  type AbsTrackingConfig,
} from "#root/shared/config/abs-tracking";
import { absAuditLog, absOrderLink, absShipment, absSyncRun, absSyncState, order } from "#root/shared/database/drizzle/schema";
import { getLiveOverview } from "./live";
import { readSyncHealth } from "./live-monitor";
import { phoneLast4, parseMoney } from "./normalize";
import { pollNowCooldown } from "./review";

/**
 * Read-only queries behind the ABS review screen (pages/dashboard/abs-tracking).
 * SELECT only — on abs_* and, for order numbers / website status / totals,
 * on "order". Phones leave the server as their last 4 digits; no customer
 * names, addresses or raw ABS rows are returned.
 */

const DAY_MS = 86_400_000;
type Rows<T> = { rows: T[] };
const exec = async <T>(db: DatabaseClient, q: SQL): Promise<T[]> => ((await db.execute(q)) as unknown as Rows<T>).rows;
const num = (v: unknown) => (v === null || v === undefined ? null : parseMoney(v as string));
const date = (v: unknown) => (v === null || v === undefined ? null : new Date(v as string));

/** Latest decision per AWB (by last sighting). */
const LATEST = sql`
  SELECT DISTINCT ON (awb) id, awb, order_id, decision, reason_code, shipment_status, order_status_seen,
         acknowledged_at, acknowledged_by, ack_note, seen_count, created_at, last_seen_at
  FROM abs_tracking_decision
  ORDER BY awb, last_seen_at DESC, created_at DESC`;

// ─── Missing AWB (pure cut-offs, unit-tested) ───────────────────────────────

export interface MissingAwbCutoffs {
  /** Orders placed before this are legacy (private courier): never flagged. */
  placedFrom: Date;
  /** Orders placed after this are too recent to flag yet. */
  placedBefore: Date;
}
export function missingAwbCutoffs(now: Date, cfg: Pick<AbsTrackingConfig, "absOnlySince" | "missingAwbAlertDays">): MissingAwbCutoffs {
  return { placedFrom: cfg.absOnlySince, placedBefore: new Date(now.getTime() - cfg.missingAwbAlertDays * DAY_MS) };
}
export const MISSING_AWB_STATUSES = ["processing", "shipped"] as const;
export function isMissingAwb(o: { status: string; createdAt: Date }, hasPrimaryLink: boolean, c: MissingAwbCutoffs): boolean {
  return (
    (MISSING_AWB_STATUSES as readonly string[]).includes(o.status) &&
    o.createdAt.getTime() >= c.placedFrom.getTime() &&
    o.createdAt.getTime() < c.placedBefore.getTime() &&
    !hasPrimaryLink
  );
}

export interface MissingAwbRow {
  orderId: string;
  orderNumber: number;
  createdAt: Date;
  status: string;
  total: number | null;
  phoneLast4: string | null;
  ageDays: number;
  /** AWBs waiting in "Needs your decision" that list this order as a candidate. */
  possibleAwbs: string[];
}

export async function getMissingAwb(db: DatabaseClient, cfg: Pick<AbsTrackingConfig, "absOnlySince" | "missingAwbAlertDays">, now: Date = new Date()): Promise<MissingAwbRow[]> {
  const c = missingAwbCutoffs(now, cfg);
  const rows = await exec<{ id: string; order_number: number; created_at: string; status: string; total: string; customer_phone: string }>(
    db,
    sql`
      SELECT o.id, o.order_number, o.created_at, o.status::text AS status, o.total, o.customer_phone
      FROM "order" o
      WHERE o.status::text IN ('processing', 'shipped')
        AND o.created_at >= ${c.placedFrom.toISOString()}::timestamptz
        AND o.created_at < ${c.placedBefore.toISOString()}::timestamptz
        AND NOT EXISTS (
          SELECT 1 FROM abs_order_link l
          WHERE l.order_id = o.id AND l.link_role = 'primary' AND l.state IN ('auto', 'confirmed')
        )
      ORDER BY o.created_at ASC
      LIMIT 200`,
  );
  if (rows.length === 0) return [];
  const pending = await exec<{ awb: string; order_id: string }>(
    db,
    sql`SELECT l.awb, c->>'orderId' AS order_id FROM abs_order_link l, jsonb_array_elements(l.candidates) c
        WHERE l.state IN ('needs_review', 'unmatched')`,
  );
  const possible = new Map<string, string[]>();
  for (const p of pending) possible.set(p.order_id, [...(possible.get(p.order_id) ?? []), p.awb]);
  return rows.map((r) => {
    const createdAt = new Date(r.created_at);
    return {
      orderId: r.id,
      orderNumber: Number(r.order_number),
      createdAt,
      status: r.status,
      total: num(r.total),
      phoneLast4: phoneLast4(r.customer_phone),
      ageDays: Math.floor((now.getTime() - createdAt.getTime()) / DAY_MS),
      possibleAwbs: possible.get(r.id) ?? [],
    };
  });
}

// ─── Overview ───────────────────────────────────────────────────────────────

export async function getOverview(db: DatabaseClient | null, cfg: AbsTrackingConfig, now: Date = new Date()) {
  const mode = effectiveAbsTrackingMode();
  const boot = getAbsTrackingBootStatus();
  const base = { mode, requestedMode: readAbsTrackingMode(), boot, now };
  // Off: fully inert — no abs_* query.
  if (mode === "off" || !db) return { ...base, on: false as const };

  const [lastRun] = await db.select().from(absSyncRun).orderBy(desc(absSyncRun.startedAt)).limit(1);
  const [lastOk] = await db
    .select({ at: absSyncRun.finishedAt })
    .from(absSyncRun)
    .where(eq(absSyncRun.outcome, "ok"))
    .orderBy(desc(absSyncRun.startedAt))
    .limit(1);
  const [lastFailed] = await db
    .select({ backoffUntil: absSyncRun.backoffUntil })
    .from(absSyncRun)
    .where(and(eq(absSyncRun.outcome, "failed"), isNotNull(absSyncRun.backoffUntil)))
    .orderBy(desc(absSyncRun.startedAt))
    .limit(1);
  const [lastManual] = await db
    .select({ at: absSyncRun.startedAt })
    .from(absSyncRun)
    .where(eq(absSyncRun.trigger, "manual"))
    .orderBy(desc(absSyncRun.startedAt))
    .limit(1);
  const [state] = await db.select().from(absSyncState).where(eq(absSyncState.id, 1)).limit(1);

  const linkRows = await db.select({ state: absOrderLink.state, n: sql<number>`count(*)::int` }).from(absOrderLink).groupBy(absOrderLink.state);
  const latestRows = await exec<{ decision: string; reason_code: string | null; n: number }>(
    db,
    sql`SELECT decision, reason_code, count(*)::int AS n FROM (${LATEST}) d WHERE acknowledged_at IS NULL GROUP BY decision, reason_code`,
  );
  const unknown = await db
    .select({ raw: absShipment.statusRaw, n: sql<number>`count(*)::int` })
    .from(absShipment)
    .where(eq(absShipment.status, "UNKNOWN"))
    .groupBy(absShipment.statusRaw);
  const missing = await getMissingAwb(db, cfg, now);
  const health = await readSyncHealth(db);
  const live = mode === "live" ? await getLiveOverview(db, cfg, now) : null;

  const linksByState = Object.fromEntries(linkRows.map((r) => [r.state, Number(r.n)]));
  const openAlertsByReason: Record<string, number> = {};
  let wouldMarkDelivered = 0;
  let wouldMarkShipped = 0;
  for (const r of latestRows) {
    if (r.decision === "would_mark_delivered") wouldMarkDelivered += Number(r.n);
    if (r.decision === "would_mark_shipped") wouldMarkShipped += Number(r.n);
    if (r.decision === "alert" || r.decision === "needs_return_confirmation") {
      const k = r.decision === "alert" ? String(r.reason_code) : "needs_return_confirmation";
      openAlertsByReason[k] = (openAlertsByReason[k] ?? 0) + Number(r.n);
    }
  }
  const cooldown = pollNowCooldown(lastManual?.at ?? null, now);
  const backoffUntil = lastFailed?.backoffUntil && lastFailed.backoffUntil.getTime() > now.getTime() && lastRun?.outcome === "failed" ? lastFailed.backoffUntil : null;
  return {
    ...base,
    on: true as const,
    lastRun: lastRun
      ? { startedAt: lastRun.startedAt, finishedAt: lastRun.finishedAt, trigger: lastRun.trigger, outcome: lastRun.outcome, pages: lastRun.pages, shipmentsSeen: lastRun.shipmentsSeen, error: lastRun.error }
      : null,
    lastOkAt: lastOk?.at ?? null,
    watermark: state?.watermark ?? null,
    resume: state?.resumeWindowTo ? { from: state.resumeWindowFrom, to: state.resumeWindowTo, page: state.resumePage } : null,
    backoffUntil,
    counts: {
      linksByState,
      reviewQueue: (linksByState.needs_review ?? 0) + (linksByState.unmatched ?? 0),
      needsReview: linksByState.needs_review ?? 0,
      unmatched: linksByState.unmatched ?? 0,
      openAlertsByReason,
      openAlerts: Object.values(openAlertsByReason).reduce((a, b) => a + b, 0),
      wouldMarkDelivered,
      wouldMarkShipped,
      missingAwb: missing.length,
      unknownStatuses: unknown.reduce((a, r) => a + Number(r.n), 0),
    },
    unknownStatusLabels: unknown.map((u) => ({ label: (u.raw ?? "(empty)").slice(0, 60), count: Number(u.n) })),
    pollNow: { allowed: cooldown.allowed, nextAllowedAt: cooldown.nextAllowedAt },
    health: { consecutiveFailures: health.consecutiveFailures, lastOkAt: health.lastOkAt },
    /** Live mode only (null in shadow). */
    live,
    /** 0072 present: "Done automatically" and Undo work (also after a rollback to shadow). */
    liveTablesReady: mode === "live" || boot?.liveTablesReady === true,
    settings: {
      absOnlySince: cfg.absOnlySince,
      missingAwbAlertDays: cfg.missingAwbAlertDays,
      matchWindowDays: cfg.matchWindowDays,
      reverseWindowDays: cfg.reverseWindowDays,
    },
  };
}

// ─── Shipments table ────────────────────────────────────────────────────────

export const SHIPMENT_FILTERS = ["all", "needs_review", "unmatched", "alerts", "would_change", "delivered_not_on_website", "returned_to_us"] as const;
export type ShipmentFilter = (typeof SHIPMENT_FILTERS)[number];

export interface ShipmentRow {
  awb: string;
  absStatus: string;
  absStatusRaw: string | null;
  lastChangeAt: Date;
  absCreatedAt: Date | null;
  service: string | null;
  cash: number | null;
  collectedCash: number | null;
  absFees: number | null;
  totalFees: number | null;
  phoneLast4: string | null;
  linkState: string | null;
  linkMethod: string | null;
  linkRole: string | null;
  linkReason: string | null;
  confidence: number | null;
  orderId: string | null;
  orderNumber: number | null;
  websiteStatus: string | null;
  orderTotal: number | null;
  decisionId: string | null;
  decision: string | null;
  decisionReason: string | null;
  acknowledgedAt: Date | null;
}

const FILTER_SQL: Record<ShipmentFilter, SQL> = {
  all: sql`true`,
  needs_review: sql`l.state = 'needs_review'`,
  unmatched: sql`(l.state = 'unmatched' OR l.awb IS NULL)`,
  alerts: sql`(d.decision IN ('alert', 'needs_return_confirmation') AND d.acknowledged_at IS NULL)`,
  would_change: sql`d.decision IN ('would_mark_shipped', 'would_mark_delivered')`,
  delivered_not_on_website: sql`(s.status = 'DELIVERED' AND (o.status IS NULL OR o.status::text <> 'delivered'))`,
  returned_to_us: sql`s.status = 'RETURNED_TO_SHIPPER'`,
};

export function encodeCursor(row: { lastChangeAt: Date; awb: string }): string {
  return `${row.lastChangeAt.toISOString()}|${row.awb}`;
}
function decodeCursor(cursor: string | null | undefined): { at: string; awb: string } | null {
  if (!cursor) return null;
  const [at, awb] = cursor.split("|");
  if (!at || !awb || Number.isNaN(Date.parse(at))) return null;
  return { at, awb };
}

export async function getShipments(db: DatabaseClient, input: { filter?: ShipmentFilter; search?: string | null; cursor?: string | null; limit?: number }) {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const where: SQL[] = [FILTER_SQL[input.filter ?? "all"]];
  const q = (input.search ?? "").trim().slice(0, 64);
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const digits = q.replace(/^#/, "");
    if (/^\d{4}$/.test(digits)) where.push(sql`(s.consignee_phone_last4 = ${digits} OR s.awb ILIKE ${like} OR o.order_number::text = ${digits})`);
    else if (/^\d{5,9}$/.test(digits)) where.push(sql`(o.order_number = ${Number(digits)} OR s.awb ILIKE ${like} OR s.reference ILIKE ${like})`);
    else where.push(sql`(s.awb ILIKE ${like} OR s.reference ILIKE ${like})`);
  }
  const c = decodeCursor(input.cursor);
  if (c) where.push(sql`(s.status_changed_at < ${c.at}::timestamptz OR (s.status_changed_at = ${c.at}::timestamptz AND s.awb > ${c.awb}))`);

  const rows = await exec<Record<string, unknown>>(
    db,
    sql`
      WITH d AS (${LATEST})
      SELECT s.awb, s.status, s.status_raw, s.status_changed_at, s.abs_created_at, s.cmp_service, s.cash, s.collected_cash,
             s.abs_fees, s.total_fees, s.consignee_phone_last4,
             l.state AS link_state, l.method AS link_method, l.link_role, l.reason_code AS link_reason, l.confidence,
             o.id AS order_id, o.order_number, o.status::text AS website_status, o.total AS order_total,
             d.id AS decision_id, d.decision, d.reason_code AS decision_reason, d.acknowledged_at
      FROM abs_shipment s
      LEFT JOIN abs_order_link l ON l.awb = s.awb
      LEFT JOIN "order" o ON o.id = l.order_id
      LEFT JOIN d ON d.awb = s.awb
      WHERE ${sql.join(where, sql` AND `)}
      ORDER BY s.status_changed_at DESC, s.awb ASC
      LIMIT ${limit + 1}`,
  );
  const items: ShipmentRow[] = rows.slice(0, limit).map((r) => ({
    awb: String(r.awb),
    absStatus: String(r.status),
    absStatusRaw: (r.status_raw as string) ?? null,
    lastChangeAt: new Date(r.status_changed_at as string),
    absCreatedAt: date(r.abs_created_at),
    service: (r.cmp_service as string) ?? null,
    cash: num(r.cash),
    collectedCash: num(r.collected_cash),
    absFees: num(r.abs_fees),
    totalFees: num(r.total_fees),
    phoneLast4: (r.consignee_phone_last4 as string) ?? null,
    linkState: (r.link_state as string) ?? null,
    linkMethod: (r.link_method as string) ?? null,
    linkRole: (r.link_role as string) ?? null,
    linkReason: (r.link_reason as string) ?? null,
    confidence: r.confidence === null || r.confidence === undefined ? null : Number(r.confidence),
    orderId: (r.order_id as string) ?? null,
    orderNumber: r.order_number === null || r.order_number === undefined ? null : Number(r.order_number),
    websiteStatus: (r.website_status as string) ?? null,
    orderTotal: num(r.order_total),
    decisionId: (r.decision_id as string) ?? null,
    decision: (r.decision as string) ?? null,
    decisionReason: (r.decision_reason as string) ?? null,
    acknowledgedAt: date(r.acknowledged_at),
  }));
  const last = items[items.length - 1];
  return { items, nextCursor: rows.length > limit && last ? encodeCursor(last) : null };
}

// ─── Review queue ───────────────────────────────────────────────────────────

export async function getReviewQueue(db: DatabaseClient, limit = 100) {
  const links = await db
    .select({
      awb: absOrderLink.awb,
      state: absOrderLink.state,
      role: absOrderLink.linkRole,
      method: absOrderLink.method,
      reasonCode: absOrderLink.reasonCode,
      confidence: absOrderLink.confidence,
      candidates: absOrderLink.candidates,
      updatedAt: absOrderLink.updatedAt,
      decidedBy: absOrderLink.decidedBy,
      absStatus: absShipment.status,
      absStatusRaw: absShipment.statusRaw,
      cash: absShipment.cash,
      collectedCash: absShipment.collectedCash,
      reference: absShipment.reference,
      service: absShipment.cmpService,
      phoneLast4: absShipment.consigneePhoneLast4,
      absCreatedAt: absShipment.absCreatedAt,
    })
    .from(absOrderLink)
    .innerJoin(absShipment, eq(absShipment.awb, absOrderLink.awb))
    .where(inArray(absOrderLink.state, ["needs_review", "unmatched"]))
    .orderBy(desc(absShipment.absCreatedAt), absOrderLink.awb)
    .limit(limit);
  const ids = [...new Set(links.flatMap((l) => ((l.candidates as Array<{ orderId: string }>) ?? []).map((c) => c.orderId)))];
  const orders = ids.length
    ? await db
        .select({ id: order.id, orderNumber: order.orderNumber, createdAt: order.createdAt, total: order.total, status: order.status, customerPhone: order.customerPhone })
        .from(order)
        .where(inArray(order.id, ids))
    : [];
  const linkedAwbs = ids.length
    ? await db
        .select({ orderId: absOrderLink.orderId, awb: absOrderLink.awb })
        .from(absOrderLink)
        .where(and(inArray(absOrderLink.orderId, ids), eq(absOrderLink.linkRole, "primary"), inArray(absOrderLink.state, ["auto", "confirmed"])))
    : [];
  const byId = new Map(orders.map((o) => [o.id, o]));
  const linkedTo = new Map(linkedAwbs.map((l) => [l.orderId as string, l.awb]));
  return links.map((l) => ({
    awb: l.awb,
    state: l.state,
    role: l.role,
    method: l.method,
    reasonCode: l.reasonCode,
    confidence: l.confidence,
    humanTouched: Boolean(l.decidedBy),
    absStatus: l.absStatus,
    absStatusRaw: l.absStatusRaw,
    cash: num(l.cash),
    collectedCash: num(l.collectedCash),
    reference: l.reference,
    service: l.service,
    phoneLast4: l.phoneLast4,
    absCreatedAt: l.absCreatedAt,
    candidates: ((l.candidates as Array<{ orderId: string; orderNumber: number; score: number; reasons: string[] }>) ?? []).map((c) => {
      const o = byId.get(c.orderId);
      return {
        orderId: c.orderId,
        orderNumber: o?.orderNumber ?? c.orderNumber,
        createdAt: o?.createdAt ?? null,
        total: o ? num(o.total) : null,
        websiteStatus: o?.status ?? null,
        phoneLast4: o ? phoneLast4(o.customerPhone) : null,
        score: c.score,
        reasons: c.reasons,
        linkedToAwb: linkedTo.get(c.orderId) && linkedTo.get(c.orderId) !== l.awb ? (linkedTo.get(c.orderId) as string) : null,
      };
    }),
  }));
}

// ─── Decisions and the "What Shadow would do" groups ────────────────────────

export interface DecisionRowOut {
  id: string;
  awb: string;
  decision: string;
  reasonCode: string | null;
  absStatus: string;
  orderStatusSeen: string | null;
  orderNumber: number | null;
  websiteStatus: string | null;
  orderTotal: number | null;
  cash: number | null;
  collectedCash: number | null;
  phoneLast4: string | null;
  seenCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  acknowledgedAt: Date | null;
  acknowledgedBy: string | null;
  ackNote: string | null;
  isLatest: boolean;
  open: boolean;
}

function mapDecision(r: Record<string, unknown>): DecisionRowOut {
  const acknowledgedAt = date(r.acknowledged_at);
  const isLatest = r.is_latest === true;
  const decision = String(r.decision);
  return {
    id: String(r.id),
    awb: String(r.awb),
    decision,
    reasonCode: (r.reason_code as string) ?? null,
    absStatus: String(r.shipment_status),
    orderStatusSeen: (r.order_status_seen as string) ?? null,
    orderNumber: r.order_number === null || r.order_number === undefined ? null : Number(r.order_number),
    websiteStatus: (r.website_status as string) ?? null,
    orderTotal: num(r.order_total),
    cash: num(r.cash),
    collectedCash: num(r.collected_cash),
    phoneLast4: (r.consignee_phone_last4 as string) ?? null,
    seenCount: Number(r.seen_count),
    firstSeenAt: new Date(r.created_at as string),
    lastSeenAt: new Date(r.last_seen_at as string),
    acknowledgedAt,
    acknowledgedBy: (r.acknowledged_by as string) ?? null,
    ackNote: (r.ack_note as string) ?? null,
    isLatest,
    open: isLatest && (decision === "alert" || decision === "needs_return_confirmation") && !acknowledgedAt,
  };
}

const DECISION_SELECT = sql`
  d.id, d.awb, d.decision, d.reason_code, d.shipment_status, d.order_status_seen, d.seen_count, d.created_at, d.last_seen_at,
  d.acknowledged_at, d.acknowledged_by, d.ack_note,
  o.order_number, o.status::text AS website_status, o.total AS order_total,
  s.cash, s.collected_cash, s.consignee_phone_last4`;

export async function getDecisions(db: DatabaseClient, input: { onlyOpen?: boolean; limit?: number }) {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 300);
  const rows = await exec<Record<string, unknown>>(
    db,
    sql`
      WITH latest AS (${LATEST})
      SELECT ${DECISION_SELECT}, (latest.id IS NOT NULL) AS is_latest
      FROM abs_tracking_decision d
      JOIN abs_shipment s ON s.awb = d.awb
      LEFT JOIN "order" o ON o.id = d.order_id
      LEFT JOIN latest ON latest.id = d.id
      WHERE ${input.onlyOpen ? sql`latest.id IS NOT NULL AND d.decision IN ('alert', 'needs_return_confirmation') AND d.acknowledged_at IS NULL` : sql`true`}
      ORDER BY d.last_seen_at DESC, d.created_at DESC
      LIMIT ${limit}`,
  );
  return rows.map(mapDecision);
}

const NOT_LINKED = (r: DecisionRowOut) => (r.reasonCode ?? "").startsWith("unlinked");
const AMOUNT = (r: DecisionRowOut) => r.reasonCode === "cod_mismatch";

/**
 * Section groups for the page. "Would mark Delivered" lists every AWB that got
 * that decision in the last `days` days, with today's website status, so the
 * agreement ("already Delivered on website") stays visible after an admin acts.
 */
export async function getActionGroups(db: DatabaseClient, now: Date = new Date(), days = 14) {
  const since = new Date(now.getTime() - days * DAY_MS);
  const deliverRows = await exec<Record<string, unknown>>(
    db,
    sql`
      WITH latest AS (${LATEST}),
      firsts AS (
        SELECT DISTINCT ON (awb) * FROM abs_tracking_decision
        WHERE decision = 'would_mark_delivered' AND last_seen_at >= ${since.toISOString()}::timestamptz
        ORDER BY awb, created_at ASC
      )
      SELECT ${DECISION_SELECT}, (latest.id = d.id) AS is_latest,
             latest.decision AS latest_decision, latest.reason_code AS latest_reason, s.status AS abs_status_now
      FROM firsts d
      JOIN abs_shipment s ON s.awb = d.awb
      LEFT JOIN "order" o ON o.id = d.order_id
      LEFT JOIN latest ON latest.awb = d.awb
      ORDER BY d.created_at DESC
      LIMIT 200`,
  );
  const openRows = await getLatestOpen(db);
  return {
    wouldDeliver: deliverRows.map((r) => ({
      ...mapDecision(r),
      absStatusNow: String(r.abs_status_now),
      stillProposed: r.latest_decision === "would_mark_delivered",
      latestDecision: (r.latest_decision as string) ?? null,
      latestReason: (r.latest_reason as string) ?? null,
    })),
    wouldShip: openRows.filter((r) => r.decision === "would_mark_shipped"),
    returnedToUs: openRows.filter((r) => r.decision === "needs_return_confirmation"),
    amountDiffers: openRows.filter((r) => r.decision === "alert" && AMOUNT(r)),
    absProblems: openRows.filter((r) => r.decision === "alert" && !AMOUNT(r) && !NOT_LINKED(r)),
    notLinked: openRows.filter((r) => r.decision === "alert" && NOT_LINKED(r)),
  };
}

/** Latest decision per AWB that is actionable or open (would_mark_shipped, or an unacknowledged alert / return). */
async function getLatestOpen(db: DatabaseClient) {
  const rows = await exec<Record<string, unknown>>(
    db,
    sql`
      SELECT ${DECISION_SELECT}, true AS is_latest
      FROM (${LATEST}) d
      JOIN abs_shipment s ON s.awb = d.awb
      LEFT JOIN "order" o ON o.id = d.order_id
      WHERE d.decision = 'would_mark_shipped'
         OR (d.decision IN ('alert', 'needs_return_confirmation') AND d.acknowledged_at IS NULL)
      ORDER BY d.last_seen_at DESC
      LIMIT 300`,
  );
  return rows.map(mapDecision);
}

// ─── History ────────────────────────────────────────────────────────────────

export async function getRuns(db: DatabaseClient, limit = 50) {
  return await db.select().from(absSyncRun).orderBy(desc(absSyncRun.startedAt)).limit(limit);
}

export async function getAudit(db: DatabaseClient, input: { awb?: string | null; orderId?: string | null; limit?: number }) {
  const where: SQL[] = [];
  if (input.awb) where.push(eq(absAuditLog.awb, input.awb));
  if (input.orderId) where.push(eq(absAuditLog.orderId, input.orderId));
  const rows = await db
    .select()
    .from(absAuditLog)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(absAuditLog.at))
    .limit(Math.min(input.limit ?? 100, 300));
  return rows;
}

/** Last manual run start (pollNow cooldown). */
export async function lastManualRunAt(db: DatabaseClient, since?: Date): Promise<Date | null> {
  const [row] = await db
    .select({ at: absSyncRun.startedAt })
    .from(absSyncRun)
    .where(since ? and(eq(absSyncRun.trigger, "manual"), gte(absSyncRun.startedAt, since)) : eq(absSyncRun.trigger, "manual"))
    .orderBy(desc(absSyncRun.startedAt))
    .limit(1);
  return row?.at ?? null;
}
