import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createHash } from "node:crypto";
import { processTrackingBeacon } from "#root/backend/pixel-tracking/delivery-pipeline";

/**
 * Beacon tracking endpoint schema.
 * Accepts an array of tracking events from the client.
 */
const beaconBodySchema = z.object({
  events: z.array(
    z.object({
      eventId: z.string(),
      eventName: z.string(),
      timestamp: z.number(),
      pageUrl: z.string(),
      referrer: z.string().optional(),
      sessionId: z.string(),
      userId: z.string().uuid().optional(),
      utmSource: z.string().optional(),
      utmMedium: z.string().optional(),
      utmCampaign: z.string().optional(),
      utmTerm: z.string().optional(),
      utmContent: z.string().optional(),
      ecommerce: z
        .object({
          currency: z.string().optional(),
          value: z.number().optional(),
          items: z
            .array(
              z.object({
                itemId: z.string(),
                itemName: z.string(),
                price: z.number().optional(),
                quantity: z.number().optional(),
                category: z.string().optional(),
                brand: z.string().optional(),
                variant: z.string().optional(),
              }),
            )
            .optional(),
          transactionId: z.string().optional(),
          tax: z.number().optional(),
          shipping: z.number().optional(),
          coupon: z.string().optional(),
          searchQuery: z.string().optional(),
        })
        .optional(),
      customProperties: z.record(z.unknown()).optional(),
    }),
  ),
});

export type BeaconBody = z.infer<typeof beaconBodySchema>;

/**
 * Server-side context extracted automatically from the request.
 * Attached to each event before persistence / relay.
 */
export interface ServerContext {
  ip: string;
  ipHash: string;
  userAgent: string;
  referrer?: string;
  fbp?: string;
  fbc?: string;
  gclid?: string;
  ttp?: string;
  scid?: string;
  ga?: string;
}

/** Hash an IP address so we never store raw IPs. */
function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

/** Simple in-memory rate limiter (per IP, sliding window). */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 100; // events per window
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

/**
 * Extract server-side context from a Fastify request.
 */
function extractServerContext(request: {
  ip: string;
  headers: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string | undefined>;
  query?: Record<string, string | undefined>;
}): ServerContext {
  const ip = request.ip;
  const userAgent =
    (typeof request.headers["user-agent"] === "string"
      ? request.headers["user-agent"]
      : "") || "";
  const referrer =
    (typeof request.headers.referer === "string"
      ? request.headers.referer
      : undefined) ?? undefined;

  // Meta cookies
  const fbp = request.cookies?._fbp ?? undefined;
  const fbc = request.cookies?._fbc ?? undefined;

  // Google Click ID — check cookies first, then query string
  const gclid =
    request.cookies?.gclid ??
    (request.query as Record<string, string | undefined>)?.gclid ??
    undefined;

  // TikTok first-party cookie
  const ttp = request.cookies?._ttp ?? undefined;

  // Snapchat click ID cookie
  const scid = request.cookies?._scid ?? undefined;

  // Google Analytics client ID cookie
  const ga = request.cookies?._ga ?? undefined;

  return {
    ip,
    ipHash: hashIp(ip),
    userAgent,
    referrer,
    fbp,
    fbc,
    gclid,
    ttp,
    scid,
    ga,
  };
}

export { extractServerContext, hashIp, isRateLimited, beaconBodySchema };

/**
 * POST /api/track — Beacon endpoint for server-side event relay.
 *
 * Accepts `{ events: TrackingEvent[] }`, extracts server context,
 * and hands off to the delivery pipeline. Returns 204 (fire-and-forget).
 */
export const trackBeaconPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.post("/", async (request, reply) => {
    // Rate limit
    if (isRateLimited(request.ip)) {
      return reply.status(429).send();
    }

    // Validate body
    const parsed = beaconBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send();
    }

    const { events } = parsed.data;
    if (events.length === 0) {
      return reply.status(204).send();
    }

    // Extract server context
    const serverContext = extractServerContext({
      ip: request.ip,
      headers: request.headers as Record<string, string | string[] | undefined>,
      cookies: (request as { cookies?: Record<string, string | undefined> })
        .cookies,
      query: request.query as Record<string, string | undefined>,
    });

    // Fire-and-forget: hand off to delivery pipeline.
    // The pipeline import is deferred to avoid circular deps at module load.
    // For now we persist via the existing trackEvents service.
    // This will be replaced by the full delivery pipeline in Task 3.5.
    try {
      // processTrackingBeacon is async — we intentionally do NOT await it
      // so the client gets 204 immediately.
      processTrackingBeacon(events, serverContext, request.db).catch(
        (err: unknown) => {
          request.log.error({ err }, "Delivery pipeline error");
        },
      );
    } catch (err) {
      request.log.error({ err }, "Failed to import delivery pipeline");
    }

    return reply.status(204).send();
  });
};
