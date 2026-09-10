/**
 * Admin tRPC procedures for Bosta delivery management.
 *
 * All procedures are feature-flagged — they return a clear error if Bosta
 * is not configured, so nothing breaks for stores without the env key.
 */
import {
  adminProcedure,
  publicProcedure,
  provideDatabase,
  t,
} from "#root/shared/trpc/server";
import { runBackendEffect, serializeBackendEffectResult } from "#root/shared/backend/effect";
import { Effect } from "effect";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { query } from "#root/shared/database/drizzle/db";
import { order } from "#root/shared/database/drizzle/schema";
import { ServerError } from "#root/shared/error/server";
import {
  createBostaDelivery,
  cancelBostaDelivery,
  isBostaEnabled,
} from "./service";
import { persistBostaSyncStatus } from "./sync-status";
import { getBostaCheckoutLocations } from "./districts";
import { logOrderEvent } from "#root/backend/orders/order-log";

function requireBosta() {
  if (!isBostaEnabled()) {
    throw new ServerError({
      tag: "NotConfigured",
      message: "Bosta is not configured (SYN_BOSTA_KEY missing)",
      statusCode: 503,
      clientMessage: "Bosta integration is not enabled for this store",
    });
  }
}

export const bostaRouter = t.router({
  /** Checkout: whether Bosta shipping location pickers should be shown */
  checkoutIsEnabled: publicProcedure.query(() => ({
    enabled: isBostaEnabled(),
  })),

  /** Checkout: city / zone / district tree from Bosta API */
  listShippingLocations: publicProcedure.query(async () => {
    if (!isBostaEnabled()) {
      return { cities: [] };
    }
    const cities = await getBostaCheckoutLocations();
    return { cities };
  }),

  /** Admin: whether Bosta integration is active (for dashboard UI) */
  isEnabled: adminProcedure.query(() => ({
    enabled: isBostaEnabled(),
  })),

  /**
   * Admin: manually push an existing order to Bosta (e.g. if auto-send failed,
   * or for orders placed before the integration was enabled).
   */
  sendOrder: adminProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return await runBackendEffect(
        Effect.gen(function* ($) {
          requireBosta();

          const orderRow = yield* $(
            query(async (db) => {
              const rows = await db
                .select()
                .from(order)
                .where(eq(order.id, input.orderId))
                .execute();
              return rows[0] ?? null;
            }),
          );

          if (!orderRow) {
            return yield* $(
              Effect.fail(
                new ServerError({
                  tag: "NotFound",
                  statusCode: 404,
                  clientMessage: "Order not found",
                }),
              ),
            );
          }

          if (orderRow.bostaDeliveryId || orderRow.bostaSyncStatus === "sent") {
            return yield* $(
              Effect.fail(
                new ServerError({
                  tag: "AlreadyExists",
                  statusCode: 409,
                  clientMessage: "This order already has a Bosta delivery",
                }),
              ),
            );
          }

          // Hard gate: an online-payment order can only go to Bosta once its
          // payment has actually been confirmed "paid" — never speculatively,
          // and never just because an admin clicked a button. COD has nothing
          // to confirm, so it's exempt.
          const isOnlinePayment =
            orderRow.paymentMethod === "stripe" ||
            orderRow.paymentMethod === "paymob";
          if (isOnlinePayment && orderRow.paymentStatus !== "paid") {
            return yield* $(
              Effect.fail(
                new ServerError({
                  tag: "PaymentNotConfirmed",
                  statusCode: 409,
                  clientMessage: `Cannot send to Bosta — this order's ${orderRow.paymentMethod} payment is "${orderRow.paymentStatus}", not confirmed paid.`,
                }),
              ),
            );
          }

          yield* $(Effect.promise(() => persistBostaSyncStatus(input.orderId, "pending")));

          const nameParts = orderRow.customerName.trim().split(/\s+/);
          const firstName = nameParts[0] ?? orderRow.customerName;
          const lastName = nameParts.slice(1).join(" ") || "";

          const isCod = orderRow.paymentMethod === "cod";
          const codAmount = isCod ? Number(orderRow.total) : 0;

          const outcome = yield* $(
            Effect.promise(() =>
              createBostaDelivery({
                orderId: orderRow.id,
                receiver: {
                  firstName,
                  lastName,
                  phone: orderRow.customerPhone,
                },
                dropOffAddress: {
                  firstLine: orderRow.shippingAddress,
                  // Same routing as autoSendOrderToBosta: shippingState is
                  // the Bosta-governorate combobox pick, shippingCity is
                  // the free-text city/area used as the zone hint.
                  city: orderRow.shippingState || orderRow.shippingCity,
                  zone: orderRow.shippingCity ?? undefined,
                },
                cod: codAmount,
                notes: orderRow.notes,
              }),
            ),
          );

          if (!outcome) {
            return yield* $(
              Effect.fail(
                new ServerError({
                  tag: "NotConfigured",
                  statusCode: 503,
                  clientMessage: "Bosta is not configured",
                }),
              ),
            );
          }

          if (!outcome.success) {
            yield* $(
              Effect.promise(() =>
                persistBostaSyncStatus(input.orderId, "failed", {
                  error: outcome.error,
                }),
              ),
            );
            yield* $(
              Effect.promise(() =>
                logOrderEvent({
                  orderId: input.orderId,
                  action: "bosta_send_failed",
                  note: `Manual "Send to Bosta" by ${ctx.clientSession.email}: ${outcome.error}`,
                }),
              ),
            );
            return yield* $(
              Effect.fail(
                new ServerError({
                  tag: "ExternalServiceError",
                  statusCode: 502,
                  clientMessage: outcome.error,
                }),
              ),
            );
          }

          yield* $(
            Effect.promise(() =>
              persistBostaSyncStatus(input.orderId, "sent", {
                delivery: outcome.result,
              }),
            ),
          );

          yield* $(
            Effect.promise(() =>
              logOrderEvent({
                orderId: input.orderId,
                action: "bosta_sent",
                note: `Manual "Send to Bosta" by ${ctx.clientSession.email} — tracking ${outcome.result.trackingNumber}`,
              }),
            ),
          );

          return {
            deliveryId: outcome.result.deliveryId,
            trackingNumber: outcome.result.trackingNumber,
          };
        }).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),

  /**
   * Admin: cancel a Bosta delivery for an order.
   */
  cancelDelivery: adminProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return await runBackendEffect(
        Effect.gen(function* ($) {
          requireBosta();

          const orderRow = yield* $(
            query(async (db) => {
              const rows = await db
                .select({ id: order.id, bostaDeliveryId: order.bostaDeliveryId })
                .from(order)
                .where(eq(order.id, input.orderId))
                .execute();
              return rows[0] ?? null;
            }),
          );

          if (!orderRow?.bostaDeliveryId) {
            return yield* $(
              Effect.fail(
                new ServerError({
                  tag: "NotFound",
                  statusCode: 404,
                  clientMessage: "No Bosta delivery found for this order",
                }),
              ),
            );
          }

          const success = yield* $(
            Effect.promise(() => cancelBostaDelivery(orderRow.bostaDeliveryId!)),
          );

          if (!success) {
            yield* $(
              Effect.promise(() =>
                persistBostaSyncStatus(input.orderId, "failed", {
                  error: "Bosta cancel API call failed",
                }),
              ),
            );
            return yield* $(
              Effect.fail(
                new ServerError({
                  tag: "ExternalServiceError",
                  statusCode: 502,
                  clientMessage: "Failed to cancel Bosta delivery — check server logs",
                }),
              ),
            );
          }

          yield* $(
            Effect.promise(() => persistBostaSyncStatus(input.orderId, "cancelled")),
          );

          yield* $(
            Effect.promise(() =>
              logOrderEvent({
                orderId: input.orderId,
                action: "bosta_cancelled",
                note: `Bosta delivery cancelled by ${ctx.clientSession.email}`,
              }),
            ),
          );

          return { success: true };
        }).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),
});

