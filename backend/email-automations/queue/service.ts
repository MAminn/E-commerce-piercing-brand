import { db } from "#root/shared/database/drizzle/db";
import { scheduledEmail } from "#root/shared/database/drizzle/schema";
import { and, desc, eq, inArray, like, lte } from "drizzle-orm";
import { getOrCreateSubscriptionToken } from "#root/backend/email-subscription/service";

export type EmailAutomationType =
  | "welcome"
  | "review_check"
  | "abandoned_cart"
  | "abandoned_browse"
  | "win_back"
  | "new_drops"
  | "flash_offer"
  | "retention";

export type ScheduledEmailLocale = "en" | "ar";

export interface EnqueueScheduledEmailParams {
  automationType: EmailAutomationType;
  recipientEmail: string;
  locale?: ScheduledEmailLocale;
  /** Arbitrary data the template needs to render (order items, product, discount code, campaign id, ...). */
  payload: Record<string, unknown>;
  scheduledFor: Date;
  /**
   * Identifies the logical send (e.g. `abandoned_cart:step1:{cartId}`,
   * `broadcast:{campaignId}:{email}`). Enqueuing the same dedupeKey again
   * updates the still-pending row instead of creating a duplicate, and is a
   * silent no-op if that row already sent/is sending/was cancelled.
   */
  dedupeKey: string;
}

/**
 * Schedules a marketing-automation email. Never throws — a queueing failure
 * must not break the checkout/signup/order flow that triggered it. Callers
 * fire-and-forget this, matching backend/orders/order-log.ts's convention.
 */
export async function enqueueScheduledEmail(
  params: EnqueueScheduledEmailParams,
): Promise<void> {
  try {
    // Ensure a subscription row (and unsubscribe token) exists as soon as
    // something is queued — not deferred to send time — so the row is
    // visible/manageable immediately and never racing the worker for it.
    await getOrCreateSubscriptionToken(params.recipientEmail);

    await db()
      .insert(scheduledEmail)
      .values({
        automationType: params.automationType,
        recipientEmail: params.recipientEmail,
        locale: params.locale ?? "en",
        payload: params.payload,
        scheduledFor: params.scheduledFor,
        dedupeKey: params.dedupeKey,
      })
      .onConflictDoUpdate({
        target: scheduledEmail.dedupeKey,
        set: {
          payload: params.payload,
          scheduledFor: params.scheduledFor,
          locale: params.locale ?? "en",
          updatedAt: new Date(),
        },
        // Only refresh a row that hasn't gone out yet. If it already
        // sent/is sending/was cancelled, leave it alone — re-triggering the
        // same event later (e.g. adding another item to an already-tracked
        // abandoned cart) must not resurrect or resend a completed send.
        setWhere: eq(scheduledEmail.status, "pending"),
      });
  } catch (err) {
    console.error(
      `[EmailQueue] Failed to enqueue "${params.automationType}" for ${params.recipientEmail} (${params.dedupeKey}):`,
      err,
    );
  }
}

/**
 * Cancels every still-pending row whose dedupeKey starts with the given
 * prefix — e.g. cancel every remaining abandoned-cart step for a cart that
 * just converted to an order: `cancelScheduledEmailsByPrefix("abandoned_cart:step")`
 * combined with the cart id, or a single exact dedupeKey for one row.
 * Never throws, for the same reason as enqueueScheduledEmail.
 */
export async function cancelScheduledEmailsByPrefix(
  dedupeKeyPrefix: string,
): Promise<void> {
  try {
    await db()
      .update(scheduledEmail)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(scheduledEmail.status, "pending"),
          like(scheduledEmail.dedupeKey, `${dedupeKeyPrefix}%`),
        ),
      );
  } catch (err) {
    console.error(
      `[EmailQueue] Failed to cancel rows matching "${dedupeKeyPrefix}":`,
      err,
    );
  }
}

// ─── Worker-internal operations ─────────────────────────────────────────────
// Unlike the enqueue/cancel helpers above (fire-and-forget side effects of
// unrelated flows), these ARE the core logic of the worker loop — they
// intentionally throw on failure so the worker's own try/catch can log and
// back off, instead of silently swallowing a real DB problem.

const MAX_ATTEMPTS = 5;

/**
 * Atomically claims up to `limit` due rows and marks them "sending".
 * Uses SELECT ... FOR UPDATE SKIP LOCKED inside a transaction so multiple
 * app instances (or overlapping worker ticks) never claim the same row.
 */
export async function claimDueScheduledEmails(
  limit: number,
): Promise<Array<typeof scheduledEmail.$inferSelect>> {
  return db().transaction(async (tx) => {
    const due = await tx
      .select({ id: scheduledEmail.id })
      .from(scheduledEmail)
      .where(
        and(
          eq(scheduledEmail.status, "pending"),
          lte(scheduledEmail.scheduledFor, new Date()),
        ),
      )
      .orderBy(scheduledEmail.scheduledFor)
      .limit(limit)
      .for("update", { skipLocked: true });

    if (due.length === 0) return [];

    const ids = due.map((row) => row.id);
    return tx
      .update(scheduledEmail)
      .set({ status: "sending", updatedAt: new Date() })
      .where(inArray(scheduledEmail.id, ids))
      .returning();
  });
}

export async function markScheduledEmailSent(id: string): Promise<void> {
  await db()
    .update(scheduledEmail)
    .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
    .where(eq(scheduledEmail.id, id));
}

/**
 * Records a failed send attempt. Retries (back to "pending" for the next
 * tick) until MAX_ATTEMPTS, then marks permanently "failed".
 */
export async function markScheduledEmailFailed(
  id: string,
  attempts: number,
  error: string,
): Promise<void> {
  const nextAttempts = attempts + 1;
  await db()
    .update(scheduledEmail)
    .set({
      status: nextAttempts >= MAX_ATTEMPTS ? "failed" : "pending",
      attempts: nextAttempts,
      lastError: error,
      updatedAt: new Date(),
    })
    .where(eq(scheduledEmail.id, id));
}

/**
 * Most-recently-touched rows across every automation type, for the admin
 * queue-activity view — lets the admin confirm a triggered send actually
 * went out (or see why it didn't: cancelled/failed + lastError) without a
 * direct DB query.
 */
export async function listRecentScheduledEmails(
  limit = 50,
): Promise<Array<typeof scheduledEmail.$inferSelect>> {
  return db()
    .select()
    .from(scheduledEmail)
    .orderBy(desc(scheduledEmail.updatedAt))
    .limit(limit);
}

/** Marks a claimed row cancelled without sending — used when a send-time check (e.g. unsubscribe, test mode) says it shouldn't go out. */
export async function markScheduledEmailCancelled(
  id: string,
  reason?: string,
): Promise<void> {
  await db()
    .update(scheduledEmail)
    .set({
      status: "cancelled",
      ...(reason ? { lastError: reason } : {}),
      updatedAt: new Date(),
    })
    .where(eq(scheduledEmail.id, id));
}
