import { query } from "#root/shared/database/drizzle/db";
import {
  trackingEvent,
  trackingEventDelivery,
} from "#root/shared/database/drizzle/schema";
import { desc, eq, and, sql, count, gte, countDistinct, isNull } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";

// ─── Input schemas ──────────────────────────────────────────────────────────

export const listEventsSchema = z.object({
  limit: z.number().min(1).max(100).optional().default(50),
  offset: z.number().min(0).optional().default(0),
  platform: z.string().optional(),
  eventName: z.string().optional(),
  status: z.enum(["all", "sent", "failed"]).optional().default("all"),
});

// ─── Service functions ──────────────────────────────────────────────────────

/**
 * List tracking events with their delivery statuses, paginated.
 */
export const listTrackingEvents = (input: z.infer<typeof listEventsSchema>) =>
  Effect.gen(function* () {
    return yield* query(async (db) => {
      // Base query: join events with deliveries
      const rows = await db
        .select({
          id: trackingEvent.id,
          sessionId: trackingEvent.sessionId,
          eventName: trackingEvent.eventName,
          eventId: trackingEvent.eventId,
          pageUrl: trackingEvent.pageUrl,
          deviceType: trackingEvent.deviceType,
          createdAt: trackingEvent.createdAt,
          // Delivery fields
          deliveryId: trackingEventDelivery.id,
          platform: trackingEventDelivery.platform,
          sent: trackingEventDelivery.sent,
          sentAt: trackingEventDelivery.sentAt,
          error: trackingEventDelivery.error,
        })
        .from(trackingEvent)
        .leftJoin(
          trackingEventDelivery,
          eq(trackingEvent.id, trackingEventDelivery.trackingEventId),
        )
        .where(isNull(trackingEvent.archivedAt))
        .orderBy(desc(trackingEvent.createdAt))
        .limit(input.limit)
        .offset(input.offset)
        .execute();

      // Total count for pagination
      const [countResult] = await db
        .select({ total: count() })
        .from(trackingEvent)
        .where(isNull(trackingEvent.archivedAt))
        .execute();

      return {
        events: rows,
        total: countResult?.total ?? 0,
      };
    });
  });

/**
 * Get delivery stats: total events, success/fail counts over different periods.
 */
export const getDeliveryStats = () =>
  Effect.gen(function* () {
    return yield* query(async (db) => {
      const now = new Date();
      const day = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const week = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const month = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Total events per period
      const [events24h] = await db
        .select({ total: count() })
        .from(trackingEvent)
        .where(and(gte(trackingEvent.createdAt, day), isNull(trackingEvent.archivedAt)))
        .execute();

      const [events7d] = await db
        .select({ total: count() })
        .from(trackingEvent)
        .where(and(gte(trackingEvent.createdAt, week), isNull(trackingEvent.archivedAt)))
        .execute();

      const [events30d] = await db
        .select({ total: count() })
        .from(trackingEvent)
        .where(and(gte(trackingEvent.createdAt, month), isNull(trackingEvent.archivedAt)))
        .execute();

      // Unique sessions per period
      const [sessions24h] = await db
        .select({ total: countDistinct(trackingEvent.sessionId) })
        .from(trackingEvent)
        .where(and(gte(trackingEvent.createdAt, day), isNull(trackingEvent.archivedAt)))
        .execute();

      const [sessions7d] = await db
        .select({ total: countDistinct(trackingEvent.sessionId) })
        .from(trackingEvent)
        .where(and(gte(trackingEvent.createdAt, week), isNull(trackingEvent.archivedAt)))
        .execute();

      const [sessions30d] = await db
        .select({ total: countDistinct(trackingEvent.sessionId) })
        .from(trackingEvent)
        .where(and(gte(trackingEvent.createdAt, month), isNull(trackingEvent.archivedAt)))
        .execute();

      // Event counts by event name (last 30 days)
      const eventTypeCounts = await db
        .select({
          eventName: trackingEvent.eventName,
          total: count(),
          uniqueSessions: countDistinct(trackingEvent.sessionId),
        })
        .from(trackingEvent)
        .where(and(gte(trackingEvent.createdAt, month), isNull(trackingEvent.archivedAt)))
        .groupBy(trackingEvent.eventName)
        .orderBy(desc(count()))
        .execute();

      // Deliveries success/fail per platform
      const platformStats = await db
        .select({
          platform: trackingEventDelivery.platform,
          sent: trackingEventDelivery.sent,
          total: count(),
        })
        .from(trackingEventDelivery)
        .where(gte(trackingEventDelivery.createdAt, week))
        .groupBy(trackingEventDelivery.platform, trackingEventDelivery.sent)
        .execute();

      return {
        events24h: events24h?.total ?? 0,
        events7d: events7d?.total ?? 0,
        events30d: events30d?.total ?? 0,
        sessions24h: sessions24h?.total ?? 0,
        sessions7d: sessions7d?.total ?? 0,
        sessions30d: sessions30d?.total ?? 0,
        eventTypeCounts,
        platformStats,
      };
    });
  });

/**
 * Archive all non-archived tracking events (sets archivedAt = now).
 * Nothing is deleted — records remain in the DB for audit purposes.
 */
export const archiveEventLog = () =>
  Effect.gen(function* () {
    return yield* query(async (db) => {
      await db
        .update(trackingEvent)
        .set({ archivedAt: new Date() })
        .where(isNull(trackingEvent.archivedAt))
        .execute();

      return { archived: true };
    });
  });
