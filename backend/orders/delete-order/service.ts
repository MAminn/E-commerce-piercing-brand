import { query } from "#root/shared/database/drizzle/db";
import {
  order,
  orderItem,
  product,
} from "#root/shared/database/drizzle/schema";
import { Effect } from "effect";
import { z } from "zod";
import type { ClientSession } from "#root/backend/auth/shared/entities";
import { ServerError } from "#root/shared/error/server";
import { eq, sql } from "drizzle-orm";

export const deleteOrderSchema = z.object({
  orderId: z.string().uuid(),
});

export const deleteOrder = (
  input: z.infer<typeof deleteOrderSchema>,
  session?: ClientSession
) =>
  Effect.gen(function* ($) {
    if (!session) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "Unauthorized",
            message: "You must be logged in to delete orders",
            statusCode: 401,
            clientMessage: "You must be logged in to delete orders",
          })
        )
      );
    }

    const { orderId } = input;
    const isAdmin = session.role === "admin" || session.role === "superadmin";

    // Only allow admins to delete orders for now
    if (!isAdmin) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "Forbidden",
            message: "Only admins can delete orders",
            statusCode: 403,
            clientMessage: "You don't have permission to delete orders",
          })
        )
      );
    }

    return yield* $(
      query(async (db) => {
        return await db.transaction(async (tx) => {
          // Check if order exists
          const orderData = await tx
            .select({ id: order.id, stockRestored: order.stockRestored })
            .from(order)
            .where(eq(order.id, orderId))
            .execute();

          if (!orderData || orderData.length === 0) {
            throw new ServerError({
              tag: "OrderNotFound",
              message: `Order with ID ${orderId} not found for deletion`,
              statusCode: 404,
              clientMessage: "Order not found",
            });
          }

          // Restore the stock this order reserved, unless it was already
          // restored (e.g. the order was cancelled before being deleted).
          if (!orderData[0]?.stockRestored) {
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

          // Delete associated order items first (important for foreign key constraints)
          await tx.delete(orderItem).where(eq(orderItem.orderId, orderId));

          // Delete the order itself
          const deleteResult = await tx
            .delete(order)
            .where(eq(order.id, orderId))
            .returning({ id: order.id });

          if (!deleteResult || deleteResult.length === 0) {
            throw new ServerError({
              tag: "DeleteFailed",
              message: "Failed to delete order",
              statusCode: 500,
              clientMessage: "Failed to delete order. Please try again.",
            });
          }

          // Return success indicator, e.g., the deleted order ID
          return { success: true, deletedOrderId: deleteResult?.[0]?.id };
        });
      })
    );
  });
