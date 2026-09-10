// @ts-nocheck
import type { FastifyPluginAsync } from "fastify";
import { runBackendEffect } from "#root/shared/backend/effect";
import { provideDatabase } from "#root/shared/trpc/server";
import { fincartWebhookSchema, processFincartWebhook } from "./service";
import { isFincartEnabled } from "#root/backend/orders/fincart/config";
import { ServerError } from "#root/shared/error/server";

// Environment variable for webhook secret token — MUST be set in production
const FINCART_WEBHOOK_SECRET = process.env.FINCART_WEBHOOK_SECRET;

if (!FINCART_WEBHOOK_SECRET) {
  console.warn(
    "[Fincart Webhook] FINCART_WEBHOOK_SECRET is not set. Webhook endpoint will reject all requests.",
  );
}

export const fincartWebhookPlugin: FastifyPluginAsync = async (fastify) => {
  if (!isFincartEnabled()) {
    fastify.log.info("[Fincart Webhook] FINCART_ENABLED is not true — webhook disabled");
    return;
  }

  fastify.post("/", async (request, reply) => {
    try {
      const log = request.log.child({ module: "fincart-webhook" });

      // Reject all requests if the webhook secret is not configured
      if (!FINCART_WEBHOOK_SECRET) {
        log.error("FINCART_WEBHOOK_SECRET is not configured");
        return reply.status(503).send({
          success: false,
          error: "Webhook endpoint not configured",
        });
      }

      log.info({ body: request.body }, "Received webhook from Fincart");

      // Validate the request body against our schema
      const validationResult = fincartWebhookSchema.safeParse(request.body);
      if (!validationResult.success) {
        log.error(
          { errors: validationResult.error.format() },
          "Invalid webhook payload"
        );
        return reply.status(400).send({
          success: false,
          error: "Invalid payload format",
        });
      }

      // Get the Authorization header
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        log.error("Missing or invalid Authorization header");
        return reply.status(401).send({
          success: false,
          error: "Unauthorized",
        });
      }

      // Extract the token from the header
      const token = authHeader.substring(7); // Remove "Bearer " prefix

      // Create a webhook request object with the token from Authorization header
      const webhookRequest = {
        payload: validationResult.data.payload,
        webhookToken: token,
      };

      // Process the webhook
      const result = await runBackendEffect(
        processFincartWebhook(webhookRequest, FINCART_WEBHOOK_SECRET).pipe(
          provideDatabase({ db: request.db })
        )
      );

      // Check if the operation was successful
      if (result.success) {
        log.info(
          { orderId: validationResult.data.payload.orderId },
          "Successfully processed Fincart webhook"
        );
        return reply.status(200).send({
          success: true,
          message: "Webhook processed successfully",
        });
      }

      // Handle errors
      log.error({ error: result.error }, "Error processing Fincart webhook");

      // Need to handle specific error types
      const errorMessage = result.error.message || "Internal server error";
      const statusCode = result.error.statusCode || 500;

      return reply.status(statusCode).send({
        success: false,
        error: errorMessage,
      });
    } catch (error) {
      request.log.error({ error }, "Unhandled error in Fincart webhook");
      return reply.status(500).send({
        success: false,
        error: "Internal server error",
      });
    }
  });
};
