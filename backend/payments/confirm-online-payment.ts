/**
 * Shared helpers for confirming online payments and triggering deferred Bosta sync.
 */

import { eq, sql } from "drizzle-orm";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import { order, orderItem } from "#root/shared/database/drizzle/schema";
import { createBostaDelivery, isBostaEnabled } from "#root/backend/orders/bosta/service";
import { persistBostaSyncStatus } from "#root/backend/orders/bosta/sync-status";
import { logOrderEvent } from "#root/backend/orders/order-log";
import { queueOrderPlacedEmails } from "#root/backend/orders/order-emails/service";
import { effectiveGa4PurchaseOwner } from "#root/shared/config/ga4-purchase-owner";
import { enqueueGa4PurchaseInTx, kickGa4PurchaseWorker } from "#root/backend/pixel-tracking/ga4-purchase/enqueue";
import { isPurchaseMilestone } from "#root/backend/pixel-tracking/ga4-purchase/eligibility";

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
    orderNumber: orderRow.orderNumber,
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
  // Read-and-update under a row lock: two callbacks for the same order (the
  // webhook and the confirmation page's verify poll often race) are
  // serialised, so exactly one of them sees the transition to `paid`. The
  // GA4 purchase row (GA4_PURCHASE_OWNER shadow/server; a no-op in browser
  // mode) commits atomically with that transition.
  const ga4Owner = effectiveGa4PurchaseOwner();
  const locked = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(order)
      .where(eq(order.id, orderId))
      .limit(1)
      .for("update")
      .execute();
    if (!row) return null;

    const status =
      update.paymentStatus === "paid"
        ? "processing"
        : update.paymentStatus === "failed"
          ? "pending"
          : row.status;
    const paidAt = new Date();

    await tx
      .update(order)
      .set({
        paymentStatus: update.paymentStatus,
        paymentTransactionId: update.transactionId ?? row.paymentTransactionId,
        paymentGatewayData: (update.gatewayData ?? row.paymentGatewayData) as never,
        status,
        updatedAt: paidAt,
      })
      .where(eq(order.id, orderId))
      .execute();

    let ga4Enqueued = false;
    if (
      ga4Owner !== "browser" &&
      isPurchaseMilestone("payment_confirmed", row, {
        paymentMethod: row.paymentMethod,
        paymentStatus: update.paymentStatus,
        status,
      })
    ) {
      ga4Enqueued =
        (await enqueueGa4PurchaseInTx(tx, { orderId, source: "payment_confirmed", eligibleAt: paidAt }, ga4Owner)) ===
        "enqueued";
    }
    return { row, ga4Enqueued };
  });

  if (!locked) {
    return { updated: false, paymentStatus: update.paymentStatus };
  }
  const orderRow = locked.row;
  const wasAlreadyPaid = orderRow.paymentStatus === "paid";
  if (locked.ga4Enqueued && ga4Owner === "server") kickGa4PurchaseWorker();

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

  // Online-payment orders get their confirmation only here, once the
  // payment is confirmed paid — never at checkout. Dedupe on
  // `order_confirmation:<orderId>` makes a repeated webhook a no-op.
  if (update.paymentStatus === "paid" && !wasAlreadyPaid) {
    await queueOrderPlacedEmails({
      orderId: orderRow.id,
      customerEmail: orderRow.customerEmail,
      orderNumber: orderRow.orderNumber,
    });
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
