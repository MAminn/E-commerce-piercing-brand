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
import { shouldServerSendToGa4 } from "#root/backend/pixel-tracking/ga4-ownership";
import { TrackingEventName } from "#root/shared/types/pixel-tracking";
import { readClientTrackingFlags } from "#root/shared/config/tracking-flags";
import type { HashedMetaUserData } from "#root/shared/tracking/meta-user-data";
import { hashMetaIdentity } from "#root/backend/pixel-tracking/meta-user-data";
import {
  loadPurchaseMatch,
  type PurchaseMatch,
} from "#root/backend/pixel-tracking/purchase-match";
import { purchaseEventId } from "#root/frontend/tracking/purchase-event";

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
 * META_ADVANCED_MATCHING: the hashed user_data each Meta relay copy carries.
 *
 * - every event: external_id = SHA-256 of the event's tracking session id
 *   (random, first-party, PII-free — the browser pixel's advanced matching
 *   hashes the same string, see shared/tracking/meta-user-data.ts)
 * - a Purchase (`checkout_completed` with event id `purchase-<order id>`)
 *   that this beacon stored first: the hashed customer fields of the placed,
 *   recent order it names — read-only lookup, enrichment only
 * - otherwise, a signed-in shopper: their hashed account em / ph / fn / ln
 *
 * Returns copies; the persisted events are not touched, so no hash is ever
 * stored. Event ids, names, values and contents are unchanged.
 */
export async function attachMetaUserData(
  events: EnrichedTrackingEvent[],
  input: {
    /** Event ids this beacon newly inserted (first claim of the id). */
    insertedEventIds: ReadonlySet<string>;
    /** Hashed account fields of the signed-in shopper, if any. */
    sessionIdentity?: HashedMetaUserData | null;
    getPurchaseMatch: (orderId: string) => Promise<PurchaseMatch | null>;
  },
): Promise<EnrichedTrackingEvent[]> {
  const out: EnrichedTrackingEvent[] = [];
  for (const event of events) {
    let fields: HashedMetaUserData = input.sessionIdentity ?? {};
    const orderId = event.ecommerce?.transactionId;
    // Only the order's own Purchase id, and only the beacon that stored it
    // first: a replayed or forged beacon naming someone's order id gets no
    // customer data attached (it is still relayed exactly as before).
    if (
      event.eventName === TrackingEventName.CHECKOUT_COMPLETED &&
      orderId &&
      event.eventId === purchaseEventId(orderId) &&
      input.insertedEventIds.has(event.eventId)
    ) {
      const match = await input.getPurchaseMatch(orderId);
      if (match) fields = match.hashedUserData;
    }
    const externalId = hashMetaIdentity({ externalId: event.sessionId }).external_id;
    const metaUserData: HashedMetaUserData = { ...fields };
    if (externalId) metaUserData.external_id = externalId;
    out.push(Object.keys(metaUserData).length > 0 ? { ...event, metaUserData } : { ...event });
  }
  return out;
}

export interface PipelineOptions {
  /** META_ADVANCED_MATCHING; read from the env when omitted. */
  metaAdvancedMatching?: boolean;
  /** Hashed account fields of the signed-in shopper (server/routes/track.ts). */
  sessionIdentity?: HashedMetaUserData | null;
  /** Injected in tests; the real lookup otherwise. */
  loadPurchaseMatch?: (db: DatabaseClient, orderId: string) => Promise<PurchaseMatch | null>;
}

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
  options: PipelineOptions = {},
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

  const metaAdvancedMatching =
    options.metaAdvancedMatching ?? readClientTrackingFlags().metaAdvancedMatching;

  /** Meta relay copies with hashed user_data; the plain events on any failure. */
  const metaEvents = async (): Promise<EnrichedTrackingEvent[]> => {
    if (!metaAdvancedMatching) return enriched;
    const lookup = options.loadPurchaseMatch ?? loadPurchaseMatch;
    try {
      return await attachMetaUserData(enriched, {
        insertedEventIds: new Set(insertedRows.map((r) => r.eventId)),
        sessionIdentity: options.sessionIdentity,
        getPurchaseMatch: (orderId) => lookup(db, orderId),
      });
    } catch {
      console.error("[Delivery Pipeline] Meta user_data enrichment failed");
      return enriched;
    }
  };

  // 4. Fan-out to adapters in parallel
  const adapterPromises = serverConfigs
    .map((config) => {
      const adapter = SERVER_ADAPTERS[config.platform];
      if (!adapter) return null;
      // G1: the browser gtag owns every GA4 event (purchase included) and GA4
      // cannot merge a browser hit with an MP copy — so the server relays
      // nothing to GA4 unless GA4_MP_MODE=legacy_all. Nothing is sent, so no
      // delivery row is logged for GA4 either. See ga4-ownership.ts.
      if (config.platform === "google_ga4" && !shouldServerSendToGa4()) return null;
      if (config.platform === "meta") {
        return metaEvents().then((events) =>
          sendToAdapterAndLog(adapter, events, config, insertedRows, db),
        );
      }
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
