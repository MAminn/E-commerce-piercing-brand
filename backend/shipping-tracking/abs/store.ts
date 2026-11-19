import { and, desc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import {
  absOrderLink,
  absShipment,
  absShipmentStatusHistory,
  absSyncRun,
  absSyncState,
  absTrackingDecision,
  order,
} from "#root/shared/database/drizzle/schema";
import type { MatchResult } from "./matcher";
import { expectedCodFor } from "./matcher";
import { parseMoney } from "./normalize";
import type { CanonicalStatus, DecisionKind, LinkRole, LinkState, NormalizedShipment, WebsiteOrderStatus } from "./types";

/**
 * All persistence of the ABS poller. WRITES touch abs_* tables only; the
 * website `order` table is only ever SELECTed (readOrders). The dry-run store
 * performs the same reads and records the writes it would make instead.
 */

export type RunTrigger = "schedule" | "manual" | "backfill";
/** `skipped_backoff` is reported by a scheduled tick during a failure backoff; it is never stored. */
export type RunOutcome = "ok" | "partial" | "failed" | "skipped_locked" | "skipped_config" | "skipped_backoff";

/** Where a window that hit the page cap / time budget continues (abs_sync_state.resume_*). */
export interface ResumePoint {
  from: Date;
  to: Date;
  page: number;
  cursor: string | null;
}

export interface ExistingShipment {
  awb: string;
  status: string;
  statusRaw: string | null;
}
export interface ExistingLink {
  awb: string;
  state: LinkState;
  role: LinkRole;
  orderId: string | null;
  method: string | null;
  reasonCode: string | null;
  /** Set once a human confirmed / rejected / linked / unlinked this AWB. */
  decidedBy: string | null;
}
/** What the rule engine needs from a stored abs_shipment row (recompute pass). */
export interface StoredShipment {
  awb: string;
  status: CanonicalStatus;
  statusRaw: string | null;
  lastEventCode: string | null;
  cash: number | null;
  collectedCash: number | null;
  deliveryDate: Date | null;
  consigneePhoneLast4: string | null;
}
export interface RecomputeItem {
  awb: string;
  /** recompute_requested_at as read (null = stale decision, not flagged). */
  flaggedAt: Date | null;
}
export interface OrderSnapshot {
  id: string;
  orderNumber: number;
  status: WebsiteOrderStatus;
  total: number;
  expectedCod: number;
}
export interface DecisionRow {
  awb: string;
  orderId: string | null;
  orderStatusSeen: string | null;
  shipmentStatus: CanonicalStatus;
  decision: DecisionKind;
  reasonCode: string;
  details: Record<string, unknown>;
  dedupeKey: string;
  /** Snapshot for a future compare-and-set writer (0071); refreshed on every sighting. */
  orderTotal: number | null;
  absDeliveryDate: Date | null;
}
export interface RunCounters {
  pages: number;
  shipmentsSeen: number;
  shipmentsChanged: number;
  linksAuto: number;
  linksReview: number;
  decisionsNew: number;
}
export interface PlannedWrite {
  table: string;
  op: "insert" | "upsert" | "update";
  key: string;
  summary: Record<string, unknown>;
}

export interface AbsStore {
  readonly dryRun: boolean;
  getWatermark(): Promise<Date | null>;
  /** Also clears any resume point: the window is complete. */
  setWatermark(at: Date): Promise<void>;
  getResume(): Promise<ResumePoint | null>;
  setResume(r: ResumePoint): Promise<void>;
  clearResume(): Promise<void>;
  /** Outcomes of the latest stored runs that were not skipped, newest first. */
  recentOutcomes(limit: number): Promise<Array<{ outcome: string | null; backoffUntil: Date | null }>>;
  startRun(trigger: RunTrigger, windowFrom: Date | null, windowTo: Date | null, startedAt: Date): Promise<string>;
  finishRun(id: string, outcome: RunOutcome, counters: RunCounters, error: string | null, finishedAt: Date, backoffUntil?: Date | null): Promise<void>;
  recordSkippedRun(trigger: RunTrigger, outcome: RunOutcome, error: string | null, at: Date): Promise<void>;
  loadExisting(awbs: string[]): Promise<{ shipments: Map<string, ExistingShipment>; links: Map<string, ExistingLink> }>;
  upsertShipment(s: NormalizedShipment, now: Date, statusChanged: boolean): Promise<void>;
  insertHistory(awb: string, status: CanonicalStatus, statusRaw: string | null, occurredAt: Date | null, source: "poll" | "bulk" | "history", now: Date): Promise<void>;
  /** Never overwrites a confirmed/rejected link. Returns the link as it now stands. */
  upsertLink(awb: string, match: MatchResult, now: Date): Promise<ExistingLink>;
  /** True when a NEW decision row was created (false = seen_count bumped). */
  upsertDecision(row: DecisionRow, now: Date): Promise<boolean>;
  readOrders(ids: string[]): Promise<Map<string, OrderSnapshot>>;
  /**
   * AWBs whose decision must be recomputed without a change at ABS: links a
   * human changed (recompute_requested_at), and linked AWBs whose latest
   * decision saw a different website order status or total than the order
   * has now. SELECT only (joins "order" read-only).
   */
  listRecompute(limit: number): Promise<RecomputeItem[]>;
  loadStoredShipments(awbs: string[]): Promise<Map<string, StoredShipment>>;
  /** Clears the flag only if nobody re-flagged the link since it was read. */
  clearRecompute(awb: string, flaggedAt: Date): Promise<void>;
  planned(): PlannedWrite[];
}

const money = (n: number | null) => (n === null ? null : n.toFixed(2));

function isUniqueViolation(err: unknown): boolean {
  // Drizzle wraps the pg error; the SQLSTATE may be on the error or its cause.
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

async function readCommon(db: DatabaseClient) {
  return {
    async getWatermark(): Promise<Date | null> {
      const [row] = await db.select({ watermark: absSyncState.watermark }).from(absSyncState).where(eq(absSyncState.id, 1)).limit(1);
      return row?.watermark ?? null;
    },
    async getResume(): Promise<ResumePoint | null> {
      const [row] = await db
        .select({ from: absSyncState.resumeWindowFrom, to: absSyncState.resumeWindowTo, page: absSyncState.resumePage, cursor: absSyncState.resumeCursor })
        .from(absSyncState)
        .where(eq(absSyncState.id, 1))
        .limit(1);
      if (!row?.from || !row.to) return null;
      return { from: row.from, to: row.to, page: row.page ?? 1, cursor: row.cursor ?? null };
    },
    async recentOutcomes(limit: number) {
      return await db
        .select({ outcome: absSyncRun.outcome, backoffUntil: absSyncRun.backoffUntil })
        .from(absSyncRun)
        .where(and(isNotNull(absSyncRun.outcome), sql`${absSyncRun.outcome} not like 'skipped%'`))
        .orderBy(desc(absSyncRun.startedAt))
        .limit(limit);
    },
    async loadExisting(awbs: string[]) {
      const shipments = new Map<string, ExistingShipment>();
      const links = new Map<string, ExistingLink>();
      if (awbs.length === 0) return { shipments, links };
      const srows = await db
        .select({ awb: absShipment.awb, status: absShipment.status, statusRaw: absShipment.statusRaw })
        .from(absShipment)
        .where(inArray(absShipment.awb, awbs));
      for (const r of srows) shipments.set(r.awb, r);
      const lrows = await db
        .select({
          awb: absOrderLink.awb,
          state: absOrderLink.state,
          role: absOrderLink.linkRole,
          orderId: absOrderLink.orderId,
          method: absOrderLink.method,
          reasonCode: absOrderLink.reasonCode,
          decidedBy: absOrderLink.decidedBy,
        })
        .from(absOrderLink)
        .where(inArray(absOrderLink.awb, awbs));
      for (const r of lrows) links.set(r.awb, { ...r, state: r.state as LinkState, role: r.role as LinkRole });
      return { shipments, links };
    },
    /** SELECT only — the website order is never written. */
    async readOrders(ids: string[]): Promise<Map<string, OrderSnapshot>> {
      const out = new Map<string, OrderSnapshot>();
      if (ids.length === 0) return out;
      const rows = await db
        .select({
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          total: order.total,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
        })
        .from(order)
        .where(inArray(order.id, ids));
      for (const r of rows) {
        out.set(r.id, {
          id: r.id,
          orderNumber: r.orderNumber,
          status: r.status as WebsiteOrderStatus,
          total: parseMoney(r.total) ?? 0,
          expectedCod: expectedCodFor(r),
        });
      }
      return out;
    },
    async listRecompute(limit: number): Promise<RecomputeItem[]> {
      const flagged = await db
        .select({ awb: absOrderLink.awb, flaggedAt: absOrderLink.recomputeRequestedAt })
        .from(absOrderLink)
        .where(isNotNull(absOrderLink.recomputeRequestedAt))
        .orderBy(absOrderLink.recomputeRequestedAt)
        .limit(limit);
      const room = limit - flagged.length;
      if (room <= 0) return flagged;
      // Linked AWBs whose latest decision no longer matches the order (SELECT only).
      const stale = (await db.execute(sql`
        SELECT l.awb FROM abs_order_link l
        JOIN "order" o ON o.id = l.order_id
        JOIN LATERAL (
          SELECT d.order_status_seen, d.order_total_at_decision FROM abs_tracking_decision d
          WHERE d.awb = l.awb ORDER BY d.last_seen_at DESC, d.created_at DESC LIMIT 1
        ) d ON true
        WHERE l.state IN ('auto', 'confirmed') AND l.recompute_requested_at IS NULL
          AND (d.order_status_seen IS DISTINCT FROM o.status::text
               OR (d.order_total_at_decision IS NOT NULL AND d.order_total_at_decision <> o.total))
        ORDER BY l.awb
        LIMIT ${room}
      `)) as unknown as { rows: Array<{ awb: string }> };
      return [...flagged, ...stale.rows.map((r) => ({ awb: r.awb, flaggedAt: null }))];
    },
    async loadStoredShipments(awbs: string[]): Promise<Map<string, StoredShipment>> {
      const out = new Map<string, StoredShipment>();
      if (awbs.length === 0) return out;
      const rows = await db
        .select({
          awb: absShipment.awb,
          status: absShipment.status,
          statusRaw: absShipment.statusRaw,
          lastEventCode: absShipment.lastEventCode,
          cash: absShipment.cash,
          collectedCash: absShipment.collectedCash,
          deliveryDate: absShipment.deliveryDate,
          consigneePhoneLast4: absShipment.consigneePhoneLast4,
        })
        .from(absShipment)
        .where(inArray(absShipment.awb, awbs));
      for (const r of rows) {
        out.set(r.awb, { ...r, status: r.status as CanonicalStatus, cash: parseMoney(r.cash), collectedCash: parseMoney(r.collectedCash) });
      }
      return out;
    },
  };
}

function shipmentValues(s: NormalizedShipment) {
  return {
    reference: s.reference,
    cmpService: s.cmpService,
    statusRaw: s.statusRaw,
    status: s.status,
    lastEventCode: s.lastEventCode,
    lastReason: s.lastReason,
    cash: money(s.cash),
    collectedCash: money(s.collectedCash),
    absFees: money(s.absFees),
    totalFees: money(s.totalFees),
    isPaid: s.isPaid,
    paymentDate: s.paymentDate,
    deliveryDate: s.deliveryDate,
    absCreatedAt: s.absCreatedAt,
    consigneePhoneNorm: s.consigneePhoneNorm,
    consigneePhoneLast4: s.consigneePhoneLast4,
    noOfPieces: s.noOfPieces,
    originAwb: s.originAwb,
    raw: s.raw,
  };
}

function linkValues(match: MatchResult) {
  return {
    orderId: match.state === "auto" ? match.orderId : null,
    linkRole: match.role,
    state: match.state,
    method: match.method,
    reasonCode: match.reasonCode,
    confidence: match.confidence,
    candidates: match.candidates,
  };
}

/** `decisionMode` = what new abs_tracking_decision rows record in `mode` (the effective mode). */
export async function createDbStore(db: DatabaseClient, opts: { decisionMode?: "shadow" | "live" } = {}): Promise<AbsStore> {
  const common = await readCommon(db);
  const decisionMode = opts.decisionMode ?? "shadow";

  const writeLink = async (awb: string, match: MatchResult, now: Date): Promise<ExistingLink | null> => {
    const values = linkValues(match);
    const rows = await db
      .insert(absOrderLink)
      .values({ awb, ...values, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: absOrderLink.awb,
        set: { ...values, updatedAt: now },
        // Human decisions are final for the matcher.
        setWhere: sql`${absOrderLink.state} not in ('confirmed', 'rejected')`,
      })
      .returning({
        awb: absOrderLink.awb,
        state: absOrderLink.state,
        role: absOrderLink.linkRole,
        orderId: absOrderLink.orderId,
        method: absOrderLink.method,
        reasonCode: absOrderLink.reasonCode,
        decidedBy: absOrderLink.decidedBy,
      });
    const r = rows[0];
    return r ? { ...r, state: r.state as LinkState, role: r.role as LinkRole } : null;
  };

  return {
    dryRun: false,
    ...common,
    async setWatermark(at) {
      const cleared = { resumeWindowFrom: null, resumeWindowTo: null, resumePage: null, resumeCursor: null };
      await db
        .insert(absSyncState)
        .values({ id: 1, watermark: at, ...cleared, updatedAt: new Date() })
        .onConflictDoUpdate({ target: absSyncState.id, set: { watermark: at, ...cleared, updatedAt: new Date() } });
    },
    async setResume(r) {
      const values = { resumeWindowFrom: r.from, resumeWindowTo: r.to, resumePage: r.page, resumeCursor: r.cursor, updatedAt: new Date() };
      await db.insert(absSyncState).values({ id: 1, ...values }).onConflictDoUpdate({ target: absSyncState.id, set: values });
    },
    async clearResume() {
      await db
        .update(absSyncState)
        .set({ resumeWindowFrom: null, resumeWindowTo: null, resumePage: null, resumeCursor: null, updatedAt: new Date() })
        .where(eq(absSyncState.id, 1));
    },
    async startRun(trigger, windowFrom, windowTo, startedAt) {
      const [row] = await db
        .insert(absSyncRun)
        .values({ trigger, windowFrom, windowTo, startedAt })
        .returning({ id: absSyncRun.id });
      return (row as { id: string }).id;
    },
    async finishRun(id, outcome, counters, error, finishedAt, backoffUntil = null) {
      await db
        .update(absSyncRun)
        .set({ outcome, ...counters, error: error ? error.slice(0, 500) : null, finishedAt, backoffUntil })
        .where(eq(absSyncRun.id, id));
    },
    async recordSkippedRun(trigger, outcome, error, at) {
      await db.insert(absSyncRun).values({ trigger, outcome, error: error ? error.slice(0, 500) : null, startedAt: at, finishedAt: at });
    },
    async upsertShipment(s, now, statusChanged) {
      const values = shipmentValues(s);
      await db
        .insert(absShipment)
        .values({ awb: s.awb, ...values, firstSeenAt: now, lastSeenAt: now, statusChangedAt: now })
        .onConflictDoUpdate({
          target: absShipment.awb,
          set: { ...values, lastSeenAt: now, ...(statusChanged ? { statusChangedAt: now } : {}) },
        });
    },
    async insertHistory(awb, status, statusRaw, occurredAt, source, now) {
      // Any unique hit (awb, status, occurred_at) = already recorded.
      await db.insert(absShipmentStatusHistory).values({ awb, status, statusRaw, occurredAt, source, observedAt: now }).onConflictDoNothing();
    },
    async upsertLink(awb, match, now) {
      try {
        const written = await writeLink(awb, match, now);
        if (written) return written;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        // Another AWB took the order's primary slot in the meantime: review instead.
        const fallback: MatchResult = { ...match, state: "needs_review", reasonCode: "order_already_linked", orderId: null, confidence: Math.min(match.confidence, 60) };
        const written = await writeLink(awb, fallback, now);
        if (written) return written;
      }
      // setWhere refused: the link is confirmed/rejected — return it unchanged.
      const { links } = await common.loadExisting([awb]);
      return links.get(awb) as ExistingLink;
    },
    async upsertDecision(row, now) {
      const { orderTotal, absDeliveryDate, ...rest } = row;
      const snapshot = { orderStatusAtDecision: row.orderStatusSeen, orderTotalAtDecision: money(orderTotal), absDeliveryDate };
      const [res] = await db
        .insert(absTrackingDecision)
        .values({ ...rest, ...snapshot, mode: decisionMode, applied: false, createdAt: now, lastSeenAt: now, seenCount: 1 })
        .onConflictDoUpdate({
          target: absTrackingDecision.dedupeKey,
          set: { seenCount: sql`${absTrackingDecision.seenCount} + 1`, lastSeenAt: now, ...snapshot },
        })
        .returning({ inserted: sql<boolean>`(xmax = 0)` });
      return res?.inserted === true;
    },
    async clearRecompute(awb, flaggedAt) {
      await db
        .update(absOrderLink)
        .set({ recomputeRequestedAt: null })
        .where(and(eq(absOrderLink.awb, awb), lte(absOrderLink.recomputeRequestedAt, flaggedAt)));
    },
    planned: () => [],
  };
}

/** Same reads as the DB store; every write is recorded, none executed. */
export async function createDryRunStore(db: DatabaseClient): Promise<AbsStore> {
  const common = await readCommon(db);
  const plan: PlannedWrite[] = [];
  const pendingLinks = new Map<string, ExistingLink>();
  const seenDecisionKeys = new Set<string>();
  return {
    dryRun: true,
    ...common,
    async loadExisting(awbs) {
      const res = await common.loadExisting(awbs);
      for (const [awb, link] of pendingLinks) if (awbs.includes(awb)) res.links.set(awb, link);
      return res;
    },
    async setWatermark(at) {
      plan.push({ table: "abs_sync_state", op: "upsert", key: "1", summary: { watermark: at.toISOString() } });
    },
    async setResume(r) {
      plan.push({ table: "abs_sync_state", op: "upsert", key: "1", summary: { resumePage: r.page, resumeCursor: r.cursor ? "(cursor)" : null } });
    },
    async clearResume() {
      plan.push({ table: "abs_sync_state", op: "update", key: "1", summary: { resume: null } });
    },
    async startRun(trigger, windowFrom, windowTo) {
      plan.push({ table: "abs_sync_run", op: "insert", key: "dry-run", summary: { trigger, windowFrom, windowTo } });
      return "dry-run";
    },
    async finishRun(_id, outcome, counters, error) {
      plan.push({ table: "abs_sync_run", op: "update", key: "dry-run", summary: { outcome, ...counters, error } });
    },
    async recordSkippedRun(trigger, outcome, error) {
      plan.push({ table: "abs_sync_run", op: "insert", key: "dry-run", summary: { trigger, outcome, error } });
    },
    async upsertShipment(s, _now, statusChanged) {
      plan.push({ table: "abs_shipment", op: "upsert", key: s.awb, summary: { status: s.status, statusChanged, cash: s.cash, phoneLast4: s.consigneePhoneLast4 } });
    },
    async insertHistory(awb, status, _raw, occurredAt, source) {
      plan.push({ table: "abs_shipment_status_history", op: "insert", key: awb, summary: { status, occurredAt, source } });
    },
    async upsertLink(awb, match) {
      const { links } = await common.loadExisting([awb]);
      const current = links.get(awb);
      if (current && (current.state === "confirmed" || current.state === "rejected")) return current;
      const link: ExistingLink = {
        awb,
        state: match.state,
        role: match.role,
        orderId: match.state === "auto" ? match.orderId : null,
        method: match.method,
        reasonCode: match.reasonCode,
        decidedBy: current?.decidedBy ?? null,
      };
      pendingLinks.set(awb, link);
      plan.push({ table: "abs_order_link", op: "upsert", key: awb, summary: { state: link.state, role: link.role, method: link.method, reason: link.reasonCode, candidates: match.candidates.map((c) => c.orderNumber) } });
      return link;
    },
    async upsertDecision(row) {
      const [hit] = await db
        .select({ id: absTrackingDecision.id })
        .from(absTrackingDecision)
        .where(eq(absTrackingDecision.dedupeKey, row.dedupeKey))
        .limit(1);
      const inserted = !hit && !seenDecisionKeys.has(row.dedupeKey);
      seenDecisionKeys.add(row.dedupeKey);
      plan.push({ table: "abs_tracking_decision", op: inserted ? "insert" : "update", key: row.dedupeKey, summary: { decision: row.decision, reason: row.reasonCode } });
      return inserted;
    },
    async clearRecompute(awb) {
      plan.push({ table: "abs_order_link", op: "update", key: awb, summary: { recomputeRequestedAt: null } });
    },
    planned: () => plan,
  };
}
