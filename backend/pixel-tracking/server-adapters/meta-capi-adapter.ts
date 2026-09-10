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

/** Meta Conversions API version */
const META_API_VERSION = "v21.0";

/** Maximum retry attempts on transient failure */
const MAX_RETRIES = 3;

/** Base delay for exponential backoff (ms) */
const BASE_DELAY_MS = 500;

/**
 * Build the Meta CAPI `user_data` object from server context.
 */
function buildUserData(event: EnrichedTrackingEvent): Record<string, unknown> {
  const userData: Record<string, unknown> = {};
  const ctx = event.serverContext;

  if (ctx.ip) userData.client_ip_address = ctx.ip;
  if (ctx.userAgent) userData.client_user_agent = ctx.userAgent;
  if (ctx.fbp) userData.fbp = ctx.fbp;
  if (ctx.fbc) userData.fbc = ctx.fbc;

  return userData;
}

/**
 * Build the Meta CAPI `custom_data` object from ecommerce data.
 */
function buildCustomData(
  event: EnrichedTrackingEvent,
): Record<string, unknown> | undefined {
  const ecom = event.ecommerce;
  if (!ecom) return undefined;

  const customData: Record<string, unknown> = {};

  if (ecom.value !== undefined) customData.value = ecom.value;
  if (ecom.currency) customData.currency = ecom.currency;

  if (ecom.items && ecom.items.length > 0) {
    customData.content_ids = ecom.items.map((item) => item.itemId);
    customData.contents = ecom.items.map((item) => ({
      id: item.itemId,
      quantity: item.quantity ?? 1,
    }));
    customData.content_type = "product";
    customData.num_items = ecom.items.reduce(
      (sum, item) => sum + (item.quantity ?? 1),
      0,
    );
  }

  if (ecom.transactionId) customData.order_id = ecom.transactionId;
  if (ecom.searchQuery) customData.search_string = ecom.searchQuery;

  return Object.keys(customData).length > 0 ? customData : undefined;
}

/**
 * Map our internal event name to Meta's standard event name.
 * Falls back to the raw event name (sent as custom event).
 */
function mapEventName(eventName: string): string {
  const mapped =
    PLATFORM_EVENT_MAP[PixelPlatform.META][eventName as TrackingEventName];
  return mapped ?? eventName;
}

/**
 * Build a single Meta CAPI event data object.
 */
function buildMetaEvent(event: EnrichedTrackingEvent): Record<string, unknown> {
  const metaEvent: Record<string, unknown> = {
    event_name: mapEventName(event.eventName),
    event_time: Math.floor(event.timestamp / 1000), // Unix seconds
    event_id: event.eventId, // Shared with client pixel for dedup
    event_source_url: event.pageUrl,
    action_source: "website",
    user_data: buildUserData(event),
  };

  const customData = buildCustomData(event);
  if (customData) metaEvent.custom_data = customData;

  return metaEvent;
}

/**
 * Sleep helper for retry backoff.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send events to Meta's Conversions API with retry logic.
 */
async function sendToMetaCAPI(
  events: EnrichedTrackingEvent[],
  config: PixelConfig,
): Promise<AdapterDeliveryResult> {
  const accessToken = config.accessToken;
  if (!accessToken) {
    return {
      platform: PixelPlatform.META,
      success: false,
      error: "Missing access token for Meta CAPI",
    };
  }

  const url = `https://graph.facebook.com/${META_API_VERSION}/${config.pixelId}/events`;
  const body = JSON.stringify({
    data: events.map(buildMetaEvent),
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
          platform: PixelPlatform.META,
          success: true,
          statusCode: response.status,
          responseBody: lastResponseBody,
        };
      }

      // Non-retryable client errors (4xx except 429)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return {
          platform: PixelPlatform.META,
          success: false,
          statusCode: response.status,
          responseBody: lastResponseBody,
          error: `Meta CAPI returned ${response.status}`,
        };
      }

      // Retryable: 429 or 5xx
      lastError = `Meta CAPI returned ${response.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    // Exponential backoff before retry
    if (attempt < MAX_RETRIES) {
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }

  return {
    platform: PixelPlatform.META,
    success: false,
    statusCode: lastStatusCode,
    responseBody: lastResponseBody,
    error: lastError ?? "Max retries exceeded",
  };
}

// ─── Exported adapter ──────────────────────────────────────────────────────

export {
  buildUserData,
  buildCustomData,
  buildMetaEvent,
  mapEventName,
  sendToMetaCAPI,
};

/**
 * Meta Conversions API server-side adapter.
 */
export const metaCapiAdapter: ServerPixelAdapter = {
  platform: PixelPlatform.META,

  async sendEvents(
    events: EnrichedTrackingEvent[],
    config: PixelConfig,
  ): Promise<AdapterDeliveryResult> {
    return sendToMetaCAPI(events, config);
  },
};
