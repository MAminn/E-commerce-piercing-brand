import {
  PixelPlatform,
  PLATFORM_EVENT_MAP,
  TrackingEventName,
  type PixelConfig,
} from "#root/shared/types/pixel-tracking";
import type { EnrichedTrackingEvent } from "#root/backend/pixel-tracking/event-logger";
import type { ServerPixelAdapter, AdapterDeliveryResult } from "./types";

/** Google Analytics 4 Measurement Protocol collect endpoint */
const GA4_MP_URL = "https://www.google-analytics.com/mp/collect";

/** Maximum retry attempts */
const MAX_RETRIES = 3;

/** Base delay for exponential backoff (ms) */
const BASE_DELAY_MS = 500;

/**
 * Map our internal event name to GA4's event name.
 * Falls back to the raw event name.
 */
function mapEventName(eventName: string): string {
  const mapped =
    PLATFORM_EVENT_MAP[PixelPlatform.GOOGLE_GA4][
      eventName as TrackingEventName
    ];
  return mapped ?? eventName;
}

/**
 * Build a single GA4 item from our product item format.
 */
function toGA4Item(item: {
  itemId: string;
  itemName: string;
  price?: number;
  quantity?: number;
  category?: string;
  brand?: string;
  variant?: string;
}): Record<string, unknown> {
  const ga4Item: Record<string, unknown> = {
    item_id: item.itemId,
    item_name: item.itemName,
  };
  if (item.price !== undefined) ga4Item.price = item.price;
  if (item.quantity !== undefined) ga4Item.quantity = item.quantity;
  if (item.category) ga4Item.item_category = item.category;
  if (item.brand) ga4Item.item_brand = item.brand;
  if (item.variant) ga4Item.item_variant = item.variant;
  return ga4Item;
}

/**
 * Build GA4 event params from enriched tracking event.
 */
function buildGA4Params(event: EnrichedTrackingEvent): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const ecom = event.ecommerce;

  if (ecom) {
    if (ecom.value !== undefined) params.value = ecom.value;
    if (ecom.currency) params.currency = ecom.currency;
    if (ecom.transactionId) params.transaction_id = ecom.transactionId;
    if (ecom.tax !== undefined) params.tax = ecom.tax;
    if (ecom.shipping !== undefined) params.shipping = ecom.shipping;
    if (ecom.coupon) params.coupon = ecom.coupon;
    if (ecom.searchQuery) params.search_term = ecom.searchQuery;

    if (ecom.items && ecom.items.length > 0) {
      params.items = ecom.items.map(toGA4Item);
    }
  }

  return params;
}

/**
 * Resolve a client_id for GA4 Measurement Protocol.
 * Prefers the GA _ga cookie value if it were forwarded,
 * falls back to our sessionId.
 */
function resolveClientId(event: EnrichedTrackingEvent): string {
  // Prefer GA4's own client ID from the _ga cookie for accurate
  // user stitching. Cookie format: "GA1.1.XXXXXXX.YYYYYYY"
  const gaCookie = event.serverContext?.ga;
  if (gaCookie) {
    const parts = gaCookie.split(".");
    if (parts.length >= 4) {
      return parts.slice(2).join(".");
    }
  }
  // Fallback to internal session ID if _ga cookie is unavailable
  return event.sessionId;
}

/**
 * Build the full GA4 Measurement Protocol request body.
 */
function buildGA4Body(
  events: EnrichedTrackingEvent[],
): Record<string, unknown> {
  // client_id must be consistent across the session
  const clientId = events[0] ? resolveClientId(events[0]) : "unknown";

  return {
    client_id: clientId,
    events: events.map((event) => ({
      name: mapEventName(event.eventName),
      params: buildGA4Params(event),
    })),
  };
}

/** Sleep helper for retry backoff. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send events to GA4 Measurement Protocol with retry logic.
 *
 * The `api_secret` comes from `config.accessToken`.
 * The `measurement_id` comes from `config.pixelId`.
 */
async function sendToGA4MP(
  events: EnrichedTrackingEvent[],
  config: PixelConfig,
): Promise<AdapterDeliveryResult> {
  const apiSecret = config.accessToken;
  if (!apiSecret) {
    return {
      platform: PixelPlatform.GOOGLE_GA4,
      success: false,
      error: "Missing api_secret (accessToken) for GA4 Measurement Protocol",
    };
  }

  const url = `${GA4_MP_URL}?measurement_id=${encodeURIComponent(config.pixelId)}&api_secret=${encodeURIComponent(apiSecret)}`;
  const body = JSON.stringify(buildGA4Body(events));

  let lastError: string | undefined;
  let lastStatusCode: number | undefined;
  let lastResponseBody: string | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      lastStatusCode = response.status;
      lastResponseBody = await response.text();

      // GA4 MP returns 204 on success, 2xx is success
      if (response.ok) {
        return {
          platform: PixelPlatform.GOOGLE_GA4,
          success: true,
          statusCode: response.status,
          responseBody: lastResponseBody,
        };
      }

      // Non-retryable client errors (4xx except 429)
      if (
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 429
      ) {
        return {
          platform: PixelPlatform.GOOGLE_GA4,
          success: false,
          statusCode: response.status,
          responseBody: lastResponseBody,
          error: `GA4 MP returned ${response.status}`,
        };
      }

      lastError = `GA4 MP returned ${response.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    if (attempt < MAX_RETRIES) {
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }

  return {
    platform: PixelPlatform.GOOGLE_GA4,
    success: false,
    statusCode: lastStatusCode,
    responseBody: lastResponseBody,
    error: lastError ?? "Max retries exceeded",
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────

export {
  mapEventName,
  toGA4Item,
  buildGA4Params,
  buildGA4Body,
  resolveClientId,
  sendToGA4MP,
};

/**
 * Google GA4 Measurement Protocol server-side adapter.
 */
export const googleMPAdapter: ServerPixelAdapter = {
  platform: PixelPlatform.GOOGLE_GA4,

  async sendEvents(
    events: EnrichedTrackingEvent[],
    config: PixelConfig,
  ): Promise<AdapterDeliveryResult> {
    return sendToGA4MP(events, config);
  },
};
