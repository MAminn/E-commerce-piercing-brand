import type { PixelConfig, PixelPlatform } from "#root/shared/types/pixel-tracking";
import type { EnrichedTrackingEvent } from "#root/backend/pixel-tracking/event-logger";

/**
 * Result of a server-side adapter delivery attempt.
 */
export interface AdapterDeliveryResult {
  platform: PixelPlatform;
  success: boolean;
  statusCode?: number;
  responseBody?: string;
  error?: string;
}

/**
 * Server-side pixel adapter interface.
 *
 * Each platform (Meta CAPI, Google MP, TikTok Events API, etc.)
 * implements this to send enriched events from the server.
 */
export interface ServerPixelAdapter {
  platform: PixelPlatform;

  /**
   * Send a batch of enriched tracking events to the platform's server API.
   * Returns a delivery result per-call (not per-event).
   */
  sendEvents(
    events: EnrichedTrackingEvent[],
    config: PixelConfig,
  ): Promise<AdapterDeliveryResult>;
}
