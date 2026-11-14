import { sql } from "drizzle-orm";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import {
  effectiveGa4PurchaseOwner,
  readGa4PurchaseOwner,
} from "#root/shared/config/ga4-purchase-owner";

/**
 * Admin diagnostics for the server-owned GA4 purchase. Order ids and numbers
 * only — no customer name, email, phone or address, and no payload.
 *
 * - status / held_reason counts (missing_client_id, consent_not_granted …)
 * - attribution coverage: orders captured without a GA4 client id / session
 * - gap: orders that look like purchases but have no outbox row although
 *   they were placed after the first row existed (an enqueue that failed,
 *   or a path that is not wired) — these are NOT re-sent automatically
 * - shadow coverage: shadow candidates with vs without a browser purchase
 *   beacon (tracking_event `purchase-<order id>`) — the orders the browser
 *   missed are what server mode would recover
 */
export interface Ga4PurchaseDiagnostics {
  requestedOwner: string;
  effectiveOwner: string;
  windowDays: number;
  byStatus: Array<{ mode: string; status: string; heldReason: string | null; count: number }>;
  attribution: { captured: number; missingClientId: number; missingSessionId: number; consentUnknown: number };
  oldestPendingMinutes: number | null;
  ambiguousRows: number;
  gapOrders: Array<{ orderId: string; orderNumber: number; paymentMethod: string; paymentStatus: string }>;
  shadowCoverage: { candidates: number; withBrowserBeacon: number; withoutBrowserBeacon: number };
  recentProblems: Array<{
    orderId: string;
    orderNumber: number | null;
    status: string;
    heldReason: string | null;
    lastError: string | null;
    attempts: number;
    ambiguousAttempts: number;
    eligibleAt: string;
  }>;
}

const rowsOf = <T>(r: unknown): T[] => (r as { rows: T[] }).rows;

export async function getGa4PurchaseDiagnostics(db: Pick<DatabaseClient, "execute">, windowDays = 7): Promise<Ga4PurchaseDiagnostics> {
  const days = Math.min(Math.max(Math.trunc(windowDays), 1), 90);
  const since = sql`now() - make_interval(days => ${days})`;

  const byStatus = rowsOf<{ mode: string; status: string; held_reason: string | null; count: string }>(
    await db.execute(sql`
      SELECT mode, status, held_reason, count(*)::text AS count
      FROM ga4_purchase_outbox WHERE created_at >= ${since}
      GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`),
  );
  const [attr] = rowsOf<Record<string, string>>(
    await db.execute(sql`
      SELECT count(*)::text AS captured,
             count(*) FILTER (WHERE ga_client_id IS NULL)::text AS missing_client,
             count(*) FILTER (WHERE ga_session_id IS NULL)::text AS missing_session,
             count(*) FILTER (WHERE consent_analytics IS NULL)::text AS consent_unknown
      FROM ga4_purchase_context WHERE captured_at >= ${since}`),
  );
  const [pending] = rowsOf<{ minutes: string | null; ambiguous: string }>(
    await db.execute(sql`
      SELECT (extract(epoch FROM now() - min(next_attempt_at)) / 60)::int::text AS minutes,
             (SELECT count(*) FROM ga4_purchase_outbox WHERE ambiguous_attempts > 0 AND created_at >= ${since})::text AS ambiguous
      FROM ga4_purchase_outbox WHERE status IN ('pending', 'sending')`),
  );
  const gaps = rowsOf<{ id: string; order_number: number; payment_method: string; payment_status: string }>(
    await db.execute(sql`
      SELECT o.id, o.order_number, o.payment_method, o.payment_status
      FROM "order" o
      WHERE o.created_at >= greatest(${since}, (SELECT min(created_at) FROM ga4_purchase_outbox))
        AND o.status <> 'cancelled'
        AND ((o.payment_method = 'cod' AND o.payment_status = 'not_required')
             OR (o.payment_method <> 'cod' AND o.payment_status = 'paid'))
        AND NOT EXISTS (SELECT 1 FROM ga4_purchase_outbox x WHERE x.order_id = o.id)
      ORDER BY o.created_at DESC LIMIT 50`),
  );
  const [shadow] = rowsOf<Record<string, string>>(
    await db.execute(sql`
      SELECT count(*)::text AS candidates,
             count(te.id)::text AS with_beacon
      FROM ga4_purchase_outbox x
      LEFT JOIN LATERAL (
        SELECT t.id FROM tracking_event t WHERE t.event_id = 'purchase-' || x.order_id::text LIMIT 1
      ) te ON true
      WHERE x.status = 'shadow' AND x.created_at >= ${since}`),
  );
  const problems = rowsOf<{
    order_id: string; order_number: number | null; status: string; held_reason: string | null;
    last_error: string | null; attempts: number; ambiguous_attempts: number; eligible_at: Date | string;
  }>(
    await db.execute(sql`
      SELECT x.order_id, o.order_number, x.status, x.held_reason, x.last_error, x.attempts,
             x.ambiguous_attempts, x.eligible_at
      FROM ga4_purchase_outbox x LEFT JOIN "order" o ON o.id = x.order_id
      WHERE x.created_at >= ${since}
        AND (x.status IN ('failed', 'held') OR x.ambiguous_attempts > 0 OR (x.status = 'pending' AND x.attempts > 0))
      ORDER BY x.updated_at DESC LIMIT 50`),
  );

  const n = (v: string | null | undefined) => Number(v ?? 0);
  const candidates = n(shadow?.candidates);
  const withBeacon = n(shadow?.with_beacon);
  return {
    requestedOwner: readGa4PurchaseOwner(),
    effectiveOwner: effectiveGa4PurchaseOwner(),
    windowDays: days,
    byStatus: byStatus.map((r) => ({ mode: r.mode, status: r.status, heldReason: r.held_reason, count: n(r.count) })),
    attribution: {
      captured: n(attr?.captured),
      missingClientId: n(attr?.missing_client),
      missingSessionId: n(attr?.missing_session),
      consentUnknown: n(attr?.consent_unknown),
    },
    oldestPendingMinutes: pending?.minutes == null ? null : Number(pending.minutes),
    ambiguousRows: n(pending?.ambiguous),
    gapOrders: gaps.map((g) => ({ orderId: g.id, orderNumber: g.order_number, paymentMethod: g.payment_method, paymentStatus: g.payment_status })),
    shadowCoverage: { candidates, withBrowserBeacon: withBeacon, withoutBrowserBeacon: candidates - withBeacon },
    recentProblems: problems.map((p) => ({
      orderId: p.order_id,
      orderNumber: p.order_number,
      status: p.status,
      heldReason: p.held_reason,
      lastError: p.last_error,
      attempts: p.attempts,
      ambiguousAttempts: p.ambiguous_attempts,
      eligibleAt: new Date(p.eligible_at).toISOString(),
    })),
  };
}
