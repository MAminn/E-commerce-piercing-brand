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

/** Pinterest Conversions API v5 endpoint (ad_account_id substituted at runtime) */
const PINTEREST_API_BASE =
  "https://api.pinterest.com/v5/ad_accounts";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

/**
 * Map our internal event name to Pinterest's event name.
 */
function mapEventName(eventName: string): string {
  const mapped =
    PLATFORM_EVENT_MAP[PixelPlatform.PINTEREST][eventName as TrackingEventName];
  return mapped ?? eventName;
}

/**
 * Build the Pinterest `user_data` object from server context.
 */
function buildUserData(
  event: EnrichedTrackingEvent,
): Record<string, unknown> {
  const ctx = event.serverContext;
  const userData: Record<string, unknown> = {};

  if (ctx.ip) userData.client_ip_address = ctx.ip;
  if (ctx.userAgent) userData.client_user_agent = ctx.userAgent;

  return userData;
}

/**
 * Build the Pinterest `custom_data` object from ecommerce data.
 */
function buildCustomData(
  event: EnrichedTrackingEvent,
): Record<string, unknown> | undefined {
  const ecom = event.ecommerce;
  if (!ecom) return undefined;

  const data: Record<string, unknown> = {};

  if (ecom.value !== undefined) data.value = String(ecom.value);
  if (ecom.currency) data.currency = ecom.currency;
  if (ecom.transactionId) data.order_id = ecom.transactionId;

  if (ecom.items && ecom.items.length > 0) {
    data.content_ids = ecom.items.map((item) => item.itemId);
    data.contents = ecom.items.map((item) => ({
      item_price: String(item.price ?? 0),
      quantity: item.quantity ?? 1,
    }));
    data.num_items = ecom.items.reduce(
      (sum, item) => sum + (item.quantity ?? 1),
      0,
    );
  }

  return Object.keys(data).length > 0 ? data : undefined;
}

/**
 * Build a single Pinterest CAPI event object.
 */
function buildPinterestEvent(
  event: EnrichedTrackingEvent,
): Record<string, unknown> {
  const pinEvent: Record<string, unknown> = {
    event_name: mapEventName(event.eventName),
    action_source: "web",
    event_time: Math.floor(event.timestamp / 1000),
    event_id: event.eventId,
    event_source_url: event.pageUrl,
    user_data: buildUserData(event),
  };

  const customData = buildCustomData(event);
  if (customData) pinEvent.custom_data = customData;

  return pinEvent;
}

/**
 * Extract the ad_account_id from config.settings.
 */
function getAdAccountId(config: PixelConfig): string | null {
  if (config.settings && typeof config.settings === "object") {
    const id = (config.settings as Record<string, unknown>).adAccountId;
    if (typeof id === "string" && id.length > 0) return id;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send events to Pinterest's Conversions API with retry logic.
 */
async function sendToPinterestCAPI(
  events: EnrichedTrackingEvent[],
  config: PixelConfig,
): Promise<AdapterDeliveryResult> {
  const accessToken = config.accessToken;
  if (!accessToken) {
    return {
      platform: PixelPlatform.PINTEREST,
      success: false,
      error: "Missing access token for Pinterest Conversions API",
    };
  }

  const adAccountId = getAdAccountId(config);
  if (!adAccountId) {
    return {
      platform: PixelPlatform.PINTEREST,
      success: false,
      error: "Missing ad_account_id in pixel config settings",
    };
  }

  const url = `${PINTEREST_API_BASE}/${adAccountId}/events`;

  const body = JSON.stringify({
    data: events.map(buildPinterestEvent),
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
          platform: PixelPlatform.PINTEREST,
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
          platform: PixelPlatform.PINTEREST,
          success: false,
          statusCode: response.status,
          responseBody: lastResponseBody,
          error: `Pinterest CAPI returned ${response.status}`,
        };
      }

      lastError = `Pinterest CAPI returned ${response.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    if (attempt < MAX_RETRIES) {
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }

  return {
    platform: PixelPlatform.PINTEREST,
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
  buildPinterestEvent,
  getAdAccountId,
  sendToPinterestCAPI,
};

export const pinterestCapiAdapter: ServerPixelAdapter = {
  platform: PixelPlatform.PINTEREST,

  async sendEvents(
    events: EnrichedTrackingEvent[],
    config: PixelConfig,
  ): Promise<AdapterDeliveryResult> {
    return sendToPinterestCAPI(events, config);
  },
};
