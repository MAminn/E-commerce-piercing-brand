import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { bearerTokenOf, configuredErpToken, erpTokenMatches } from "./auth";
import {
  getOrdersForExport,
  listOrderDigest,
  listProductsForExport,
  MAX_DIGEST_PAGE,
  MAX_ORDERS_PER_REQUEST,
} from "./export-service";

/**
 * /api/erp/v1 — the read-only export the ERP pulls from.
 *
 * Disabled (no routes registered at all, so every path 404s) unless
 * ERP_SYNC_TOKEN is set to a secret of at least 32 characters. GET only;
 * nothing here mutates the database.
 */

const digestQuery = z.object({
  after: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_DIGEST_PAGE).optional(),
});

const ordersQuery = z.object({
  ids: z
    .string()
    .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(z.string().uuid()).min(1).max(MAX_ORDERS_PER_REQUEST)),
});

export const erpSyncApiPlugin: FastifyPluginAsync = async (fastify) => {
  const token = configuredErpToken();
  if (!token) {
    fastify.log.info("[ERP Sync] ERP_SYNC_TOKEN not set (or shorter than 32 chars) — export API disabled");
    return;
  }

  fastify.addHook("onRequest", async (request, reply) => {
    if (!erpTokenMatches(bearerTokenOf(request.headers.authorization), token)) {
      request.log.warn({ module: "erp-sync", url: request.url }, "ERP export: rejected token");
      return reply.status(401).send({ success: false, error: "Unauthorized" });
    }
    reply.header("Cache-Control", "no-store");
  });

  fastify.get("/orders/digest", async (request, reply) => {
    const parsed = digestQuery.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ success: false, error: "Invalid query" });
    const page = await listOrderDigest(request.db, { afterOrderNumber: parsed.data.after, limit: parsed.data.limit });
    return { success: true, generatedAt: new Date().toISOString(), ...page };
  });

  fastify.get("/orders", async (request, reply) => {
    const parsed = ordersQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: `Pass ids=<uuid,uuid,…> (1–${MAX_ORDERS_PER_REQUEST} order ids)` });
    }
    const orders = await getOrdersForExport(request.db, parsed.data.ids);
    return { success: true, generatedAt: new Date().toISOString(), orders };
  });

  fastify.get("/products", async (request) => {
    const products = await listProductsForExport(request.db);
    return { success: true, generatedAt: new Date().toISOString(), products };
  });
};
