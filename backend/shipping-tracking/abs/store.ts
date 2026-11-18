import { eq, inArray, sql } from "drizzle-orm";
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
export type RunOutcome = "ok" | "partial" | "failed" | "skipped_locked" | "skipped_config";

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
  setWatermark(at: Date): Promise<void>;
  startRun(trigger: RunTrigger, windowFrom: Date | null, windowTo: Date | null, startedAt: Date): Promise<string>;
  finishRun(id: string, outcome: RunOutcome, counters: RunCounters, error: string | null, finishedAt: Date): Promise<void>;
  recordSkippedRun(trigger: RunTrigger, outcome: RunOutcome, error: string | null, at: Date): Promise<void>;
  loadExisting(awbs: string[]): Promise<{ shipments: Map<string, ExistingShipment>; links: Map<string, ExistingLink> }>;
  upsertShipment(s: NormalizedShipment, now: Date, statusChanged: boolean): Promise<void>;
  insertHistory(awb: string, status: CanonicalStatus, statusRaw: string | null, occurredAt: Date | null, source: "poll" | "bulk" | "history", now: Date): Promise<void>;
  /** Never overwrites a confirmed/rejected link. Returns the link as it now stands. */
  upsertLink(awb: string, match: MatchResult, now: Date): Promise<ExistingLink>;
  /** True when a NEW decision row was created (false = seen_count bumped). */
  upsertDecision(row: DecisionRow, now: Date): Promise<boolean>;
  readOrders(ids: string[]): Promise<Map<string, OrderSnapshot>>;
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

export async function createDbStore(db: DatabaseClient): Promise<AbsStore> {
  const common = await readCommon(db);

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
      });
    const r = rows[0];
    return r ? { ...r, state: r.state as LinkState, role: r.role as LinkRole } : null;
  };

  return {
    dryRun: false,
    ...common,
    async setWatermark(at) {
      await db
        .insert(absSyncState)
        .values({ id: 1, watermark: at, updatedAt: new Date() })
        .onConflictDoUpdate({ target: absSyncState.id, set: { watermark: at, updatedAt: new Date() } });
    },
    async startRun(trigger, windowFrom, windowTo, startedAt) {
      const [row] = await db
        .insert(absSyncRun)
        .values({ trigger, windowFrom, windowTo, startedAt })
        .returning({ id: absSyncRun.id });
      return (row as { id: string }).id;
    },
    async finishRun(id, outcome, counters, error, finishedAt) {
      await db
        .update(absSyncRun)
        .set({ outcome, ...counters, error: error ? error.slice(0, 500) : null, finishedAt })
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
        .values({ ...rest, ...snapshot, mode: "shadow", applied: false, createdAt: now, lastSeenAt: now, seenCount: 1 })
        .onConflictDoUpdate({
          target: absTrackingDecision.dedupeKey,
          set: { seenCount: sql`${absTrackingDecision.seenCount} + 1`, lastSeenAt: now, ...snapshot },
        })
        .returning({ inserted: sql<boolean>`(xmax = 0)` });
      return res?.inserted === true;
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
    planned: () => plan,
  };
}
