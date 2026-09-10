import type { FastifyPluginAsync } from "fastify";
import { unsubscribeByToken } from "./service";

/**
 * RFC 8058 one-click unsubscribe endpoint. Gmail/Yahoo/Outlook's inbox
 * "Unsubscribe" button POSTs here directly (no page load, no JS) when a
 * message carries List-Unsubscribe-Post: List-Unsubscribe=One-Click —
 * see buildUnsubscribeHeaders in ./service.ts, which sets that header
 * pointing at this exact route. The human-facing preference page
 * (pages/unsubscribe/+Page.tsx) is a separate GET-rendered page that calls
 * the tRPC mutation instead; this route exists purely for mail clients.
 */
export const emailUnsubscribeApiPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.post("/", async (request, reply) => {
    const token =
      (request.query as { token?: string } | undefined)?.token ?? "";

    if (!token) {
      return reply.status(400).send({ success: false, error: "Missing token" });
    }

    const result = await unsubscribeByToken(token);
    if (!result.success) {
      return reply.status(404).send({ success: false, error: "Invalid or expired link" });
    }

    return reply.status(200).send({ success: true });
  });
};
