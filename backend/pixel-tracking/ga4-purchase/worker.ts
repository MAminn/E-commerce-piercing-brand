import { and, eq, isNull, sql } from "drizzle-orm";
import { v4 } from "uuid";
import {
  ga4PurchaseContext,
  ga4PurchaseOutbox,
  order,
  orderItem,
} from "#root/shared/database/drizzle/schema";
import { db as createDb, type DatabaseClient } from "#root/shared/database/drizzle/db";
import { effectiveGa4PurchaseOwner, type Ga4PurchaseOwner } from "#root/shared/config/ga4-purchase-owner";
import { loadGa4ServerConfig, type Ga4ServerConfig } from "./config";
import { setGa4PurchaseWorkerKick } from "./enqueue";
import {
  buildPurchaseBody,
  GA4_MAX_EVENT_AGE_MS,
  validatePurchaseBody,
  type BuildResult,
} from "./payload";
import { sendPurchaseToGa4, type FetchLike } from "./transport";

/**
 * Background delivery of the GA4 purchase outbox.
 *
 * server mode — claims due rows (`pending` whose next_attempt_at has come,
 *   or `sending` whose lease expired after a crash) with
 *   FOR UPDATE SKIP LOCKED, so concurrent ticks / instances never claim the
 *   same row. Each claim writes a fresh claim_token; only the holder of that
 *   token may record the outcome, so a slow worker cannot overwrite a row
 *   another worker has since reclaimed.
 * shadow mode — prepares the payload each shadow row WOULD send (or the
 *   reason it would be held) and sends nothing.
 * browser mode — the worker is not started.
 *
 * Bounded retries: exponential backoff from 30 s to 1 h, at most
 * MAX_ATTEMPTS requests, never past GA4's 72 h timestamp window.
 */

export const MAX_ATTEMPTS = 10;
export const LEASE_MS = 60_000;
export const TICK_INTERVAL_MS = 15_000;
const BATCH_SIZE = 20;

export function backoffMs(attempts: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 60 * 60 * 1000);
}

export interface Ga4PurchaseWorkerDeps {
  db: DatabaseClient;
  owner?: () => Ga4PurchaseOwner;
  now?: () => Date;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  batchSize?: number;
  leaseMs?: number;
  loadConfig?: (db: DatabaseClient) => Promise<Ga4ServerConfig | null>;
}

export interface TickReport {
  owner: Ga4PurchaseOwner;
  prepared: number;
  claimed: number;
  sent: number;
  retried: number;
  ambiguous: number;
  failed: number;
  held: number;
  lostLease: number;
  skipped?: "browser_mode" | "no_config" | "no_api_secret" | "ga4_disabled";
}

async function buildForOrder(
  database: DatabaseClient,
  orderId: string,
  eligibleAt: Date,
  config: Pick<Ga4ServerConfig, "consentRequired" | "consentCategory">,
): Promise<BuildResult> {
  const [orderRow] = await database.select({ id: order.id, total: order.total }).from(order).where(eq(order.id, orderId)).limit(1);
  if (!orderRow) return { kind: "invalid", reason: "order_missing" };
  const lines = await database
    .select({ productId: orderItem.productId, name: orderItem.name, quantity: orderItem.quantity, price: orderItem.price })
    .from(orderItem)
    .where(eq(orderItem.orderId, orderId));
  const [context] = await database
    .select({
      gaClientId: ga4PurchaseContext.gaClientId,
      gaSessionId: ga4PurchaseContext.gaSessionId,
      consentAnalytics: ga4PurchaseContext.consentAnalytics,
      consentMarketing: ga4PurchaseContext.consentMarketing,
    })
    .from(ga4PurchaseContext)
    .where(eq(ga4PurchaseContext.orderId, orderId))
    .limit(1);
  return buildPurchaseBody({
    order: orderRow,
    lines,
    context: context ?? null,
    consentPolicy: { consentRequired: config.consentRequired, consentCategory: config.consentCategory },
    eligibleAt,
  });
}

/** shadow: record what server mode would send. Zero requests to GA4. */
async function prepareShadowRows(deps: Required<Pick<Ga4PurchaseWorkerDeps, "db">> & Ga4PurchaseWorkerDeps, now: Date, report: TickReport) {
  const config = (await (deps.loadConfig ?? loadGa4ServerConfig)(deps.db)) ?? { consentRequired: false, consentCategory: null };
  const rows = await deps.db
    .select({ id: ga4PurchaseOutbox.id, orderId: ga4PurchaseOutbox.orderId, eligibleAt: ga4PurchaseOutbox.eligibleAt })
    .from(ga4PurchaseOutbox)
    .where(and(eq(ga4PurchaseOutbox.status, "shadow"), isNull(ga4PurchaseOutbox.preparedAt)))
    .limit(deps.batchSize ?? BATCH_SIZE);
  for (const row of rows) {
    const built = await buildForOrder(deps.db, row.orderId, row.eligibleAt, config);
    await deps.db
      .update(ga4PurchaseOutbox)
      .set({
        payload: built.kind === "ok" ? built.body : null,
        heldReason: built.kind === "ok" ? (built.missingSessionId ? "note_missing_session_id" : null) : built.reason,
        preparedAt: now,
        updatedAt: now,
      })
      .where(and(eq(ga4PurchaseOutbox.id, row.id), eq(ga4PurchaseOutbox.status, "shadow")));
    report.prepared++;
  }
}

interface ClaimedRow {
  id: string;
  order_id: string;
  payload: unknown;
  eligible_at: Date | string;
  attempts: number;
}

async function claimDueRows(database: DatabaseClient, token: string, now: Date, leaseMs: number, limit: number): Promise<ClaimedRow[]> {
  const lease = new Date(now.getTime() + leaseMs);
  const result = await database.execute(sql`
    UPDATE ga4_purchase_outbox o
    SET status = 'sending',
        claim_token = ${token}::uuid,
        locked_until = ${lease.toISOString()}::timestamptz,
        attempts = o.attempts + 1,
        ambiguous_attempts = o.ambiguous_attempts + CASE WHEN o.status = 'sending' THEN 1 ELSE 0 END,
        updated_at = ${now.toISOString()}::timestamptz
    WHERE o.id IN (
      SELECT id FROM ga4_purchase_outbox
      WHERE (status = 'pending' AND next_attempt_at <= ${now.toISOString()}::timestamptz)
         OR (status = 'sending' AND locked_until < ${now.toISOString()}::timestamptz)
      ORDER BY next_attempt_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING o.id, o.order_id, o.payload, o.eligible_at, o.attempts
  `);
  return (result as unknown as { rows: ClaimedRow[] }).rows;
}

export async function runGa4PurchaseTick(deps: Ga4PurchaseWorkerDeps): Promise<TickReport> {
  const owner = (deps.owner ?? effectiveGa4PurchaseOwner)();
  const now = (deps.now ?? (() => new Date()))();
  const report: TickReport = { owner, prepared: 0, claimed: 0, sent: 0, retried: 0, ambiguous: 0, failed: 0, held: 0, lostLease: 0 };
  if (owner === "browser") return { ...report, skipped: "browser_mode" };
  if (owner === "shadow") {
    await prepareShadowRows(deps, now, report);
    return report;
  }

  // server — refuse to claim anything that could not be sent anyway, so a
  // misconfiguration never burns attempts.
  const config = await (deps.loadConfig ?? loadGa4ServerConfig)(deps.db);
  if (!config) return { ...report, skipped: "no_config" };
  if (!config.enabled) return { ...report, skipped: "ga4_disabled" };
  if (!config.apiSecret) return { ...report, skipped: "no_api_secret" };
  const apiSecret = config.apiSecret;

  const token = v4();
  const rows = await claimDueRows(deps.db, token, now, deps.leaseMs ?? LEASE_MS, deps.batchSize ?? BATCH_SIZE);
  report.claimed = rows.length;

  for (const row of rows) {
    const eligibleAt = row.eligible_at instanceof Date ? row.eligible_at : new Date(row.eligible_at);
    const mine = and(eq(ga4PurchaseOutbox.id, row.id), eq(ga4PurchaseOutbox.claimToken, token));
    const finish = async (set: Partial<typeof ga4PurchaseOutbox.$inferInsert>) => {
      const updated = await deps.db
        .update(ga4PurchaseOutbox)
        .set({ ...set, lockedUntil: null, updatedAt: new Date() })
        .where(mine)
        .returning({ id: ga4PurchaseOutbox.id });
      if (updated.length === 0) {
        report.lostLease++;
        console.warn(`[GA4 Purchase] lease lost for order ${row.order_id} — outcome recorded by the newer claim`);
      }
    };
    // Steps that send nothing do not count as a delivery attempt.
    const noRequest = sql`${ga4PurchaseOutbox.attempts} - 1`;

    let body = row.payload;
    const extra: Partial<typeof ga4PurchaseOutbox.$inferInsert> = {};
    if (!body) {
      const built = await buildForOrder(deps.db, row.order_id, eligibleAt, config);
      if (built.kind === "held") {
        await finish({ status: "held", heldReason: built.reason, attempts: noRequest as never, preparedAt: now });
        report.held++;
        console.info(`[GA4 Purchase] held order ${row.order_id}: ${built.reason}`);
        continue;
      }
      if (built.kind === "invalid") {
        await finish({ status: "failed", lastError: built.reason, attempts: noRequest as never, preparedAt: now });
        report.failed++;
        console.warn(`[GA4 Purchase] failed order ${row.order_id}: ${built.reason}`);
        continue;
      }
      // Frozen on first build: every retry resends the identical body.
      body = built.body;
      extra.payload = built.body;
      extra.preparedAt = now;
      if (built.missingSessionId) extra.heldReason = "note_missing_session_id";
    }

    if (now.getTime() - eligibleAt.getTime() > GA4_MAX_EVENT_AGE_MS) {
      await finish({ ...extra, status: "failed", lastError: "expired_72h", attempts: noRequest as never });
      report.failed++;
      console.warn(`[GA4 Purchase] failed order ${row.order_id}: older than GA4's 72 h window`);
      continue;
    }
    const errors = validatePurchaseBody(body, now);
    if (errors.length > 0) {
      await finish({ ...extra, status: "failed", lastError: `invalid_payload:${errors.join(",")}`, attempts: noRequest as never });
      report.failed++;
      console.warn(`[GA4 Purchase] failed order ${row.order_id}: invalid payload (${errors.join(",")})`);
      continue;
    }

    const outcome = await sendPurchaseToGa4(
      body,
      { measurementId: config.measurementId, apiSecret },
      { fetchImpl: deps.fetchImpl, timeoutMs: deps.timeoutMs },
    );
    if (outcome.kind === "sent") {
      await finish({ ...extra, status: "sent", sentAt: new Date(), lastStatusCode: outcome.statusCode, lastError: null });
      report.sent++;
      console.info(`[GA4 Purchase] sent order ${row.order_id} (attempt ${row.attempts}, http ${outcome.statusCode})`);
      continue;
    }
    if (outcome.kind === "permanent") {
      await finish({ ...extra, status: "failed", lastStatusCode: outcome.statusCode, lastError: outcome.error });
      report.failed++;
      console.warn(`[GA4 Purchase] failed order ${row.order_id}: ${outcome.error} (not retryable)`);
      continue;
    }
    const ambiguous = outcome.kind === "ambiguous";
    if (ambiguous) report.ambiguous++;
    const statusCode = outcome.kind === "retry" ? (outcome.statusCode ?? null) : null;
    const ambiguousInc = ambiguous ? sql`${ga4PurchaseOutbox.ambiguousAttempts} + 1` : undefined;
    if (row.attempts >= MAX_ATTEMPTS) {
      await finish({
        ...extra,
        status: "failed",
        lastStatusCode: statusCode,
        lastError: `attempts_exhausted:${outcome.error}`,
        ...(ambiguousInc ? { ambiguousAttempts: ambiguousInc as never } : {}),
      });
      report.failed++;
      console.warn(`[GA4 Purchase] failed order ${row.order_id}: ${MAX_ATTEMPTS} attempts exhausted (${outcome.error})`);
      continue;
    }
    const next = new Date(now.getTime() + backoffMs(row.attempts));
    await finish({
      ...extra,
      status: "pending",
      nextAttemptAt: next,
      lastStatusCode: statusCode,
      lastError: outcome.error,
      ...(ambiguousInc ? { ambiguousAttempts: ambiguousInc as never } : {}),
    });
    report.retried++;
    console.warn(`[GA4 Purchase] retry order ${row.order_id}: ${outcome.error} (attempt ${row.attempts}, next ${next.toISOString()})`);
  }
  return report;
}

export interface Ga4PurchaseWorkerHandle {
  stop(): void;
  tick(): Promise<void>;
}

/** Started at boot (server/server.ts) after initGa4PurchaseOwner. */
export function startGa4PurchaseWorker(overrides: Partial<Ga4PurchaseWorkerDeps> = {}): Ga4PurchaseWorkerHandle {
  const owner = (overrides.owner ?? effectiveGa4PurchaseOwner)();
  if (owner === "browser") {
    return { stop: () => {}, tick: async () => {} };
  }
  const deps: Ga4PurchaseWorkerDeps = { db: overrides.db ?? createDb(), ...overrides };
  let inFlight = false;
  let rerun = false;
  let lastSkip: string | undefined;
  const tick = async (): Promise<void> => {
    if (inFlight) {
      rerun = true;
      return;
    }
    inFlight = true;
    try {
      const report = await runGa4PurchaseTick(deps);
      // Logged when the reason appears or changes, not on every tick.
      if (report.skipped !== lastSkip) {
        if (report.skipped && report.skipped !== "browser_mode") {
          console.warn(`[GA4 Purchase] server mode cannot send: ${report.skipped} (rows stay pending)`);
        } else if (lastSkip) {
          console.info("[GA4 Purchase] sending resumed");
        }
        lastSkip = report.skipped;
      }
    } catch (err) {
      // Queries here read no customer columns, so the driver message holds none.
      console.error(`[GA4 Purchase] tick failed: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}`);
    } finally {
      inFlight = false;
      if (rerun) {
        rerun = false;
        void tick();
      }
    }
  };
  const interval = setInterval(() => void tick(), TICK_INTERVAL_MS);
  interval.unref?.();
  setGa4PurchaseWorkerKick(() => void tick());
  console.info(`[GA4 Purchase] worker started (owner=${owner}, every ${TICK_INTERVAL_MS / 1000}s)`);
  void tick();
  return {
    stop: () => {
      clearInterval(interval);
      setGa4PurchaseWorkerKick(() => {});
    },
    tick,
  };
}
