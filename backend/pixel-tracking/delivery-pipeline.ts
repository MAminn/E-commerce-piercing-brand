import type { ServerContext } from "#root/server/routes/track";
import type {
  TrackingEvent,
  PixelConfig,
  PixelPlatform,
} from "#root/shared/types/pixel-tracking";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import {
  enrichEvents,
  type EnrichedTrackingEvent,
} from "#root/backend/pixel-tracking/event-logger";
import {
  pixelConfig,
  trackingEvent,
  trackingEventDelivery,
} from "#root/shared/database/drizzle/schema";
import { eq, and } from "drizzle-orm";
import { v7 } from "uuid";

// Server-side adapters
import { metaCapiAdapter } from "#root/backend/pixel-tracking/server-adapters/meta-capi-adapter";
import { googleMPAdapter } from "#root/backend/pixel-tracking/server-adapters/google-mp-adapter";
import { tiktokEventsAdapter } from "#root/backend/pixel-tracking/server-adapters/tiktok-events-adapter";
import { snapchatCapiAdapter } from "#root/backend/pixel-tracking/server-adapters/snapchat-capi-adapter";
import { pinterestCapiAdapter } from "#root/backend/pixel-tracking/server-adapters/pinterest-capi-adapter";
import type {
  ServerPixelAdapter,
  AdapterDeliveryResult,
} from "#root/backend/pixel-tracking/server-adapters/types";

/**
 * Map of platform → server-side adapter.
 */
const SERVER_ADAPTERS: Partial<Record<string, ServerPixelAdapter>> = {
  meta: metaCapiAdapter,
  google_ga4: googleMPAdapter,
  tiktok: tiktokEventsAdapter,
  snapchat: snapchatCapiAdapter,
  pinterest: pinterestCapiAdapter,
};

/**
 * Persist enriched events to the tracking_event table using a direct DB call.
 * Returns the inserted row IDs so we can link delivery records.
 */
async function persistEvents(
  events: EnrichedTrackingEvent[],
  db: DatabaseClient,
): Promise<{ id: string; eventId: string }[]> {
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

  const result = await db
    .insert(trackingEvent)
    .values(rows)
    .onConflictDoNothing({ target: trackingEvent.eventId })
    .returning({ id: trackingEvent.id, eventId: trackingEvent.eventId });

  return result;
}

/**
 * Fetch all pixel configs that have server-side enabled.
 */
async function getEnabledServerConfigs(
  db: DatabaseClient,
): Promise<PixelConfig[]> {
  const configs = await db
    .select()
    .from(pixelConfig)
    .where(
      and(
        eq(pixelConfig.enabled, true),
        eq(pixelConfig.enableServerSide, true),
      ),
    )
    .execute();

  return configs as unknown as PixelConfig[];
}

/**
 * Log a delivery attempt to the tracking_event_delivery table.
 */
async function logDeliveryResult(
  db: DatabaseClient,
  trackingEventDbId: string,
  result: AdapterDeliveryResult,
): Promise<void> {
  await db.insert(trackingEventDelivery).values({
    id: v7(),
    trackingEventId: trackingEventDbId,
    platform:
      result.platform as (typeof pixelConfig.platform.enumValues)[number],
    sent: result.success,
    sentAt: result.success ? new Date() : null,
    platformEventId: null,
    error: result.error ?? null,
  });
}

/**
 * Send enriched events to a single server adapter and log delivery.
 * Never throws — failures are logged.
 */
async function sendToAdapterAndLog(
  adapter: ServerPixelAdapter,
  events: EnrichedTrackingEvent[],
  config: PixelConfig,
  insertedRows: { id: string; eventId: string }[],
  db: DatabaseClient,
): Promise<void> {
  try {
    const result = await adapter.sendEvents(events, config);

    // Log a delivery record for each event
    for (const row of insertedRows) {
      try {
        await logDeliveryResult(db, row.id, result);
      } catch (logErr) {
        console.error(
          `[Delivery Pipeline] Failed to log delivery for event ${row.id}:`,
          logErr,
        );
      }
    }
  } catch (err) {
    console.error(
      `[Delivery Pipeline] Adapter ${adapter.platform} threw:`,
      err,
    );
    // Still try to log the failure
    const errorResult: AdapterDeliveryResult = {
      platform: adapter.platform,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
    for (const row of insertedRows) {
      try {
        await logDeliveryResult(db, row.id, errorResult);
      } catch {
        // Swallow — we've already logged the adapter error
      }
    }
  }
}

/**
 * Process a batch of tracking events received via the beacon endpoint.
 *
 * Flow: enrich → persist → fan-out to server adapters (parallel) → log delivery.
 */
export async function processTrackingBeacon(
  events: TrackingEvent[],
  serverContext: ServerContext,
  db: DatabaseClient,
): Promise<void> {
  if (events.length === 0) return;

  // 1. Enrich events with server context
  const enriched = enrichEvents(events, serverContext);

  // 2. Persist to tracking_event table
  let insertedRows: { id: string; eventId: string }[];
  try {
    insertedRows = await persistEvents(enriched, db);
  } catch (err) {
    console.error("[Delivery Pipeline] Failed to persist events:", err);
    return; // Can't proceed without DB rows for delivery logging
  }

  // 3. Get enabled server-side configs
  let serverConfigs: PixelConfig[];
  try {
    serverConfigs = await getEnabledServerConfigs(db);
  } catch (err) {
    console.error("[Delivery Pipeline] Failed to fetch server configs:", err);
    return;
  }

  if (serverConfigs.length === 0) return;

  // 4. Fan-out to adapters in parallel
  const adapterPromises = serverConfigs
    .map((config) => {
      const adapter = SERVER_ADAPTERS[config.platform];
      if (!adapter) return null;
      return sendToAdapterAndLog(adapter, enriched, config, insertedRows, db);
    })
    .filter(Boolean);

  await Promise.allSettled(adapterPromises as Promise<void>[]);
}

// Re-export for testing
export {
  persistEvents,
  getEnabledServerConfigs,
  logDeliveryResult,
  sendToAdapterAndLog,
  SERVER_ADAPTERS,
};
