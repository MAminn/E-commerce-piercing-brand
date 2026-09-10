import { query } from "#root/shared/database/drizzle/db";
import { trackingEvent } from "#root/shared/database/drizzle/schema";
import type { TrackingEvent } from "#root/shared/types/pixel-tracking";
import type { ServerContext } from "#root/server/routes/track";
import { Effect } from "effect";
import { v7 } from "uuid";

/**
 * An enriched tracking event carries the original client event
 * plus server-side context extracted at the beacon endpoint.
 */
export interface EnrichedTrackingEvent extends TrackingEvent {
  serverContext: ServerContext;
}

/**
 * Enrich raw client events with server-side context.
 */
export function enrichEvents(
  events: TrackingEvent[],
  serverContext: ServerContext,
): EnrichedTrackingEvent[] {
  return events.map((event) => ({
    ...event,
    serverContext,
  }));
}

/**
 * Batch-insert enriched tracking events into the `tracking_event` table.
 *
 * Uses the Effect-TS `query()` helper so the caller can provide the
 * DatabaseClientService via `provideDatabase(ctx)`.
 */
export const logTrackingEvents = (events: EnrichedTrackingEvent[]) =>
  Effect.gen(function* () {
    if (events.length === 0) return [];

    const rows = events.map((event) => ({
      id: v7(),
      sessionId: event.sessionId,
      userId: event.userId ?? null,
      eventName: event.eventName,
      eventId: event.eventId,
      eventData: event as unknown as Record<string, unknown>,
      pageUrl: event.pageUrl,
      referrer: event.referrer ?? null,
      utmSource: event.utmSource ?? null,
      utmMedium: event.utmMedium ?? null,
      utmCampaign: event.utmCampaign ?? null,
      userAgent: event.serverContext.userAgent || null,
      ipHash: event.serverContext.ipHash || null,
      deviceType: null,
    }));

    const result = yield* query(async (db) => {
      return await db
        .insert(trackingEvent)
        .values(rows)
        .returning({ id: trackingEvent.id });
    });

    return result;
  });
