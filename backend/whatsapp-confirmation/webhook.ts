import type { FastifyInstance, FastifyRequest } from "fastify";
import { createHash } from "node:crypto";
import { db as createDb } from "#root/shared/database/drizzle/db";
import { effectiveWhatsAppConfirmMode, readWhatsAppConfirmConfig } from "#root/shared/config/whatsapp-confirmation";
import { verifyMetaSignature, verifyTokenMatches } from "./signature";
import { parseWebhookBody } from "./webhook-parse";
import { processInboundEvent, recordInboundEvents } from "./store";

/**
 * Cloud API webhook: registered under /api/webhooks/whatsapp.
 *
 *   GET  — subscription handshake (hub.verify_token, constant-time).
 *   POST — X-Hub-Signature-256 over the RAW body with the app secret. Bad or
 *          missing signature → 401 and nothing stored. Good → events stored
 *          once (unique event_key), 200 returned immediately, processing
 *          continues asynchronously so Meta never times out and retries.
 *
 * In `off` mode both routes answer 404 and touch nothing.
 * The raw-body parser is scoped to this plugin only.
 */
export async function whatsappWebhookPlugin(fastify: FastifyInstance): Promise<void> {
  fastify.addContentTypeParser("application/json", { parseAs: "buffer", bodyLimit: 1_048_576 }, (_req, body, done) => {
    done(null, body);
  });

  fastify.get("/", async (request: FastifyRequest<{ Querystring: Record<string, string | undefined> }>, reply) => {
    if (effectiveWhatsAppConfirmMode() === "off") return reply.status(404).send();
    const q = request.query;
    const config = readWhatsAppConfirmConfig();
    if (q["hub.mode"] === "subscribe" && verifyTokenMatches(q["hub.verify_token"], config.webhookVerifyToken)) {
      return reply.status(200).type("text/plain").send(q["hub.challenge"] ?? "");
    }
    return reply.status(403).send();
  });

  fastify.post("/", async (request, reply) => {
    const mode = effectiveWhatsAppConfirmMode();
    if (mode === "off") return reply.status(404).send();
    const config = readWhatsAppConfirmConfig();
    const raw = request.body as Buffer;
    const signature = request.headers["x-hub-signature-256"];
    if (!Buffer.isBuffer(raw) || !config.appSecret || !verifyMetaSignature(raw, typeof signature === "string" ? signature : null, config.appSecret)) {
      return reply.status(401).send();
    }
    let body: unknown;
    try {
      body = JSON.parse(raw.toString("utf8"));
    } catch {
      return reply.status(400).send();
    }
    const fallbackKey = createHash("sha256").update(raw).digest("hex").slice(0, 32);
    const database = createDb();
    const fresh = await recordInboundEvents(database, parseWebhookBody(body, fallbackKey));
    reply.status(200).send();
    setImmediate(() => {
      void (async () => {
        for (const ev of fresh) {
          try {
            await processInboundEvent(database, ev, { mode, config });
          } catch (err) {
            console.error(`[WhatsApp webhook] event ${ev.kind} failed: ${String((err as Error)?.message ?? err).slice(0, 200)}`);
          }
        }
      })();
    });
    return reply;
  });
}
