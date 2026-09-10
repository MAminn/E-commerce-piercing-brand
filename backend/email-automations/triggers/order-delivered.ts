import { enqueueScheduledEmail } from "#root/backend/email-automations/queue/service";
import { getEffectiveTemplate } from "#root/backend/email-automations/templates/service";

/**
 * Enqueues the review-request email for an order that just transitioned
 * INTO "delivered" (call only on that transition, not on every subsequent
 * update — callers gate this themselves via oldStatus !== newStatus).
 * Shared by every code path that can set an order to delivered (manual
 * admin update, Bosta webhook, Fincart webhook) so the timing/dedupe logic
 * lives in exactly one place. Never throws — fire-and-forget.
 */
export async function enqueueReviewCheckForOrder(input: {
  orderId: string;
  customerEmail: string;
  customerName?: string;
}): Promise<void> {
  if (!input.customerEmail) return;
  try {
    const template = await getEffectiveTemplate("review_check", "default");
    if (!template.enabled) return;

    await enqueueScheduledEmail({
      automationType: "review_check",
      recipientEmail: input.customerEmail,
      payload: {
        customerName: input.customerName ?? "",
      },
      scheduledFor: new Date(Date.now() + template.delayMinutes * 60_000),
      dedupeKey: `review_check:${input.orderId}`,
    });
  } catch (err) {
    console.error(
      `[ReviewCheck] Failed to enqueue for order ${input.orderId}:`,
      err,
    );
  }
}
