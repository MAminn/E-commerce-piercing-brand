import { db } from "#root/shared/database/drizzle/db";
import { orderLog, webhookLog } from "#root/shared/database/drizzle/schema";
import { eq } from "drizzle-orm";

export type OrderLogAction =
  | "created"
  | "status_changed"
  | "cancelled"
  | "refunded"
  | "items_edited"
  | "payment_confirmed"
  | "payment_failed"
  | "bosta_sent"
  | "bosta_send_failed"
  | "bosta_skipped"
  | "bosta_cancelled"
  | "bosta_status_updated";

/**
 * Records one entry in the per-order audit trail (cart→checkout is
 * client-only and has no server row to log against; this starts at order
 * creation and covers every status/payment/courier transition after that).
 *
 * Never throws — a logging failure must not break the order/payment/courier
 * flow it's describing. Callers fire-and-forget this.
 */
export async function logOrderEvent(params: {
  orderId: string;
  action: OrderLogAction;
  oldStatus?: string | null;
  newStatus?: string | null;
  note?: string;
  userId?: string | null;
}): Promise<void> {
  try {
    await db()
      .insert(orderLog)
      .values({
        orderId: params.orderId,
        userId: params.userId ?? null,
        action: params.action,
        oldStatus: params.oldStatus ?? null,
        newStatus: params.newStatus ?? null,
        note: params.note ?? null,
      });
  } catch (err) {
    console.error(
      `[OrderLog] Failed to record "${params.action}" for order ${params.orderId}:`,
      err,
    );
  }
}

/**
 * Persists a raw inbound webhook payload (Paymob, Bosta, ...) as an
 * append-only record, independent of whatever single-slot "last payload"
 * field the order row itself keeps. Returns the row id so the caller can
 * later mark it processed/failed, or null if the insert itself failed.
 */
export async function recordWebhookLog(params: {
  webhookType: string;
  provider: string;
  payload: unknown;
  status?: "received" | "processed" | "failed";
  errorMessage?: string | null;
  orderId?: string | null;
}): Promise<string | null> {
  try {
    const [row] = await db()
      .insert(webhookLog)
      .values({
        webhookType: params.webhookType,
        provider: params.provider,
        payload: params.payload as Record<string, unknown>,
        status: params.status ?? "received",
        errorMessage: params.errorMessage ?? null,
        orderId: params.orderId ?? null,
      })
      .returning({ id: webhookLog.id });
    return row?.id ?? null;
  } catch (err) {
    console.error(`[WebhookLog] Failed to record ${params.provider} webhook:`, err);
    return null;
  }
}

export async function updateWebhookLogStatus(
  id: string,
  status: "processed" | "failed",
  errorMessage?: string | null,
): Promise<void> {
  try {
    await db()
      .update(webhookLog)
      .set({
        status,
        errorMessage: errorMessage ?? null,
        processedAt: new Date(),
      })
      .where(eq(webhookLog.id, id));
  } catch (err) {
    console.error(`[WebhookLog] Failed to update status for ${id}:`, err);
  }
}
