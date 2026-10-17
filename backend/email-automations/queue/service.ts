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

/**
 * Order emails that ride the same queue for its retry, dedupe and
 * claim-locking, but are NOT marketing: they are never gated by the
 * automation on/off switch or test mode, never checked against marketing
 * unsubscribes, and never carry an unsubscribe link (see worker.ts).
 */
export type TransactionalEmailType =
  | "order_confirmation"
  | "order_admin_notification";

/** Every value of the `email_automation_type` column. */
export type ScheduledEmailType = EmailAutomationType | TransactionalEmailType;

export const TRANSACTIONAL_EMAIL_TYPES: readonly TransactionalEmailType[] = [
  "order_confirmation",
  "order_admin_notification",
];

export function isTransactionalEmailType(
  type: string,
): type is TransactionalEmailType {
  return (TRANSACTIONAL_EMAIL_TYPES as readonly string[]).includes(type);
}

export type ScheduledEmailLocale = "en" | "ar";

export interface EnqueueScheduledEmailParams {
  automationType: ScheduledEmailType;
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
 * Schedules an email. Never throws — a queueing failure must not break the
 * checkout/signup/order flow that triggered it, matching
 * backend/orders/order-log.ts's convention. Resolves to whether the row is
 * now queued (true also when the dedupeKey already existed) so a caller that
 * must record a failure — the order-confirmation flow — can; everyone else
 * can keep ignoring it.
 */
export async function enqueueScheduledEmail(
  params: EnqueueScheduledEmailParams,
): Promise<boolean> {
  try {
    // Ensure a subscription row (and unsubscribe token) exists as soon as
    // something is queued — not deferred to send time — so the row is
    // visible/manageable immediately and never racing the worker for it.
    // Transactional order emails are not marketing and create no
    // subscription row.
    if (!isTransactionalEmailType(params.automationType)) {
      await getOrCreateSubscriptionToken(params.recipientEmail);
    }

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
    return true;
  } catch (err) {
    console.error(
      `[EmailQueue] Failed to enqueue "${params.automationType}" for ${params.recipientEmail} (${params.dedupeKey}):`,
      err,
    );
    return false;
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

export const MAX_ATTEMPTS = 5;

/**
 * Atomically claims up to `limit` due rows and marks them "sending".
 * Uses SELECT ... FOR UPDATE SKIP LOCKED inside a transaction so multiple
 * app instances (or overlapping worker ticks) never claim the same row.
 */
export async function claimDueScheduledEmails(
  limit: number,
  /** Restrict the claim to these types — the worker passes the transactional types while marketing sends are switched off. */
  onlyTypes?: readonly ScheduledEmailType[],
): Promise<Array<typeof scheduledEmail.$inferSelect>> {
  return db().transaction(async (tx) => {
    const due = await tx
      .select({ id: scheduledEmail.id })
      .from(scheduledEmail)
      .where(
        and(
          eq(scheduledEmail.status, "pending"),
          lte(scheduledEmail.scheduledFor, new Date()),
          onlyTypes
            ? inArray(scheduledEmail.automationType, [...onlyTypes])
            : undefined,
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

/**
 * Puts rows of the given types that have sat in "sending" for longer than
 * `olderThanMs` back to "pending". A row only stays "sending" when the
 * process died mid-send; for transactional order emails a possible duplicate
 * is better than a confirmation that silently never goes out. Marketing rows
 * are never passed here.
 */
export async function requeueStaleSendingEmails(
  types: readonly ScheduledEmailType[],
  olderThanMs: number,
): Promise<number> {
  const rows = await db()
    .update(scheduledEmail)
    .set({ status: "pending", updatedAt: new Date() })
    .where(
      and(
        eq(scheduledEmail.status, "sending"),
        inArray(scheduledEmail.automationType, [...types]),
        lte(scheduledEmail.updatedAt, new Date(Date.now() - olderThanMs)),
      ),
    )
    .returning({ id: scheduledEmail.id });
  return rows.length;
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
): Promise<{ attempts: number; willRetry: boolean }> {
  const nextAttempts = attempts + 1;
  const willRetry = nextAttempts < MAX_ATTEMPTS;
  await db()
    .update(scheduledEmail)
    .set({
      status: willRetry ? "pending" : "failed",
      attempts: nextAttempts,
      lastError: error,
      updatedAt: new Date(),
    })
    .where(eq(scheduledEmail.id, id));
  return { attempts: nextAttempts, willRetry };
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
