import { query } from "#root/shared/database/drizzle/db";
import {
  order,
  orderItem,
  orderLog,
  product,
  user,
} from "#root/shared/database/drizzle/schema";
import { ServerError } from "#root/shared/error/server";
import { eq, sql } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import type { ClientSession } from "#root/backend/auth/shared/entities";
import { getStoreOwnerId } from "#root/shared/config/store";

/**
 * Full admin edit for an order. Every field the admin can see is editable:
 * customer details, shipping address, line items (quantities, per-line price,
 * removals and additions), money (shipping/tax/discount and an optional
 * hard total override), payment method/status, order status and notes.
 *
 * Any omitted field is left untouched, so partial edits are safe.
 */
export const editOrderSchema = z.object({
  orderId: z.string().uuid(),

  // ── Line items ──
  // Quantity to set for each existing order item. Setting quantity to 0
  // removes the item from the order and fully restores its stock.
  // `price`/`discountPrice` let the admin override what this line charges.
  items: z
    .array(
      z.object({
        orderItemId: z.string().uuid(),
        quantity: z.number().int().min(0),
        price: z.number().min(0).optional(),
        discountPrice: z.number().min(0).nullable().optional(),
      }),
    )
    .optional(),
  // Products to add to this order.
  newItems: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1),
        price: z.number().min(0).optional(),
      }),
    )
    .optional(),

  // ── Customer ──
  customerName: z.string().min(1).optional(),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().min(1).optional(),

  // ── Shipping address ──
  shippingAddress: z.string().min(1).optional(),
  shippingCity: z.string().min(1).optional(),
  shippingState: z.string().optional(),
  shippingPostalCode: z.string().optional(),
  shippingCountry: z.string().optional(),

  // ── Money ──
  shipping: z.number().min(0).optional(),
  tax: z.number().min(0).optional(),
  discount: z.number().min(0).optional(),
  /** Hard override. When omitted the total is recomputed from the lines. */
  total: z.number().min(0).optional(),

  // ── Payment / status / notes ──
  paymentMethod: z.enum(["cod", "stripe", "paymob"]).optional(),
  paymentStatus: z
    .enum(["not_required", "pending", "processing", "paid", "failed", "refunded"])
    .optional(),
  status: z
    .enum(["pending", "processing", "shipped", "delivered", "cancelled"])
    .optional(),
  notes: z.string().nullable().optional(),
});

export const editOrder = (
  input: z.infer<typeof editOrderSchema>,
  session?: ClientSession,
) =>
  Effect.gen(function* ($) {
    if (!session || (session.role !== "admin" && session.role !== "superadmin")) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "Forbidden",
            message: "Admin access required",
            statusCode: 403,
            clientMessage: "Admin access required",
          }),
        ),
      );
    }

    const { orderId, items, newItems } = input;

    return yield* $(
      query(async (db) => {
        return await db.transaction(async (tx) => {
          const existingOrder = await tx
            .select({
              id: order.id,
              status: order.status,
              shipping: order.shipping,
              tax: order.tax,
              discount: order.discount,
            })
            .from(order)
            .where(eq(order.id, orderId))
            .execute();

          if (!existingOrder || existingOrder.length === 0) {
            throw new ServerError({
              tag: "OrderNotFound",
              message: `Order with ID ${orderId} not found`,
              statusCode: 404,
              clientMessage: "Order not found",
            });
          }

          const existingItems = await tx
            .select({
              id: orderItem.id,
              productId: orderItem.productId,
              quantity: orderItem.quantity,
              price: orderItem.price,
              discountPrice: orderItem.discountPrice,
            })
            .from(orderItem)
            .where(eq(orderItem.orderId, orderId))
            .execute();

          const existingById = new Map(existingItems.map((it) => [it.id, it]));

          // ── Update existing line items ──
          for (const change of items ?? []) {
            const existing = existingById.get(change.orderItemId);
            if (!existing) {
              throw new ServerError({
                tag: "OrderItemNotFound",
                message: `Order item ${change.orderItemId} not found on this order`,
                statusCode: 404,
                clientMessage:
                  "One of the items on this order could not be found",
              });
            }

            const delta = change.quantity - existing.quantity;

            if (delta > 0) {
              // Increasing quantity — make sure enough stock exists.
              const productRow = await tx
                .select({ stock: product.stock })
                .from(product)
                .where(eq(product.id, existing.productId))
                .execute();

              const availableStock = productRow[0]?.stock ?? 0;
              if (availableStock < delta) {
                throw new ServerError({
                  tag: "InsufficientStock",
                  message: `Not enough stock to increase quantity (available: ${availableStock}, requested increase: ${delta})`,
                  statusCode: 400,
                  clientMessage: `Not enough stock available to increase this item's quantity (only ${availableStock} left).`,
                });
              }

              await tx
                .update(product)
                .set({ stock: sql`${product.stock} - ${delta}` })
                .where(eq(product.id, existing.productId));
            } else if (delta < 0) {
              // Decreasing (or removing) — release the difference back to stock.
              await tx
                .update(product)
                .set({ stock: sql`${product.stock} + ${-delta}` })
                .where(eq(product.id, existing.productId));
            }

            if (change.quantity === 0) {
              await tx.delete(orderItem).where(eq(orderItem.id, existing.id));
              continue;
            }

            const lineUpdate: {
              quantity: number;
              price?: string;
              discountPrice?: string | null;
            } = { quantity: change.quantity };

            if (change.price !== undefined) {
              lineUpdate.price = change.price.toFixed(2);
            }
            if (change.discountPrice !== undefined) {
              lineUpdate.discountPrice =
                change.discountPrice === null
                  ? null
                  : change.discountPrice.toFixed(2);
            }

            await tx
              .update(orderItem)
              .set(lineUpdate)
              .where(eq(orderItem.id, existing.id));
          }

          // ── Add brand-new line items ──
          for (const addition of newItems ?? []) {
            const productRow = await tx
              .select({
                id: product.id,
                name: product.name,
                price: product.price,
                discountPrice: product.discountPrice,
                stock: product.stock,
              })
              .from(product)
              .where(eq(product.id, addition.productId))
              .execute();

            const productData = productRow[0];
            if (!productData) {
              throw new ServerError({
                tag: "ProductNotFound",
                message: `Product ${addition.productId} not found`,
                statusCode: 404,
                clientMessage:
                  "One of the products you tried to add could not be found",
              });
            }

            if (productData.stock < addition.quantity) {
              throw new ServerError({
                tag: "InsufficientStock",
                message: `Not enough stock for ${productData.name} (available: ${productData.stock}, requested: ${addition.quantity})`,
                statusCode: 400,
                clientMessage: `Not enough stock for ${productData.name} (only ${productData.stock} left).`,
              });
            }

            await tx
              .update(product)
              .set({ stock: sql`${product.stock} - ${addition.quantity}` })
              .where(eq(product.id, productData.id));

            await tx.insert(orderItem).values({
              orderId,
              productId: productData.id,
              vendorId: getStoreOwnerId(),
              quantity: addition.quantity,
              price:
                addition.price !== undefined
                  ? addition.price.toFixed(2)
                  : productData.price.toString(),
              discountPrice:
                addition.price !== undefined
                  ? null
                  : (productData.discountPrice?.toString() ?? null),
              name: productData.name,
              vendorName: null,
            });
          }

          // ── Recompute the money from whatever the lines now say ──
          const refreshedItems = await tx
            .select({
              quantity: orderItem.quantity,
              price: orderItem.price,
              discountPrice: orderItem.discountPrice,
            })
            .from(orderItem)
            .where(eq(orderItem.orderId, orderId))
            .execute();

          if (refreshedItems.length === 0) {
            throw new ServerError({
              tag: "OrderWouldBeEmpty",
              message: "An order must have at least one item",
              statusCode: 400,
              clientMessage:
                "An order can't be edited down to zero items — cancel or delete it instead.",
            });
          }

          const subtotal = refreshedItems.reduce((acc, item) => {
            const effectivePrice = item.discountPrice
              ? Number.parseFloat(item.discountPrice.toString())
              : Number.parseFloat(item.price.toString());
            return acc + effectivePrice * item.quantity;
          }, 0);

          // Admin-supplied values win; otherwise keep what the order already had.
          const shipping =
            input.shipping ??
            Number.parseFloat(existingOrder[0]?.shipping?.toString() ?? "0");
          const tax =
            input.tax ??
            Number.parseFloat(existingOrder[0]?.tax?.toString() ?? "0");
          const discount =
            input.discount ??
            Number.parseFloat(existingOrder[0]?.discount?.toString() ?? "0");
          const total =
            input.total ?? Math.max(0, subtotal + shipping + tax - discount);

          const orderUpdate: Partial<typeof order.$inferInsert> = {
            subtotal: subtotal.toFixed(2),
            shipping: shipping.toFixed(2),
            tax: tax.toFixed(2),
            discount: discount.toFixed(2),
            total: total.toFixed(2),
            updatedAt: new Date(),
          };

          if (input.customerName !== undefined)
            orderUpdate.customerName = input.customerName;
          if (input.customerEmail !== undefined)
            orderUpdate.customerEmail = input.customerEmail;
          if (input.customerPhone !== undefined)
            orderUpdate.customerPhone = input.customerPhone;
          if (input.shippingAddress !== undefined)
            orderUpdate.shippingAddress = input.shippingAddress;
          if (input.shippingCity !== undefined)
            orderUpdate.shippingCity = input.shippingCity;
          if (input.shippingState !== undefined)
            orderUpdate.shippingState = input.shippingState;
          if (input.shippingPostalCode !== undefined)
            orderUpdate.shippingPostalCode = input.shippingPostalCode;
          if (input.shippingCountry !== undefined)
            orderUpdate.shippingCountry = input.shippingCountry;
          if (input.paymentMethod !== undefined)
            orderUpdate.paymentMethod = input.paymentMethod;
          if (input.paymentStatus !== undefined)
            orderUpdate.paymentStatus = input.paymentStatus;
          if (input.status !== undefined) orderUpdate.status = input.status;
          if (input.notes !== undefined) orderUpdate.notes = input.notes;

          const updatedOrder = await tx
            .update(order)
            .set(orderUpdate)
            .where(eq(order.id, orderId))
            .returning();

          const userData = await tx
            .select({ id: user.id })
            .from(user)
            .where(eq(user.email, session.email))
            .execute();

          const previousStatus = existingOrder[0]?.status;
          const nextStatus = input.status ?? previousStatus;

          await tx.insert(orderLog).values({
            orderId,
            userId: userData[0]?.id,
            action:
              input.status && input.status !== previousStatus
                ? "status_changed"
                : "items_edited",
            oldStatus: previousStatus,
            newStatus: nextStatus,
            note: `Order edited by ${session.role}`,
          });

          return updatedOrder[0];
        });
      }),
    );
  });
