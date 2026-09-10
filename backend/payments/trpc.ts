/**
 * Payment Gateway tRPC Router
 *
 * Provides:
 * - paymentMethods: Public query returning available payment methods
 * - createSession: Protected mutation to create a payment session for an order
 * - verifyPayment: Protected mutation to check payment status
 */

import { z } from "zod";
import { Effect } from "effect";
import { t, publicProcedure, provideDatabase } from "#root/shared/trpc/server";
import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import {
  getAvailablePaymentMethods,
  isStripeConfigured,
  isPaymobConfigured,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_DESCRIPTIONS,
  type PaymentMethod,
} from "#root/shared/config/payment";
import { query } from "#root/shared/database/drizzle/db";
import { order } from "#root/shared/database/drizzle/schema";
import { eq } from "drizzle-orm";
import { createStripeCheckoutSession, getStripeSession } from "./stripe-service";
import { createPaymobPaymentSession, verifyPaymobIntentionPayment } from "./paymob-service";
import { applyOnlinePaymentUpdate } from "./confirm-online-payment";
import { ServerError } from "#root/shared/error/server";

// ─── Payment Methods Query ──────────────────────────────────────────────────

const paymentMethodsProcedure = publicProcedure.query(async () => {
  const methods = getAvailablePaymentMethods();
  return {
    methods: methods.map((m) => ({
      id: m,
      label: PAYMENT_METHOD_LABELS[m],
      description: PAYMENT_METHOD_DESCRIPTIONS[m],
    })),
    hasOnlinePayment: methods.length > 1,
    stripePublicKey: isStripeConfigured()
      ? (process.env.VITE_STRIPE_PUBLIC_KEY ?? "")
      : null,
  };
});

// ─── Create Payment Session ─────────────────────────────────────────────────

const createPaymentSessionSchema = z.object({
  orderId: z.string().uuid(),
  paymentMethod: z.enum(["stripe", "paymob"]),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

// Public — guests who placed an order need to create payment sessions too
const createPaymentSessionProcedure = publicProcedure
  .input(createPaymentSessionSchema)
  .mutation(async ({ ctx, input }) => {
    return await runBackendEffect(
      Effect.gen(function* () {
        // Fetch the order
        const orderData = yield* query(async (db) => {
          const [o] = await db
            .select()
            .from(order)
            .where(eq(order.id, input.orderId))
            .limit(1)
            .execute();
          return o;
        });

        if (!orderData) {
          return yield* Effect.fail(
            new ServerError({
              tag: "NotFound",
              message: "Order not found",
              statusCode: 404,
              clientMessage: "Order not found",
            }),
          );
        }

        // Don't allow creating payment for already paid orders
        if (orderData.paymentStatus === "paid") {
          return yield* Effect.fail(
            new ServerError({
              tag: "BadRequest",
              message: "This order is already paid",
              statusCode: 400,
              clientMessage: "This order is already paid",
            }),
          );
        }

        const totalInCents = Math.round(Number.parseFloat(orderData.total) * 100);
        const shippingInCents = Math.round(Number.parseFloat(orderData.shipping) * 100);
        const taxInCents = Math.round(Number.parseFloat(orderData.tax) * 100);
        const discountInCents = orderData.discount
          ? Math.round(Number.parseFloat(orderData.discount) * 100)
          : 0;
        const currency = process.env.VITE_CURRENCY || "EGP";

        // Fetch order items for line items
        const items = yield* query(async (db) => {
          const { orderItem: orderItemTable } = await import("#root/shared/database/drizzle/schema");
          const rows = await db
            .select({
              name: orderItemTable.name,
              quantity: orderItemTable.quantity,
              price: orderItemTable.price,
            })
            .from(orderItemTable)
            .where(eq(orderItemTable.orderId, input.orderId))
            .execute();
          return rows;
        });

        const lineItems = items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          priceInCents: Math.round(Number.parseFloat(item.price) * 100),
        }));

        let paymentUrl: string;
        let sessionId: string;

        if (input.paymentMethod === "stripe") {
          if (!isStripeConfigured()) {
            return yield* Effect.fail(
              new ServerError({
                tag: "BadRequest",
                message: "Stripe is not configured",
                statusCode: 400,
                clientMessage: "Stripe payment is not available",
              }),
            );
          }

          const result = yield* createStripeCheckoutSession({
            orderId: input.orderId,
            customerEmail: orderData.customerEmail,
            customerName: orderData.customerName,
            items: lineItems,
            totalInCents,
            currency,
            successUrl: input.successUrl,
            cancelUrl: input.cancelUrl,
            shippingInCents,
            taxInCents,
            discountInCents,
          });

          paymentUrl = result.checkoutUrl;
          sessionId = result.sessionId;
        } else if (input.paymentMethod === "paymob") {
          if (!isPaymobConfigured()) {
            return yield* Effect.fail(
              new ServerError({
                tag: "BadRequest",
                message: "Paymob is not configured",
                statusCode: 400,
                clientMessage: "Paymob payment is not available",
              }),
            );
          }

          const result = yield* createPaymobPaymentSession({
            orderId: input.orderId,
            customerEmail: orderData.customerEmail,
            customerName: orderData.customerName,
            customerPhone: orderData.customerPhone,
            items: lineItems,
            totalInCents,
            currency,
            successUrl: input.successUrl,
            cancelUrl: input.cancelUrl,
          });

          paymentUrl = result.paymentUrl;
          sessionId = result.sessionId;
        } else {
          return yield* Effect.fail(
            new ServerError({
              tag: "BadRequest",
              message: `Unsupported payment method: ${input.paymentMethod}`,
              statusCode: 400,
              clientMessage: "Unsupported payment method",
            }),
          );
        }

        // Update order with payment session info
        yield* query(async (db) => {
          await db
            .update(order)
            .set({
              paymentMethod: input.paymentMethod,
              paymentStatus: "pending",
              paymentSessionId: sessionId,
              updatedAt: new Date(),
            })
            .where(eq(order.id, input.orderId))
            .execute();
        });

        return {
          paymentUrl,
          sessionId,
        };
      }).pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  });

// ─── Verify Payment Status ──────────────────────────────────────────────────

const verifyPaymentSchema = z.object({
  orderId: z.string().uuid(),
});

// Public — guests need to verify their payment status too
const verifyPaymentProcedure = publicProcedure
  .input(verifyPaymentSchema)
  .query(async ({ ctx, input }) => {
    return await runBackendEffect(
      Effect.gen(function* () {
        const orderData = yield* query(async (db) => {
          const [o] = await db
            .select({
              id: order.id,
              paymentMethod: order.paymentMethod,
              paymentStatus: order.paymentStatus,
              paymentSessionId: order.paymentSessionId,
              paymentTransactionId: order.paymentTransactionId,
              status: order.status,
              total: order.total,
            })
            .from(order)
            .where(eq(order.id, input.orderId))
            .limit(1)
            .execute();
          return o;
        });

        if (!orderData) {
          return yield* Effect.fail(
            new ServerError({ tag: "NotFound", message: "Order not found", statusCode: 404, clientMessage: "Order not found" }),
          );
        }

        // For Stripe, we can also check the session status directly
        if (
          orderData.paymentMethod === "stripe" &&
          orderData.paymentSessionId &&
          orderData.paymentStatus === "pending"
        ) {
          try {
            const session = yield* getStripeSession(orderData.paymentSessionId);
            if (session.payment_status === "paid") {
              yield* query(async (db) => {
                await applyOnlinePaymentUpdate(db, input.orderId, {
                  paymentStatus: "paid",
                  transactionId: session.payment_intent as string,
                  gatewayData: session,
                });
              });
              return {
                ...orderData,
                paymentStatus: "paid" as const,
                status: "processing" as const,
              };
            }
          } catch {
            // If Stripe check fails, return current DB state
          }
        }

        // For Paymob, poll the intention when the webhook hasn't landed yet
        if (
          orderData.paymentMethod === "paymob" &&
          orderData.paymentSessionId &&
          orderData.paymentStatus === "pending"
        ) {
          try {
            const verification = yield* verifyPaymobIntentionPayment(
              orderData.paymentSessionId,
            );
            if (verification.paid) {
              const transactionId =
                verification.data.id?.toString() ??
                orderData.paymentTransactionId;
              yield* query(async (db) => {
                await applyOnlinePaymentUpdate(db, input.orderId, {
                  paymentStatus: "paid",
                  transactionId,
                  gatewayData: verification.data,
                });
              });
              return {
                ...orderData,
                paymentStatus: "paid" as const,
                status: "processing" as const,
              };
            }
          } catch {
            // If Paymob check fails, return current DB state
          }
        }

        return orderData;
      }).pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  });

// ─── Router ─────────────────────────────────────────────────────────────────

export const paymentRouter = t.router({
  methods: paymentMethodsProcedure,
  createSession: createPaymentSessionProcedure,
  verify: verifyPaymentProcedure,
});
