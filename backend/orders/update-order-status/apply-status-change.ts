import { eq, sql } from "drizzle-orm";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import { order, orderItem, orderLog, product, user } from "#root/shared/database/drizzle/schema";
import { ServerError } from "#root/shared/error/server";
import { enqueueReviewCheckForOrder } from "#root/backend/email-automations/triggers/order-delivered";

/**
 * The transactional core of an order status change: the ONE place that
 * decides what a status change writes. Extracted unchanged from
 * update-order-status/service.ts so that every writer goes through exactly the
 * same logic:
 *
 *   - the admin tRPC procedure (`updateOrderStatus`), with a `user` actor;
 *   - the ABS live writer (backend/shipping-tracking/abs/live.ts), with a
 *     `system` actor, and its admin "Undo" (a `user` actor with a note).
 *
 * What it writes, inside the caller's transaction:
 *   - `order`: `status` (+ `stock_restored = true` the first time an order is
 *     cancelled);
 *   - `product.stock` += quantity per item, ONLY on the first cancel of an
 *     order whose stock was not restored yet (never on any other transition);
 *   - one `order_log` row: action `status_changed`, old/new status, note,
 *     user id (the admin's user row; NULL for a system actor);
 *   - on a transition INTO `delivered`: the review-check email enqueue
 *     (enqueueReviewCheckForOrder — never throws; it uses its own connection,
 *     exactly as the admin path always did).
 *
 * It does not check permissions (callers do) and does not lock the order row:
 * a caller that needs compare-and-set semantics locks it (`SELECT … FOR
 * UPDATE`) in the same transaction before calling this.
 */

export const ORDER_STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"] as const;
export type OrderStatusValue = (typeof ORDER_STATUSES)[number];

export type StatusChangeActor =
  /** A signed-in user. `note` replaces the default "Status changed from … by <role>" (used by ABS Undo only). */
  | { kind: "user"; email: string; role: string; note?: string }
  /** An automated writer. `user_id` stays NULL; the note is mandatory and is stored as given. */
  | { kind: "system"; note: string };

export type Tx = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];

export interface StatusChangeResult {
  order: typeof order.$inferSelect;
  oldStatus: string;
  newStatus: OrderStatusValue;
  orderLogId: string;
  /** True when this call restored the order's stock (first cancel). */
  stockRestoredNow: boolean;
  /** True when this call enqueued the review-check email (transition into delivered). */
  reviewEmailEnqueued: boolean;
}

export async function applyOrderStatusChange(
  tx: Tx,
  input: { orderId: string; newStatus: OrderStatusValue; actor: StatusChangeActor },
): Promise<StatusChangeResult> {
  const { orderId, newStatus: status, actor } = input;
  if (actor.kind === "system" && !actor.note.trim()) {
    throw new Error("applyOrderStatusChange: a system actor needs a note");
  }

  // Get current order data including old status
  const currentOrder = await tx
    .select({
      id: order.id,
      status: order.status,
      stockRestored: order.stockRestored,
    })
    .from(order)
    .where(eq(order.id, orderId))
    .execute();

  if (!currentOrder || currentOrder.length === 0) {
    throw new ServerError({
      tag: "OrderNotFound",
      message: `Order with ID ${orderId} not found`,
      statusCode: 404,
      clientMessage: "Order not found",
    });
  }

  const oldStatus = currentOrder[0]?.status || "pending";
  const alreadyRestored = currentOrder[0]?.stockRestored ?? false;

  // Cancelling an order releases the stock it reserved. Only restore
  // once per order — flipping status back and forth must not
  // inflate stock beyond what was actually reserved.
  const shouldRestoreStock = status === "cancelled" && oldStatus !== "cancelled" && !alreadyRestored;

  if (shouldRestoreStock) {
    const items = await tx
      .select({
        productId: orderItem.productId,
        quantity: orderItem.quantity,
      })
      .from(orderItem)
      .where(eq(orderItem.orderId, orderId))
      .execute();

    for (const item of items) {
      await tx
        .update(product)
        .set({ stock: sql`${product.stock} + ${item.quantity}` })
        .where(eq(product.id, item.productId));
    }
  }

  const updateResult = await tx
    .update(order)
    .set({
      status,
      ...(shouldRestoreStock ? { stockRestored: true } : {}),
    })
    .where(eq(order.id, orderId))
    .returning();

  const updated = updateResult?.[0];
  if (!updated) {
    throw new ServerError({
      tag: "UpdateFailed",
      message: "Failed to update order status",
      statusCode: 500,
      clientMessage: "Failed to update order status. Please try again.",
    });
  }

  let userId: string | null | undefined = null;
  let note: string;
  if (actor.kind === "user") {
    // Get user ID for logging
    const userData = await tx.select({ id: user.id }).from(user).where(eq(user.email, actor.email)).execute();
    userId = userData[0]?.id;
    note = actor.note ?? `Status changed from ${oldStatus} to ${status} by ${actor.role}`;
  } else {
    note = actor.note;
  }

  // Log the order status change
  const [logRow] = await tx
    .insert(orderLog)
    .values({
      orderId,
      userId,
      action: "status_changed",
      oldStatus,
      newStatus: status,
      note,
    })
    .returning({ id: orderLog.id });

  let reviewEmailEnqueued = false;
  if (status === "delivered" && oldStatus !== "delivered") {
    await enqueueReviewCheckForOrder({
      orderId,
      customerEmail: updated.customerEmail,
      customerName: updated.customerName,
    });
    reviewEmailEnqueued = true;
  }

  if (!logRow) throw new Error("applyOrderStatusChange: order_log insert returned no row");

  return {
    order: updated,
    oldStatus,
    newStatus: status,
    orderLogId: logRow.id,
    stockRestoredNow: shouldRestoreStock,
    reviewEmailEnqueued,
  };
}
