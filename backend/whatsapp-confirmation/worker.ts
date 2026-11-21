import { and, eq, sql } from "drizzle-orm";
import { v4 } from "uuid";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import { order, waOrderConfirmation, waOutbox, waSettings } from "#root/shared/database/drizzle/schema";
import {
  effectiveWhatsAppConfirmMode,
  readWhatsAppConfirmConfig,
  sendingConfigProblems,
  type WhatsAppConfirmConfig,
  type WhatsAppConfirmMode,
} from "#root/shared/config/whatsapp-confirmation";
import { sendGraphMessage, type FetchLike, type SendOutcome } from "./graph-client";
import { openReviewItem, runScheduler, runtimeMode } from "./store";
import { setWhatsAppWorkerKick } from "./enqueue";

/**
 * Background delivery of wa_outbox + the reminder / follow-up scheduler.
 *
 * Claims due `pending` rows with FOR UPDATE SKIP LOCKED (concurrent ticks or
 * instances never claim the same row); only the holder of the claim token
 * may record the outcome. A row still `sending` after its lease is NOT
 * re-sent — the first request may have reached Meta — it is failed as
 * `ambiguous` and handed to staff (the status webhook can still recover it
 * through biz_opaque_callback_data).
 *
 * Sends only in pilot/live, when not paused, when the config is complete and
 * while today's (Cairo) send count is below wa_settings.daily_send_cap.
 */

export const MAX_ATTEMPTS = 5;
export const LEASE_MS = 120_000;
export const SEND_TICK_MS = 15_000;
export const SCHEDULE_TICK_MS = 10 * 60_000;
const BATCH_SIZE = 10;
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000];

export function backoffMs(attempts: number): number {
  return BACKOFF_MS[Math.min(Math.max(attempts, 1), BACKOFF_MS.length) - 1] as number;
}

export interface WaWorkerDeps {
  db: DatabaseClient;
  mode?: () => WhatsAppConfirmMode;
  config?: () => WhatsAppConfirmConfig;
  now?: () => Date;
  fetchImpl?: FetchLike;
}

export interface SendTickReport {
  mode: WhatsAppConfirmMode;
  skipped?: string;
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
  ambiguous: number;
  cancelled: number;
  deferredByCap: number;
}

type ClaimedRow = { id: string; order_id: string; kind: "confirm" | "reminder"; payload: Record<string, unknown>; attempts: number };

async function rows<T>(db: DatabaseClient, q: ReturnType<typeof sql>): Promise<T[]> {
  return ((await db.execute(q)) as unknown as { rows: T[] }).rows;
}

export async function sentToday(db: DatabaseClient): Promise<number> {
  const [r] = await rows<{ n: number }>(
    db,
    sql`SELECT count(*)::int AS n FROM wa_outbox
        WHERE status = 'sent'
          AND sent_at >= (date_trunc('day', now() AT TIME ZONE 'Africa/Cairo') AT TIME ZONE 'Africa/Cairo')`,
  );
  return r?.n ?? 0;
}

export async function runSendTick(deps: WaWorkerDeps): Promise<SendTickReport> {
  const db = deps.db;
  const now = (deps.now ?? (() => new Date()))();
  const config = (deps.config ?? readWhatsAppConfirmConfig)();
  const mode = await runtimeMode(db, (deps.mode ?? effectiveWhatsAppConfirmMode)());
  const report: SendTickReport = { mode, claimed: 0, sent: 0, retried: 0, failed: 0, ambiguous: 0, cancelled: 0, deferredByCap: 0 };
  if (mode !== "pilot" && mode !== "live") return { ...report, skipped: `mode_${mode}` };
  const problems = sendingConfigProblems(config);
  if (problems.length) return { ...report, skipped: `config:${problems.join(",")}` };

  // Leases that expired mid-send: outcome unknown → never resend automatically.
  const stale = await rows<{ id: string; order_id: string; kind: string }>(
    db,
    sql`UPDATE wa_outbox SET status = 'failed', last_error_code = 'ambiguous', last_error = 'worker lost the lease during send — outcome unknown',
               locked_until = NULL, updated_at = ${now.toISOString()}::timestamptz
        WHERE status = 'sending' AND locked_until < ${now.toISOString()}::timestamptz
        RETURNING id, order_id, kind`,
  );
  for (const s of stale) {
    report.ambiguous++;
    await markAmbiguous(db, s.order_id, s.kind, now);
  }

  const [settings] = await db.select().from(waSettings).where(eq(waSettings.id, 1));
  const cap = settings?.dailySendCap ?? 200;
  let budget = cap - (await sentToday(db));
  if (budget <= 0) return { ...report, skipped: "daily_cap" };

  const token = v4();
  const lease = new Date(now.getTime() + LEASE_MS);
  const claimed = await rows<ClaimedRow>(
    db,
    sql`UPDATE wa_outbox o
        SET status = 'sending', claim_token = ${token}::uuid, locked_until = ${lease.toISOString()}::timestamptz,
            attempts = o.attempts + 1, updated_at = ${now.toISOString()}::timestamptz
        WHERE o.id IN (
          SELECT id FROM wa_outbox
          WHERE status = 'pending' AND next_attempt_at <= ${now.toISOString()}::timestamptz
          ORDER BY next_attempt_at
          LIMIT ${Math.min(BATCH_SIZE, budget)}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING o.id, o.order_id, o.kind, o.payload, o.attempts`,
  );
  report.claimed = claimed.length;

  for (const row of claimed) {
    const mine = and(eq(waOutbox.id, row.id), eq(waOutbox.claimToken, token));
    const finish = (set: Partial<typeof waOutbox.$inferInsert>) =>
      db.update(waOutbox).set({ ...set, lockedUntil: null, updatedAt: new Date() }).where(mine);

    // Re-check right before sending: the order may have moved on.
    const [o] = await db.select({ status: order.status, archivedAt: order.archivedAt }).from(order).where(eq(order.id, row.order_id));
    const [conf] = await db.select().from(waOrderConfirmation).where(eq(waOrderConfirmation.orderId, row.order_id));
    const stillWanted =
      o && o.status === "pending" && !o.archivedAt && conf && conf.response === null && (row.kind === "confirm" ? conf.state === "queued" : true);
    if (!stillWanted) {
      await finish({ status: "cancelled", attempts: sql`${waOutbox.attempts} - 1` as never, lastError: "order no longer awaiting confirmation" });
      report.cancelled++;
      continue;
    }
    if (budget <= 0) {
      await finish({ status: "pending", attempts: sql`${waOutbox.attempts} - 1` as never, nextAttemptAt: new Date(now.getTime() + 15 * 60_000) });
      report.deferredByCap++;
      continue;
    }

    const outcome: SendOutcome = await sendGraphMessage(
      { apiVersion: config.graphApiVersion as string, phoneNumberId: config.phoneNumberId as string, accessToken: config.accessToken as string },
      row.payload,
      deps.fetchImpl,
    );
    budget--;

    if (outcome.kind === "sent") {
      await finish({ status: "sent", wamid: outcome.wamid, sentAt: now, lastError: null, lastErrorCode: null });
      const set =
        row.kind === "confirm"
          ? { state: "sent", outboundWamid: outcome.wamid, sentAt: now, updatedAt: now }
          : { state: "reminder_sent", reminderWamid: outcome.wamid, updatedAt: now };
      await db.update(waOrderConfirmation).set(set).where(eq(waOrderConfirmation.orderId, row.order_id));
      report.sent++;
    } else if (outcome.kind === "retry" && row.attempts < MAX_ATTEMPTS) {
      await finish({ status: "pending", nextAttemptAt: new Date(now.getTime() + backoffMs(row.attempts)), lastErrorCode: outcome.code, lastError: outcome.message });
      report.retried++;
    } else if (outcome.kind === "ambiguous") {
      await finish({ status: "failed", lastErrorCode: `ambiguous:${outcome.code}`, lastError: outcome.message });
      await markAmbiguous(db, row.order_id, row.kind, now);
      report.ambiguous++;
    } else {
      await finish({ status: "failed", lastErrorCode: outcome.code, lastError: outcome.message });
      if (row.kind === "confirm") {
        await db
          .update(waOrderConfirmation)
          .set({ state: "failed", failedAt: now, lastError: `${outcome.code} ${outcome.message}`.slice(0, 300), updatedAt: now })
          .where(eq(waOrderConfirmation.orderId, row.order_id));
      }
      await openReviewItem(db, {
        orderId: row.order_id,
        type: "failed_send",
        detail: `WhatsApp ${row.kind} could not be sent (${outcome.code}: ${outcome.message.slice(0, 160)}) — confirm manually`,
      });
      report.failed++;
    }
  }
  return report;
}

async function markAmbiguous(db: DatabaseClient, orderId: string, kind: string, now: Date): Promise<void> {
  if (kind === "confirm") {
    await db
      .update(waOrderConfirmation)
      .set({ state: "failed", failedAt: now, lastError: "send outcome unknown (timeout)", updatedAt: now })
      .where(and(eq(waOrderConfirmation.orderId, orderId), sql`${waOrderConfirmation.response} IS NULL`));
  }
  await openReviewItem(db, {
    orderId,
    type: "failed_send",
    detail: `WhatsApp ${kind}: send outcome unknown (timeout). Check the chat before contacting the customer — it may have been delivered.`,
  });
}

export interface WaWorkerHandle {
  stop: () => void;
  tick: () => Promise<void>;
}

export function startWhatsAppConfirmWorker(deps: WaWorkerDeps): WaWorkerHandle | null {
  const mode = (deps.mode ?? effectiveWhatsAppConfirmMode)();
  if (mode === "off") return null;
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
      const report = await runSendTick(deps);
      if (report.skipped !== lastSkip) {
        if (report.skipped && !report.skipped.startsWith("mode_")) console.warn(`[WhatsApp confirm] not sending: ${report.skipped}`);
        lastSkip = report.skipped;
      }
      if (report.sent || report.failed || report.ambiguous) {
        console.info(`[WhatsApp confirm] sent=${report.sent} failed=${report.failed} ambiguous=${report.ambiguous} retried=${report.retried}`);
      }
    } catch (err) {
      console.error(`[WhatsApp confirm] send tick failed: ${String((err as Error)?.message ?? err).slice(0, 200)}`);
    } finally {
      inFlight = false;
      if (rerun) {
        rerun = false;
        void tick();
      }
    }
  };
  const schedule = async (): Promise<void> => {
    try {
      const r = await runScheduler(deps.db, {
        mode: (deps.mode ?? effectiveWhatsAppConfirmMode)(),
        config: (deps.config ?? readWhatsAppConfirmConfig)(),
      });
      if (r.reminders || r.followUps || r.superseded) {
        console.info(`[WhatsApp confirm] scheduler reminders=${r.reminders} followUps=${r.followUps} superseded=${r.superseded}`);
        if (r.reminders) void tick();
      }
    } catch (err) {
      console.error(`[WhatsApp confirm] scheduler failed: ${String((err as Error)?.message ?? err).slice(0, 200)}`);
    }
  };
  const sendInterval = setInterval(() => void tick(), SEND_TICK_MS);
  const scheduleInterval = setInterval(() => void schedule(), SCHEDULE_TICK_MS);
  sendInterval.unref?.();
  scheduleInterval.unref?.();
  setWhatsAppWorkerKick(() => void tick());
  console.info(`[WhatsApp confirm] worker started (mode=${mode})`);
  void tick();
  void schedule();
  return {
    stop: () => {
      clearInterval(sendInterval);
      clearInterval(scheduleInterval);
      setWhatsAppWorkerKick(() => {});
    },
    tick,
  };
}
