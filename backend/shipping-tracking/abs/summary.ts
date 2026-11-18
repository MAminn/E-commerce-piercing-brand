import { desc, eq, sql } from "drizzle-orm";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import { effectiveAbsTrackingMode, readAbsTrackingMode } from "#root/shared/config/abs-tracking";
import { absOrderLink, absShipment, absSyncRun, absSyncState, absTrackingDecision, order } from "#root/shared/database/drizzle/schema";
import { checkAbsTrackingReadiness } from "./readiness";

/**
 * Read-only overview for admins (absTracking.summary) and scripts/abs-tracking/report.ts.
 * SELECTs only. Phones appear as their last 4 digits; no names, no raw rows.
 */
export interface AbsTrackingSummary {
  effectiveMode: string;
  requestedMode: string;
  ready: boolean;
  missing: string[];
  watermark: string | null;
  runs: Array<Record<string, unknown>>;
  linkStates: Record<string, number>;
  decisions: Record<string, number>;
  latestDecisions: Array<Record<string, unknown>>;
  reviewQueue: Array<Record<string, unknown>>;
}

export async function getAbsTrackingSummary(db: DatabaseClient, limits = { runs: 10, decisions: 50, review: 50 }): Promise<AbsTrackingSummary> {
  const base = { effectiveMode: effectiveAbsTrackingMode(), requestedMode: readAbsTrackingMode() };
  const readiness = await checkAbsTrackingReadiness(db);
  if (!readiness.ready) {
    return { ...base, ready: false, missing: readiness.missing, watermark: null, runs: [], linkStates: {}, decisions: {}, latestDecisions: [], reviewQueue: [] };
  }

  const [state] = await db.select({ watermark: absSyncState.watermark }).from(absSyncState).where(eq(absSyncState.id, 1)).limit(1);
  const runs = await db.select().from(absSyncRun).orderBy(desc(absSyncRun.startedAt)).limit(limits.runs);
  const linkRows = await db
    .select({ state: absOrderLink.state, n: sql<number>`count(*)::int` })
    .from(absOrderLink)
    .groupBy(absOrderLink.state);
  const decisionRows = await db
    .select({ decision: absTrackingDecision.decision, n: sql<number>`count(*)::int` })
    .from(absTrackingDecision)
    .groupBy(absTrackingDecision.decision);

  const latestDecisions = await db
    .select({
      createdAt: absTrackingDecision.createdAt,
      lastSeenAt: absTrackingDecision.lastSeenAt,
      seenCount: absTrackingDecision.seenCount,
      awb: absTrackingDecision.awb,
      orderNumber: order.orderNumber,
      orderStatusSeen: absTrackingDecision.orderStatusSeen,
      shipmentStatus: absTrackingDecision.shipmentStatus,
      decision: absTrackingDecision.decision,
      reasonCode: absTrackingDecision.reasonCode,
      applied: absTrackingDecision.applied,
      phoneLast4: absShipment.consigneePhoneLast4,
      cash: absShipment.cash,
      collectedCash: absShipment.collectedCash,
    })
    .from(absTrackingDecision)
    .leftJoin(absShipment, eq(absShipment.awb, absTrackingDecision.awb))
    .leftJoin(order, eq(order.id, absTrackingDecision.orderId))
    .orderBy(desc(absTrackingDecision.createdAt))
    .limit(limits.decisions);

  const reviewQueue = await db
    .select({
      awb: absOrderLink.awb,
      role: absOrderLink.linkRole,
      method: absOrderLink.method,
      reasonCode: absOrderLink.reasonCode,
      confidence: absOrderLink.confidence,
      candidates: absOrderLink.candidates,
      updatedAt: absOrderLink.updatedAt,
      status: absShipment.status,
      cash: absShipment.cash,
      reference: absShipment.reference,
      phoneLast4: absShipment.consigneePhoneLast4,
      absCreatedAt: absShipment.absCreatedAt,
    })
    .from(absOrderLink)
    .innerJoin(absShipment, eq(absShipment.awb, absOrderLink.awb))
    .where(eq(absOrderLink.state, "needs_review"))
    .orderBy(desc(absOrderLink.updatedAt))
    .limit(limits.review);

  return {
    ...base,
    ready: true,
    missing: [],
    watermark: state?.watermark?.toISOString() ?? null,
    runs: runs as unknown as Array<Record<string, unknown>>,
    linkStates: Object.fromEntries(linkRows.map((r) => [r.state, Number(r.n)])),
    decisions: Object.fromEntries(decisionRows.map((r) => [r.decision, Number(r.n)])),
    latestDecisions,
    reviewQueue,
  };
}
