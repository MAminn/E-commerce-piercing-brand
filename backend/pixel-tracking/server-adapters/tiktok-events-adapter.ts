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

/** TikTok Events API v1.3 endpoint */
const TIKTOK_API_URL =
  "https://business-api.tiktok.com/open_api/v1.3/event/track/";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

/**
 * Map our internal event name to TikTok's event name.
 */
function mapEventName(eventName: string): string {
  const mapped =
    PLATFORM_EVENT_MAP[PixelPlatform.TIKTOK][eventName as TrackingEventName];
  return mapped ?? eventName;
}

/**
 * Build the TikTok `user` object from server context.
 */
function buildUserData(
  event: EnrichedTrackingEvent,
): Record<string, unknown> {
  const ctx = event.serverContext;
  const user: Record<string, unknown> = {};

  if (ctx.ip) user.ip = ctx.ip;
  if (ctx.userAgent) user.user_agent = ctx.userAgent;
  if (ctx.ttp) user.ttp = ctx.ttp;

  return user;
}

/**
 * Build the TikTok `properties` object from ecommerce data.
 */
function buildProperties(
  event: EnrichedTrackingEvent,
): Record<string, unknown> | undefined {
  const ecom = event.ecommerce;
  if (!ecom) return undefined;

  const props: Record<string, unknown> = {};

  if (ecom.value !== undefined) props.value = ecom.value;
  if (ecom.currency) props.currency = ecom.currency;

  if (ecom.items && ecom.items.length > 0) {
    props.contents = ecom.items.map((item) => ({
      content_id: item.itemId,
      content_type: "product",
      content_name: item.itemName,
      quantity: item.quantity ?? 1,
      price: item.price ?? 0,
    }));
    props.content_type = "product";

    const first = ecom.items[0];
    if (first) {
      props.content_id = first.itemId;
    }
  }

  if (ecom.searchQuery) props.query = ecom.searchQuery;

  return Object.keys(props).length > 0 ? props : undefined;
}

/**
 * Build a single TikTok Events API data object.
 */
function buildTikTokEvent(
  event: EnrichedTrackingEvent,
): Record<string, unknown> {
  const tiktokEvent: Record<string, unknown> = {
    event: mapEventName(event.eventName),
    event_time: Math.floor(event.timestamp / 1000),
    event_id: event.eventId,
    user: buildUserData(event),
    page: {
      url: event.pageUrl,
      referrer: event.referrer ?? undefined,
    },
  };

  const properties = buildProperties(event);
  if (properties) tiktokEvent.properties = properties;

  return tiktokEvent;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send events to TikTok's Events API with retry logic.
 */
async function sendToTikTokEventsAPI(
  events: EnrichedTrackingEvent[],
  config: PixelConfig,
): Promise<AdapterDeliveryResult> {
  const accessToken = config.accessToken;
  if (!accessToken) {
    return {
      platform: PixelPlatform.TIKTOK,
      success: false,
      error: "Missing access token for TikTok Events API",
    };
  }

  const body = JSON.stringify({
    event_source: "web",
    event_source_id: config.pixelId,
    data: events.map(buildTikTokEvent),
  });

  let lastError: string | undefined;
  let lastStatusCode: number | undefined;
  let lastResponseBody: string | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(TIKTOK_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Access-Token": accessToken,
        },
        body,
      });

      lastStatusCode = response.status;
      lastResponseBody = await response.text();

      if (response.ok) {
        return {
          platform: PixelPlatform.TIKTOK,
          success: true,
          statusCode: response.status,
          responseBody: lastResponseBody,
        };
      }

      if (
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 429
      ) {
        return {
          platform: PixelPlatform.TIKTOK,
          success: false,
          statusCode: response.status,
          responseBody: lastResponseBody,
          error: `TikTok Events API returned ${response.status}`,
        };
      }

      lastError = `TikTok Events API returned ${response.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    if (attempt < MAX_RETRIES) {
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }

  return {
    platform: PixelPlatform.TIKTOK,
    success: false,
    statusCode: lastStatusCode,
    responseBody: lastResponseBody,
    error: lastError ?? "Max retries exceeded",
  };
}

export {
  mapEventName,
  buildUserData,
  buildProperties,
  buildTikTokEvent,
  sendToTikTokEventsAPI,
};

export const tiktokEventsAdapter: ServerPixelAdapter = {
  platform: PixelPlatform.TIKTOK,

  async sendEvents(
    events: EnrichedTrackingEvent[],
    config: PixelConfig,
  ): Promise<AdapterDeliveryResult> {
    return sendToTikTokEventsAPI(events, config);
  },
};
