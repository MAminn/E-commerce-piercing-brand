/**
 * Stripe Webhook Handler
 *
 * Handles Stripe webhook events (checkout.session.completed, etc.)
 * Registered as a Fastify plugin at /api/webhooks/stripe
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { isStripeConfigured } from "#root/shared/config/payment";
import { verifyStripeWebhook } from "./stripe-service";
import { Effect } from "effect";
import { query, DatabaseClientService } from "#root/shared/database/drizzle/db";
import { order } from "#root/shared/database/drizzle/schema";
import { eq } from "drizzle-orm";

export async function stripeWebhookPlugin(fastify: FastifyInstance) {
  // Only register if Stripe is configured
  if (!isStripeConfigured()) {
    fastify.post("/", async (_req, reply) => {
      return reply.code(404).send({ error: "Stripe is not configured" });
    });
    return;
  }

  // Stripe webhooks need the raw body for signature verification
  fastify.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_req, body, done) => {
      done(null, body);
    },
  );

  fastify.post("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const signature = request.headers["stripe-signature"] as string;

    if (!signature) {
      return reply.code(400).send({ error: "Missing stripe-signature header" });
    }

    try {
      const rawBody = request.body as Buffer;
      const event = await Effect.runPromise(
        verifyStripeWebhook(rawBody, signature),
      );

      const provideDb = Effect.provideService(DatabaseClientService, request.db);

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;
          const orderId = session.metadata?.orderId;

          if (orderId && session.payment_status === "paid") {
            await Effect.runPromise(
              query(async (db) => {
                await db
                  .update(order)
                  .set({
                    paymentStatus: "paid",
                    paymentTransactionId: session.payment_intent as string,
                    paymentGatewayData: session as any,
                    status: "processing",
                    updatedAt: new Date(),
                  })
                  .where(eq(order.id, orderId))
                  .execute();
              }).pipe(provideDb),
            );

            fastify.log.info(
              `[Stripe] Payment completed for order ${orderId}`,
            );
          }
          break;
        }

        case "checkout.session.expired": {
          const session = event.data.object;
          const orderId = session.metadata?.orderId;

          if (orderId) {
            await Effect.runPromise(
              query(async (db) => {
                await db
                  .update(order)
                  .set({
                    paymentStatus: "failed",
                    paymentGatewayData: session as any,
                    updatedAt: new Date(),
                  })
                  .where(eq(order.id, orderId))
                  .execute();
              }).pipe(provideDb),
            );

            fastify.log.info(
              `[Stripe] Payment expired for order ${orderId}`,
            );
          }
          break;
        }

        case "charge.refunded": {
          const charge = event.data.object;
          const paymentIntent = charge.payment_intent as string;

          if (paymentIntent) {
            await Effect.runPromise(
              query(async (db) => {
                await db
                  .update(order)
                  .set({
                    paymentStatus: "refunded",
                    updatedAt: new Date(),
                  })
                  .where(eq(order.paymentTransactionId, paymentIntent))
                  .execute();
              }).pipe(provideDb),
            );

            fastify.log.info(
              `[Stripe] Refund processed for payment ${paymentIntent}`,
            );
          }
          break;
        }

        default:
          fastify.log.info(`[Stripe] Unhandled event type: ${event.type}`);
      }

      return reply.code(200).send({ received: true });
    } catch (error: unknown) {
      fastify.log.error(
        `[Stripe] Webhook error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "Webhook processing failed",
      });
    }
  });
}
