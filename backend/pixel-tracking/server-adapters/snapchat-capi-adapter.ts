import {
  PixelPlatform,
  PLATFORM_EVENT_MAP,
  TrackingEventName,
  type PixelConfig,
} from "#root/shared/types/pixel-tracking";
import type { EnrichedTrackingEvent } from "#root/backend/pixel-tracking/event-logger";
import type {
  ServerPixelAdapter,
  AdapterDeliveryResult,
} from "./types";

/** Snapchat Conversions API v3 endpoint (pixel_id substituted at runtime) */
const SNAPCHAT_API_URL = "https://tr.snapchat.com/v3";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

/**
 * Map our internal event name to Snapchat's event name.
 */
function mapEventName(eventName: string): string {
  const mapped =
    PLATFORM_EVENT_MAP[PixelPlatform.SNAPCHAT][eventName as TrackingEventName];
  return mapped ?? eventName;
}

/**
 * Build the Snapchat `user` object from server context.
 */
function buildUserData(
  event: EnrichedTrackingEvent,
): Record<string, unknown> {
  const ctx = event.serverContext;
  const user: Record<string, unknown> = {};

  if (ctx.ip) user.ip_address = ctx.ip;
  if (ctx.userAgent) user.user_agent = ctx.userAgent;
  if (ctx.scid) user.sc_click_id = ctx.scid;

  // client_dedup_id for dedup between client pixel and server CAPI
  user.client_dedup_id = event.eventId;

  return user;
}

/**
 * Build the `custom_data` object from ecommerce data.
 */
function buildCustomData(
  event: EnrichedTrackingEvent,
): Record<string, unknown> | undefined {
  const ecom = event.ecommerce;
  if (!ecom) return undefined;

  const data: Record<string, unknown> = {};

  if (ecom.value !== undefined) data.price = String(ecom.value);
  if (ecom.currency) data.currency = ecom.currency;
  if (ecom.transactionId) data.transaction_id = ecom.transactionId;
  if (ecom.searchQuery) data.search_string = ecom.searchQuery;

  if (ecom.items && ecom.items.length > 0) {
    data.item_ids = ecom.items.map((item) => item.itemId);
    data.number_items = String(
      ecom.items.reduce((sum, item) => sum + (item.quantity ?? 1), 0),
    );
  }

  return Object.keys(data).length > 0 ? data : undefined;
}

/**
 * Build a single Snapchat CAPI event object.
 */
function buildSnapchatEvent(
  event: EnrichedTrackingEvent,
): Record<string, unknown> {
  const snapEvent: Record<string, unknown> = {
    event_name: mapEventName(event.eventName),
    event_time: new Date(event.timestamp).toISOString(),
    event_source_url: event.pageUrl,
    action_source: "WEB",
    user: buildUserData(event),
  };

  const customData = buildCustomData(event);
  if (customData) snapEvent.custom_data = customData;

  return snapEvent;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send events to Snapchat's Conversions API with retry logic.
 */
async function sendToSnapchatCAPI(
  events: EnrichedTrackingEvent[],
  config: PixelConfig,
): Promise<AdapterDeliveryResult> {
  const accessToken = config.accessToken;
  if (!accessToken) {
    return {
      platform: PixelPlatform.SNAPCHAT,
      success: false,
      error: "Missing access token for Snapchat Conversions API",
    };
  }

  const url = `${SNAPCHAT_API_URL}/${config.pixelId}/events`;

  const body = JSON.stringify({
    data: events.map(buildSnapchatEvent),
  });

  let lastError: string | undefined;
  let lastStatusCode: number | undefined;
  let lastResponseBody: string | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body,
      });

      lastStatusCode = response.status;
      lastResponseBody = await response.text();

      if (response.ok) {
        return {
          platform: PixelPlatform.SNAPCHAT,
          success: true,
          statusCode: response.status,
          responseBody: lastResponseBody,
        };
      }

      // Non-retryable client errors (except 429)
      if (
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 429
      ) {
        return {
          platform: PixelPlatform.SNAPCHAT,
          success: false,
          statusCode: response.status,
          responseBody: lastResponseBody,
          error: `Snapchat CAPI returned ${response.status}`,
        };
      }

      lastError = `Snapchat CAPI returned ${response.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    if (attempt < MAX_RETRIES) {
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }

  return {
    platform: PixelPlatform.SNAPCHAT,
    success: false,
    statusCode: lastStatusCode,
    responseBody: lastResponseBody,
    error: lastError ?? "Max retries exceeded",
  };
}

export {
  mapEventName,
  buildUserData,
  buildCustomData,
  buildSnapchatEvent,
  sendToSnapchatCAPI,
};

export const snapchatCapiAdapter: ServerPixelAdapter = {
  platform: PixelPlatform.SNAPCHAT,

  async sendEvents(
    events: EnrichedTrackingEvent[],
    config: PixelConfig,
  ): Promise<AdapterDeliveryResult> {
    return sendToSnapchatCAPI(events, config);
  },
};
