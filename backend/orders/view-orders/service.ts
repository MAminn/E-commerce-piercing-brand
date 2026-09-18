import { query } from "#root/shared/database/drizzle/db";
import {
  file,
  order,
  orderBundle,
  orderItem,
  product,
  user,
} from "#root/shared/database/drizzle/schema";
import {
  and,
  asc,
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

          const orderIds = orders.map((o) => o.id);

          // Items and bundle snapshots for the whole page in ONE query each.
          // (Previously one items query per order — an N+1 that grew with the
          // page size; adding bundles per order would have doubled it.)
          const allItems =
            orderIds.length === 0
              ? []
              : await tx
                  .select({
                    id: orderItem.id,
                    orderId: orderItem.orderId,
                    productId: orderItem.productId,
                    vendorId: orderItem.vendorId, // Keep for DB schema compatibility
                    quantity: orderItem.quantity,
                    price: orderItem.price,
                    discountPrice: orderItem.discountPrice,
                    name: orderItem.name,
                    /**
                     * Links this line to its `order_bundle` snapshot. The line
                     * stays a normal, individually pickable SKU — this only
                     * tells the admin UI which visual group it belongs to.
                     */
                    orderBundleId: orderItem.orderBundleId,
                    /** Phase 7 option snapshot (`{ Color: "Gold" }`); null on simple/legacy lines. */
                    selectedOptions: orderItem.selectedOptions,
                    productImageDiskname: file.diskname,
                  })
                  .from(orderItem)
                  .leftJoin(product, eq(orderItem.productId, product.id))
                  .leftJoin(file, eq(product.imageId, file.id))
                  .where(inArray(orderItem.orderId, orderIds))
                  .orderBy(asc(orderItem.createdAt), asc(orderItem.id))
                  .execute();

          const itemsByOrder = new Map<string, typeof allItems>();
          for (const it of allItems) {
            const list = itemsByOrder.get(it.orderId) ?? [];
            list.push(it);
            itemsByOrder.set(it.orderId, list);
          }

          /**
           * Purchased bundle snapshots. Read ONLY from `order_bundle` — never
           * from the live `bundle_campaign` — so editing or deleting a
           * campaign can never rewrite what a historical order shows. Every
           * money field here is what the shopper was actually charged.
           */
          const allBundles =
            orderIds.length === 0
              ? []
              : await tx
                  .select({
                    id: orderBundle.id,
                    orderId: orderBundle.orderId,
                    instanceId: orderBundle.instanceId,
                    campaignId: orderBundle.campaignId,
                    campaignSlug: orderBundle.campaignSlug,
                    campaignTitle: orderBundle.campaignTitle,
                    campaignType: orderBundle.campaignType,
                    tierId: orderBundle.tierId,
                    requiredQuantity: orderBundle.requiredQuantity,
                    regularTotal: orderBundle.regularTotal,
                    bundleTotal: orderBundle.bundleTotal,
                    offerStacking: orderBundle.offerStacking,
                    createdAt: orderBundle.createdAt,
                  })
                  .from(orderBundle)
                  .where(inArray(orderBundle.orderId, orderIds))
                  .orderBy(asc(orderBundle.createdAt), asc(orderBundle.id))
                  .execute();

          const bundlesByOrder = new Map<string, typeof allBundles>();
          for (const b of allBundles) {
            const list = bundlesByOrder.get(b.orderId) ?? [];
            list.push(b);
            bundlesByOrder.set(b.orderId, list);
          }

          const ordersWithItems = await Promise.all(
            orders.map(async (orderData) => {
              // Single-shop mode: No vendor data needed
              const items = itemsByOrder.get(orderData.id) ?? [];

              const itemsWithImage = items.map((it) => {
                const { productImageDiskname, orderId: _orderId, ...rest } = it;
                return {
                  ...rest,
                  productImage: productImageDiskname
                    ? `/uploads/${productImageDiskname}`
                    : null,
                };
              });

              const bundles = (bundlesByOrder.get(orderData.id) ?? []).map((b) => {
                const { orderId: _orderId, ...rest } = b;
                return rest;
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
                /**
                 * One entry per purchased bundle INSTANCE. Two stacks from the
                 * same campaign are two entries with different ids, so the
                 * admin never merges them into one group.
                 */
                bundles,
                hasPaymentIssue,
              };
            }),
          );

          return { items: ordersWithItems, total, totalSales };
        });
      }),
    );
  });
