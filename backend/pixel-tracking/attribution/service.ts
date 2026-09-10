import { query } from "#root/shared/database/drizzle/db";
import { attributionTouchpoint } from "#root/shared/database/drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { v7 } from "uuid";
import type {
  AttributionChannel,
  AttributionModel,
  AttributionResult,
  AttributionTouchpointData,
} from "#root/shared/types/pixel-tracking";

// ─── Schemas ────────────────────────────────────────────────────────────────

const channelEnum = z.enum([
  "organic",
  "paid_meta",
  "paid_google",
  "paid_tiktok",
  "paid_snapchat",
  "paid_pinterest",
  "direct",
  "email",
  "referral",
  "social",
]);

export const createTouchpointSchema = z.object({
  sessionId: z.string().min(1),
  userId: z.string().uuid().optional(),
  channel: channelEnum,
  source: z.string().optional(),
  medium: z.string().optional(),
  campaign: z.string().optional(),
  term: z.string().optional(),
  content: z.string().optional(),
  landingPage: z.string().optional(),
  referrer: z.string().optional(),
  clickId: z.string().optional(),
  clickIdType: z.string().optional(),
});

// ─── Channel Detection ──────────────────────────────────────────────────────

/**
 * Detect attribution channel from UTM parameters and click IDs.
 */
export function detectChannel(params: {
  source?: string;
  medium?: string;
  clickId?: string;
  clickIdType?: string;
  referrer?: string;
}): AttributionChannel {
  // Click ID takes precedence
  if (params.clickIdType) {
    switch (params.clickIdType) {
      case "fbclid":
        return "paid_meta";
      case "gclid":
        return "paid_google";
      case "ttclid":
        return "paid_tiktok";
      case "ScCid":
        return "paid_snapchat";
      case "epik":
        return "paid_pinterest";
    }
  }

  const source = params.source?.toLowerCase() ?? "";
  const medium = params.medium?.toLowerCase() ?? "";

  // Paid channels by medium
  if (medium === "cpc" || medium === "ppc" || medium === "paid") {
    if (source.includes("facebook") || source.includes("meta") || source.includes("instagram"))
      return "paid_meta";
    if (source.includes("google")) return "paid_google";
    if (source.includes("tiktok")) return "paid_tiktok";
    if (source.includes("snapchat")) return "paid_snapchat";
    if (source.includes("pinterest")) return "paid_pinterest";
  }

  // Email
  if (medium === "email" || source === "email") return "email";

  // Organic search (check before social/referral since search engines have referrers)
  if (medium === "organic") return "organic";
  const searchDomains = ["google.", "bing.", "yahoo.", "duckduckgo.", "baidu."];
  if (params.referrer) {
    for (const domain of searchDomains) {
      if (params.referrer.includes(domain)) return "organic";
    }
  }

  // Social (organic)
  if (medium === "social" || medium === "organic_social") return "social";
  const socialDomains = [
    "facebook.com",
    "instagram.com",
    "twitter.com",
    "x.com",
    "linkedin.com",
    "tiktok.com",
    "pinterest.com",
    "reddit.com",
  ];
  if (params.referrer) {
    for (const domain of socialDomains) {
      if (params.referrer.includes(domain)) return "social";
    }
  }

  // Referral
  if (params.referrer) return "referral";

  // Direct
  return "direct";
}

// ─── Attribution Models ─────────────────────────────────────────────────────

/**
 * First-Touch Attribution: 100% credit to the first touchpoint.
 */
export function firstTouchAttribution(
  touchpoints: AttributionTouchpointData[],
): AttributionResult[] {
  if (touchpoints.length === 0) return [];

  const sorted = [...touchpoints].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const first = sorted[0]!;

  return [
    {
      channel: first.channel,
      credit: 1,
      touchpointId: first.id,
    },
  ];
}

/**
 * Last-Touch Attribution: 100% credit to the last touchpoint.
 */
export function lastTouchAttribution(
  touchpoints: AttributionTouchpointData[],
): AttributionResult[] {
  if (touchpoints.length === 0) return [];

  const sorted = [...touchpoints].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  const last = sorted[0]!;

  return [
    {
      channel: last.channel,
      credit: 1,
      touchpointId: last.id,
    },
  ];
}

/**
 * Linear Attribution: Equal credit split across all touchpoints.
 */
export function linearAttribution(
  touchpoints: AttributionTouchpointData[],
): AttributionResult[] {
  if (touchpoints.length === 0) return [];

  const credit = 1 / touchpoints.length;

  return touchpoints.map((tp) => ({
    channel: tp.channel,
    credit,
    touchpointId: tp.id,
  }));
}

/**
 * Calculate attribution using the specified model.
 */
export function calculateAttribution(
  touchpoints: AttributionTouchpointData[],
  model: AttributionModel,
): AttributionResult[] {
  switch (model) {
    case "first_touch":
      return firstTouchAttribution(touchpoints);
    case "last_touch":
      return lastTouchAttribution(touchpoints);
    case "linear":
      return linearAttribution(touchpoints);
    default:
      return lastTouchAttribution(touchpoints);
  }
}

// ─── Database Service Functions ─────────────────────────────────────────────

export const recordTouchpoint = (
  input: z.infer<typeof createTouchpointSchema>,
) =>
  Effect.gen(function* () {
    const result = yield* query(async (db) => {
      return await db
        .insert(attributionTouchpoint)
        .values({
          id: v7(),
          sessionId: input.sessionId,
          userId: input.userId ?? null,
          channel: input.channel,
          source: input.source ?? null,
          medium: input.medium ?? null,
          campaign: input.campaign ?? null,
          term: input.term ?? null,
          content: input.content ?? null,
          landingPage: input.landingPage ?? null,
          referrer: input.referrer ?? null,
          clickId: input.clickId ?? null,
          clickIdType: input.clickIdType ?? null,
        })
        .returning();
    });

    return result[0]!;
  });

export const getTouchpointsBySession = (sessionId: string) =>
  Effect.gen(function* () {
    return yield* query(async (db) => {
      return await db
        .select()
        .from(attributionTouchpoint)
        .where(eq(attributionTouchpoint.sessionId, sessionId))
        .orderBy(desc(attributionTouchpoint.createdAt))
        .execute();
    });
  });

export const getTouchpointsByUser = (userId: string) =>
  Effect.gen(function* () {
    return yield* query(async (db) => {
      return await db
        .select()
        .from(attributionTouchpoint)
        .where(eq(attributionTouchpoint.userId, userId))
        .orderBy(desc(attributionTouchpoint.createdAt))
        .execute();
    });
  });

/**
 * Get channel performance stats — aggregated touchpoint counts by channel.
 */
export const getChannelStats = () =>
  Effect.gen(function* () {
    return yield* query(async (db) => {
      return await db
        .select({
          channel: attributionTouchpoint.channel,
          touchpoints: sql<number>`count(*)::int`,
          uniqueSessions: sql<number>`count(distinct ${attributionTouchpoint.sessionId})::int`,
        })
        .from(attributionTouchpoint)
        .groupBy(attributionTouchpoint.channel)
        .execute();
    });
  });
