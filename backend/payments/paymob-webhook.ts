/**
 * Paymob Webhook Handler
 *
 * Handles Paymob transaction callbacks and HMAC-verified webhooks.
 * Registered as a Fastify plugin at /api/webhooks/paymob
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { isPaymobConfigured, getPaymobConfig } from "#root/shared/config/payment";
import { getPublicOrigin } from "#root/shared/config/site-url";
import { verifyPaymobHmac } from "./paymob-service";
import {
  applyOnlinePaymentUpdate,
  extractPaymobOrderId,
} from "./confirm-online-payment";
import { Effect } from "effect";
import { query, DatabaseClientService } from "#root/shared/database/drizzle/db";
import {
  recordWebhookLog,
  updateWebhookLogStatus,
} from "#root/backend/orders/order-log";

export async function paymobWebhookPlugin(fastify: FastifyInstance) {
  // Only register if Paymob is configured
  if (!isPaymobConfigured()) {
    fastify.post("/", async (_req, reply) => {
      return reply.code(404).send({ error: "Paymob is not configured" });
    });
    return;
  }

  fastify.post("/", async (request: FastifyRequest, reply: FastifyReply) => {
    // Append-only record of the raw payload, independent of whatever this
    // handler does with it — this is what makes "nothing but Paymob's own
    // confirmation" auditable after the fact.
    let webhookLogId: string | null = null;

    try {
      const body = request.body as Record<string, unknown>;
      const transactionData = (body.obj || body) as Record<string, unknown>;

      webhookLogId = await recordWebhookLog({
        webhookType: "payment",
        provider: "paymob",
        payload: body,
      });

      // Verify HMAC. When a secret is configured this is a hard requirement —
      // a payload with no/invalid signature is NOT trusted, full stop, no
      // matter what its "success" field claims. Only when the store hasn't
      // configured PAYMOB_HMAC_SECRET at all do we fall back to accepting
      // unsigned payloads (misconfiguration, not a reason to break payments
      // entirely — but it's loudly logged so it gets fixed).
      const { hmacSecret } = getPaymobConfig();
      const hmac =
        (request.query as Record<string, string | undefined>)?.hmac ||
        (body.hmac as string | undefined);

      if (hmacSecret) {
        if (!hmac || !verifyPaymobHmac(transactionData, hmac)) {
          fastify.log.warn(
            `[Paymob] Rejected webhook — ${hmac ? "invalid" : "missing"} HMAC signature`,
          );
          if (webhookLogId) {
            await updateWebhookLogStatus(
              webhookLogId,
              "failed",
              hmac ? "Invalid HMAC signature" : "Missing HMAC signature",
            );
          }
          return reply.code(401).send({ error: "Invalid HMAC signature" });
        }
      } else {
        fastify.log.warn(
          "[Paymob] PAYMOB_HMAC_SECRET is not set — webhook signature is NOT being verified. Configure it immediately.",
        );
      }

      const orderId = extractPaymobOrderId(transactionData);

      if (!orderId) {
        fastify.log.warn(
          `[Paymob] No orderId in webhook data: ${JSON.stringify({
            merchant_order_id: (transactionData.order as Record<string, unknown> | undefined)?.merchant_order_id,
            special_reference: transactionData.special_reference,
          })}`,
        );
        if (webhookLogId) {
          await updateWebhookLogStatus(webhookLogId, "failed", "Missing orderId");
        }
        return reply.code(400).send({ error: "Missing orderId" });
      }

      const isSuccess =
        transactionData.success === true || transactionData.success === "true";
      const isPending =
        transactionData.pending === true || transactionData.pending === "true";
      const transactionId = transactionData.id?.toString() ?? null;

      let paymentStatus: "paid" | "failed" | "processing";
      if (isSuccess) {
        paymentStatus = "paid";
      } else if (isPending) {
        paymentStatus = "processing";
      } else {
        paymentStatus = "failed";
      }

      const provideDb = Effect.provideService(DatabaseClientService, request.db);

      await Effect.runPromise(
        query(async (db) => {
          await applyOnlinePaymentUpdate(db, orderId, {
            paymentStatus,
            transactionId,
            gatewayData: transactionData,
          });
        }).pipe(provideDb),
      );

      if (webhookLogId) {
        await updateWebhookLogStatus(webhookLogId, "processed");
      }

      fastify.log.info(
        `[Paymob] Payment ${paymentStatus} for order ${orderId} (txn: ${transactionId})`,
      );

      return reply.code(200).send({ received: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      fastify.log.error(`[Paymob] Webhook error: ${message}`);
      if (webhookLogId) {
        await updateWebhookLogStatus(webhookLogId, "failed", message);
      }
      return reply.code(500).send({
        error: error instanceof Error ? error.message : "Webhook processing failed",
      });
    }
  });

  // Paymob also sends GET callbacks on redirect — handle the redirect URL
  fastify.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const queryParams = request.query as Record<string, string>;
    const success = queryParams.success === "true";
    const orderId =
      queryParams.merchant_order_id ||
      queryParams.special_reference ||
      queryParams.orderId;

    if (orderId) {
      const baseUrl = getPublicOrigin();
      return reply.redirect(
        `${baseUrl}/order-confirmation?id=${orderId}&payment=${success ? "success" : "failed"}`,
      );
    }

    return reply.redirect("/");
  });
}
