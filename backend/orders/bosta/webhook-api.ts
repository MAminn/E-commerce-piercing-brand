import type { FastifyPluginAsync } from "fastify";
import { runBackendEffect } from "#root/shared/backend/effect";
import { provideDatabase } from "#root/shared/trpc/server";
import { bostaWebhookSchema, processBostaWebhook } from "./webhook-service";

const BOSTA_API_KEY = process.env.SYN_BOSTA_KEY;
const BOSTA_WEBHOOK_SECRET = process.env.BOSTA_WEBHOOK_SECRET;

export const bostaWebhookPlugin: FastifyPluginAsync = async (fastify) => {
  // Only register if Bosta is configured
  if (!BOSTA_API_KEY) {
    fastify.log.info("[Bosta Webhook] SYN_BOSTA_KEY not set — webhook endpoint disabled");
    return;
  }

  if (!BOSTA_WEBHOOK_SECRET) {
    fastify.log.warn(
      "[Bosta Webhook] BOSTA_WEBHOOK_SECRET not set — webhook will reject all requests",
    );
  }

  fastify.post("/", async (request, reply) => {
    const log = request.log.child({ module: "bosta-webhook" });

    if (!BOSTA_WEBHOOK_SECRET) {
      return reply.status(503).send({ success: false, error: "Webhook not configured" });
    }

    // Extract auth token from Authorization header
    const authHeader = (request.headers["authorization"] as string) ?? "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;

    if (!token) {
      log.warn("Bosta webhook: missing Authorization header");
      return reply.status(401).send({ success: false, error: "Unauthorized" });
    }

    // Validate payload shape
    const parsed = bostaWebhookSchema.safeParse(request.body);
    if (!parsed.success) {
      log.warn({ errors: parsed.error.format() }, "Bosta webhook: invalid payload");
      return reply.status(400).send({ success: false, error: "Invalid payload" });
    }

    log.info(
      { trackingNumber: parsed.data.trackingNumber, state: parsed.data.state },
      "Bosta webhook received",
    );

    const result = await runBackendEffect(
      processBostaWebhook(parsed.data, token, BOSTA_WEBHOOK_SECRET).pipe(
        provideDatabase({ db: request.db }),
      ),
    );

    if (result.success) {
      return reply.status(200).send({ success: true });
    }

    log.error({ error: result.error }, "Bosta webhook processing error");
    const statusCode = (result.error as { statusCode?: number }).statusCode ?? 500;
    return reply.status(statusCode).send({
      success: false,
      error: (result.error as { clientMessage?: string }).clientMessage ?? "Internal error",
    });
  });
};
