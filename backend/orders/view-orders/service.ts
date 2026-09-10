import { query } from "#root/shared/database/drizzle/db";
import {
  file,
  order,
  orderItem,
  product,
  user,
} from "#root/shared/database/drizzle/schema";
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import type { ClientSession } from "#root/backend/auth/shared/entities";
import { ServerError } from "#root/shared/error/server";

export const viewOrdersSchema = z.object({
  limit: z.number().min(1).max(100).optional().default(10),
  offset: z.number().min(0).optional().default(0),
  status: z
    .enum(["pending", "processing", "shipped", "delivered", "cancelled"])
    .optional(),
  /** Inclusive start of the createdAt range (ISO datetime string) */
  dateFrom: z.string().optional(),
  /** Exclusive end of the createdAt range (ISO datetime string) */
  dateTo: z.string().optional(),
  /**
   * Online-payment orders that reached (or are mid-flight to) Bosta without
   * a confirmed "paid" status — should never happen post-fix, but surfaces
   * anything already in that state, or a regression, immediately.
   */
  paymentIssueOnly: z.boolean().optional(),
});

export const viewOrders = (
  input: z.infer<typeof viewOrdersSchema>,
  session?: ClientSession,
) =>
  Effect.gen(function* ($) {
    if (!session) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "Unauthorized",
            message: "You must be logged in to view orders",
            statusCode: 401,
            clientMessage: "You must be logged in to view orders",
          }),
        ),
      );
    }

    // Admin can view all orders, users can view their own orders
    // No special authentication needed beyond session check

    const { limit, offset, status, dateFrom, dateTo, paymentIssueOnly } = input;
    const isAdmin = session.role === "admin" || session.role === "superadmin";

    return yield* $(
      query(async (db) => {
        return await db.transaction(async (tx) => {
          const conditions: SQL<unknown>[] = [];

          if (status) {
            conditions.push(eq(order.status, status));
          }

          if (dateFrom) {
            conditions.push(gte(order.createdAt, new Date(dateFrom)));
          }
          if (dateTo) {
            conditions.push(lt(order.createdAt, new Date(dateTo)));
          }

          if (paymentIssueOnly) {
            conditions.push(
              and(
                inArray(order.paymentMethod, ["stripe", "paymob"]),
                notInArray(order.paymentStatus, ["paid", "refunded"]),
                or(
                  isNotNull(order.bostaDeliveryId),
                  inArray(order.bostaSyncStatus, ["sent", "pending"]),
                )!,
              )!,
            );
          }

          // Users (non-admins) only see their own orders
          if (!isAdmin) {
            const userResult = await tx
              .select({ id: user.id })
              .from(user)
              .where(eq(user.email, session.email))
              .execute();

            if (userResult.length === 0 || !userResult[0]?.id) {
              return { items: [], total: 0 };
            }

            conditions.push(eq(order.userId, userResult[0].id));
          }

          const whereClause =
            conditions.length > 0 ? and(...conditions) : undefined;

          const totalResult = await tx
            .select({ count: count() })
            .from(order)
            .where(whereClause)
            .execute();

          const total = totalResult[0]?.count ?? 0;

          const salesResult = await tx
            .select({ sum: sql<string>`coalesce(sum(${order.total}), 0)` })
            .from(order)
            .where(whereClause)
            .execute();

          const totalSales = Number(salesResult[0]?.sum ?? 0);

          const orders = await tx
            .select({
              id: order.id,
              customerName: order.customerName,
              customerEmail: order.customerEmail,
              customerPhone: order.customerPhone,
              shippingAddress: order.shippingAddress,
              shippingCity: order.shippingCity,
              shippingState: order.shippingState,
              shippingPostalCode: order.shippingPostalCode,
              shippingCountry: order.shippingCountry,
              subtotal: order.subtotal,
              shipping: order.shipping,
              tax: order.tax,
              discount: order.discount,
              promoCodeId: order.promoCodeId,
              total: order.total,
              status: order.status,
              notes: order.notes,
              paymentMethod: order.paymentMethod,
              paymentStatus: order.paymentStatus,
              createdAt: order.createdAt,
              updatedAt: order.updatedAt,
              bostaDeliveryId: order.bostaDeliveryId,
              bostaTrackingNumber: order.bostaTrackingNumber,
              bostaStatus: order.bostaStatus,
              bostaStatusCode: order.bostaStatusCode,
              bostaStatusUpdatedAt: order.bostaStatusUpdatedAt,
              bostaSyncStatus: order.bostaSyncStatus,
              bostaSyncError: order.bostaSyncError,
              bostaSyncedAt: order.bostaSyncedAt,
              bostaSyncAttemptedAt: order.bostaSyncAttemptedAt,
            })
            .from(order)
            .where(whereClause)
            .orderBy(desc(order.createdAt))
            .limit(limit)
            .offset(offset)
            .execute();

          const ordersWithItems = await Promise.all(
            orders.map(async (orderData) => {
              // Single-shop mode: No vendor data needed
              const items = await tx
                .select({
                  id: orderItem.id,
                  productId: orderItem.productId,
                  vendorId: orderItem.vendorId, // Keep for DB schema compatibility
                  quantity: orderItem.quantity,
                  price: orderItem.price,
                  discountPrice: orderItem.discountPrice,
                  name: orderItem.name,
                  productImageDiskname: file.diskname,
                })
                .from(orderItem)
                .leftJoin(product, eq(orderItem.productId, product.id))
                .leftJoin(file, eq(product.imageId, file.id))
                .where(eq(orderItem.orderId, orderData.id))
                .execute();

              const itemsWithImage = items.map((it) => {
                const { productImageDiskname, ...rest } = it;
                return {
                  ...rest,
                  productImage: productImageDiskname
                    ? `/uploads/${productImageDiskname}`
                    : null,
                };
              });

              const isOnlinePayment =
                orderData.paymentMethod === "stripe" ||
                orderData.paymentMethod === "paymob";
              const hasPaymentIssue =
                isOnlinePayment &&
                orderData.paymentStatus !== "paid" &&
                orderData.paymentStatus !== "refunded" &&
                (orderData.bostaDeliveryId !== null ||
                  orderData.bostaSyncStatus === "sent" ||
                  orderData.bostaSyncStatus === "pending");

              return {
                ...orderData,
                items: itemsWithImage,
                hasPaymentIssue,
              };
            }),
          );

          return { items: ordersWithItems, total, totalSales };
        });
      }),
    );
  });
