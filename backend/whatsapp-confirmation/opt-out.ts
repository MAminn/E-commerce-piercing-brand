import { and, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import { waOptOut, waOrderConfirmation, waOutbox } from "#root/shared/database/drizzle/schema";
import type { Tx } from "#root/backend/orders/update-order-status/apply-status-change";

/**
 * Opt-out (STOP) is final for automatic messages: once it is recorded, no
 * WhatsApp message of any kind (confirmation, reminder) is sent to that number.
 *
 * Ordering guarantee between a STOP and a send to the same number: both take
 * the same per-recipient transaction lock (lockRecipient).
 *   - The worker holds it from its last opt-out check until Meta has answered.
 *   - STOP holds it while it records the opt-out and cancels what is queued.
 * So a send has either started before the STOP was recorded (and the STOP
 * waits for it to finish), or it sees the opt-out and is never made. There
 * is no window in which a send starts after a STOP was recorded.
 */

type Db = DatabaseClient | Tx;

/** Transaction-scoped lock on one recipient (E.164 digits). */
export async function lockRecipient(tx: Db, phoneE164: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`wa-recipient:${phoneE164}`}, 0))`);
}

export async function isOptedOut(db: Db, phoneE164: string | null | undefined): Promise<boolean> {
  if (!phoneE164) return false;
  const [row] = await db.select({ p: waOptOut.phoneE164 }).from(waOptOut).where(eq(waOptOut.phoneE164, phoneE164)).limit(1);
  return row !== undefined;
}

export interface OptOutResult {
  /** Outbox rows (confirmations or reminders) cancelled before they were sent. */
  cancelledOutbox: number;
  /** Confirmations not yet sent, now ineligible (opted_out). */
  closedConfirmations: number;
  /** Orders whose confirmation is open, for the staff item. */
  orderIds: string[];
}

/**
 * Records the opt-out and stops everything still queued for that number, in
 * one transaction under the recipient lock (see the module comment).
 * Idempotent: a second STOP changes nothing.
 */
export async function recordOptOut(db: DatabaseClient, phoneE164: string, source: string, now = new Date()): Promise<OptOutResult> {
  return await db.transaction(async (tx) => {
    await lockRecipient(tx, phoneE164);
    await tx.insert(waOptOut).values({ phoneE164, source }).onConflictDoNothing();

    // Every not-yet-sent row addressed to this number, whatever its order.
    const cancelled = (await tx.execute(sql`
      UPDATE wa_outbox SET status = 'cancelled', last_error = 'recipient opted out (STOP)', updated_at = ${now.toISOString()}::timestamptz
      WHERE status = 'pending' AND payload->>'to' = ${phoneE164}
      RETURNING id`)) as unknown as { rows: unknown[] };

    // Confirmations never sent: closed as opted out (staff confirm by hand).
    const closed = await tx
      .update(waOrderConfirmation)
      .set({ state: "ineligible", ineligibleReason: "opted_out", updatedAt: now })
      .where(and(eq(waOrderConfirmation.phoneE164, phoneE164), eq(waOrderConfirmation.state, "queued")))
      .returning({ orderId: waOrderConfirmation.orderId });

    // Confirmations already sent and still unanswered stay as they are (a
    // later button press is still honoured). No reminder follows: the
    // scheduler never queues one for an opted-out number, and the worker
    // re-checks before every send.
    const open = await tx
      .select({ orderId: waOrderConfirmation.orderId })
      .from(waOrderConfirmation)
      .where(
        and(
          eq(waOrderConfirmation.phoneE164, phoneE164),
          inArray(waOrderConfirmation.state, ["sent", "delivered", "read", "reminder_sent"]),
          sql`${waOrderConfirmation.response} IS NULL`,
        ),
      );

    return {
      cancelledOutbox: cancelled.rows.length,
      closedConfirmations: closed.length,
      orderIds: [...new Set([...closed, ...open].map((r) => r.orderId))],
    };
  });
}

/** Cancels one claimed outbox row because its recipient opted out. */
export async function cancelForOptOut(db: Db, outboxId: string, now: Date): Promise<void> {
  await db
    .update(waOutbox)
    .set({ status: "cancelled", lastError: "recipient opted out (STOP)", lockedUntil: null, updatedAt: now })
    .where(eq(waOutbox.id, outboxId));
}
