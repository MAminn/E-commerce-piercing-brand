/**
 * Shared helpers for confirming online payments and triggering deferred Bosta sync.
 */

import { eq, sql } from "drizzle-orm";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import { order, orderItem } from "#root/shared/database/drizzle/schema";
import { createBostaDelivery, isBostaEnabled } from "#root/backend/orders/bosta/service";
import { persistBostaSyncStatus } from "#root/backend/orders/bosta/sync-status";
import { logOrderEvent } from "#root/backend/orders/order-log";

type PaymentStatus = "paid" | "failed" | "processing";

export function extractPaymobOrderId(data: Record<string, unknown>): string | null {
  const orderObj = data.order as Record<string, unknown> | undefined;
  const extras = (orderObj?.extras ?? data.extras) as Record<string, unknown> | undefined;
  const paymentKeyClaims = data.payment_key_claims as Record<string, unknown> | undefined;
  const claimExtras =
    (paymentKeyClaims?.extra as Record<string, unknown> | undefined) ??
    (paymentKeyClaims?.extras as Record<string, unknown> | undefined);

  const candidates = [
    orderObj?.merchant_order_id,
    orderObj?.special_reference,
    data.special_reference,
    data.merchant_order_id,
    extras?.orderId,
    claimExtras?.orderId,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

async function triggerBostaForPaidOrder(
  db: DatabaseClient,
  orderRow: typeof order.$inferSelect,
): Promise<void> {
  if (!isBostaEnabled()) return;
  if (orderRow.bostaSyncStatus === "sent" || orderRow.bostaDeliveryId) return;

  await persistBostaSyncStatus(orderRow.id, "pending");

  const nameParts = orderRow.customerName.trim().split(/\s+/);
  const firstName = nameParts[0] ?? orderRow.customerName;
  const lastName = nameParts.slice(1).join(" ") || "";

  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orderItem)
    .where(eq(orderItem.orderId, orderRow.id))
    .execute();

  const itemsCount = countRows[0]?.count ?? 1;

  const isCod = orderRow.paymentMethod === "cod";
  const codAmount = isCod ? Number(orderRow.total) : 0;

  const outcome = await createBostaDelivery({
    orderId: orderRow.id,
    receiver: {
      firstName,
      lastName,
      phone: orderRow.customerPhone,
    },
    dropOffAddress: {
      firstLine: orderRow.shippingAddress,
      city: orderRow.shippingCity,
      zone: orderRow.shippingState ?? undefined,
    },
    cod: codAmount,
    notes: orderRow.notes,
    itemsCount,
  });

  if (!outcome) return;

  if (outcome.success) {
    await persistBostaSyncStatus(orderRow.id, "sent", {
      delivery: outcome.result,
    });
    await logOrderEvent({
      orderId: orderRow.id,
      action: "bosta_sent",
      note: `Auto-sent to Bosta after payment was confirmed paid — tracking ${outcome.result.trackingNumber}`,
    });
    return;
  }

  await persistBostaSyncStatus(orderRow.id, "failed", {
    error: outcome.error,
  });
  await logOrderEvent({
    orderId: orderRow.id,
    action: "bosta_send_failed",
    note: `Auto-send to Bosta failed after payment confirmation: ${outcome.error}`,
  });
}

export async function applyOnlinePaymentUpdate(
  db: DatabaseClient,
  orderId: string,
  update: {
    paymentStatus: PaymentStatus;
    transactionId?: string | null;
    gatewayData?: unknown;
  },
): Promise<{ updated: boolean; paymentStatus: PaymentStatus }> {
  const [orderRow] = await db
    .select()
    .from(order)
    .where(eq(order.id, orderId))
    .limit(1)
    .execute();

  if (!orderRow) {
    return { updated: false, paymentStatus: update.paymentStatus };
  }

  const wasAlreadyPaid = orderRow.paymentStatus === "paid";
  const orderStatus =
    update.paymentStatus === "paid"
      ? "processing"
      : update.paymentStatus === "failed"
        ? "pending"
        : orderRow.status;

  await db
    .update(order)
    .set({
      paymentStatus: update.paymentStatus,
      paymentTransactionId: update.transactionId ?? orderRow.paymentTransactionId,
      paymentGatewayData: (update.gatewayData ?? orderRow.paymentGatewayData) as never,
      status: orderStatus,
      updatedAt: new Date(),
    })
    .where(eq(order.id, orderId))
    .execute();

  // Only log an actual transition — a duplicate "paid" webhook for an
  // already-paid order isn't a new event worth recording.
  if (update.paymentStatus !== orderRow.paymentStatus) {
    if (update.paymentStatus === "paid") {
      await logOrderEvent({
        orderId,
        action: "payment_confirmed",
        oldStatus: orderRow.paymentStatus,
        newStatus: "paid",
        note: `Payment confirmed paid via ${orderRow.paymentMethod}${
          update.transactionId ? ` (txn ${update.transactionId})` : ""
        }`,
      });
    } else if (update.paymentStatus === "failed") {
      await logOrderEvent({
        orderId,
        action: "payment_failed",
        oldStatus: orderRow.paymentStatus,
        newStatus: "failed",
        note: `Payment failed via ${orderRow.paymentMethod}${
          update.transactionId ? ` (txn ${update.transactionId})` : ""
        }`,
      });
    }
  }

  if (update.paymentStatus === "paid" && !wasAlreadyPaid) {
    try {
      const [freshRow] = await db
        .select()
        .from(order)
        .where(eq(order.id, orderId))
        .limit(1)
        .execute();
      if (freshRow && freshRow.bostaSyncStatus === "skipped") {
        await triggerBostaForPaidOrder(db, freshRow);
      }
    } catch (error) {
      console.error(`[Payment] Bosta sync after payment failed for ${orderId}:`, error);
    }
  }

  return { updated: true, paymentStatus: update.paymentStatus };
}
