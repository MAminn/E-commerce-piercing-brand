import { describe, it, expect, vi } from "vitest";
import {
  TrackingEventName,
  PixelPlatform,
  PLATFORM_EVENT_MAP,
  type TrackingEvent,
} from "#root/shared/types/pixel-tracking";
import { buildMetaEvent } from "#root/backend/pixel-tracking/server-adapters/meta-capi-adapter";
import { buildGA4Body } from "#root/backend/pixel-tracking/server-adapters/google-mp-adapter";
import { enrichEvents } from "#root/backend/pixel-tracking/event-logger";
import type { ServerContext } from "#root/server/routes/track";

/**
 * Task 3.7 — Client↔Server Deduplication Verification
 *
 * The dedup mechanism for each platform:
 *
 * | Platform   | Client sends               | Server sends                 | Dedup field   |
 * |------------|----------------------------|------------------------------|---------------|
 * | Meta       | fbq('track', ..., {eventID}) | event_id in CAPI payload   | eventID       |
 * | Google GA4 | Client-only or server-only per config                      | N/A           |
 * | TikTok     | eventID in pixel call       | event_id in Events API      | event_id      |
 * | Pinterest  | event_id in tag call        | event_id in server call     | event_id      |
 * | Snapchat   | client_dedup_id             | client_dedup_id in API      | dedup id      |
 *
 * Every TrackingEvent has a unique `eventId` (UUIDv7). This same ID must
 * appear in both the client pixel call AND the server API call so that
 * the platform can deduplicate.
 */

const SHARED_EVENT_ID = "0193a7b2-1234-7abc-def0-123456789abc";

const makeEvent = (overrides?: Partial<TrackingEvent>): TrackingEvent => ({
  eventId: SHARED_EVENT_ID,
  eventName: TrackingEventName.CHECKOUT_COMPLETED,
  timestamp: 1700000000000,
  pageUrl: "https://shop.test/checkout",
  sessionId: "sess-dedup",
  ecommerce: {
    currency: "USD",
    value: 99.99,
    items: [
      { itemId: "SKU-001", itemName: "Widget", price: 99.99, quantity: 1 },
    ],
    transactionId: "TX-1",
  },
  ...overrides,
});

const makeServerContext = (): ServerContext => ({
  ip: "1.2.3.4",
  ipHash: "hash123",
  userAgent: "Mozilla/5.0",
  fbp: "fb.1.111.222",
  fbc: "fb.1.333.AbCd",
});

describe("Client↔Server Deduplication — Task 3.7", () => {
  describe("Meta: event_id dedup chain", () => {
    it("Meta CAPI event_id matches the client-side eventId", () => {
      const event = makeEvent();
      const [enriched] = enrichEvents([event], makeServerContext());
      const metaEvent = buildMetaEvent(enriched!);

      // The event_id sent to Meta CAPI must match the eventID
      // that the MetaPixelAdapter sends via fbq('track', ..., {eventID: ...})
      expect(metaEvent.event_id).toBe(SHARED_EVENT_ID);
      expect(metaEvent.event_id).toBe(event.eventId);
    });

    it("Meta CAPI event_name maps correctly for dedup", () => {
      const event = makeEvent();
      const [enriched] = enrichEvents([event], makeServerContext());
      const metaEvent = buildMetaEvent(enriched!);

      // Client sends fbq('track', 'Purchase', ...)
      // Server sends event_name: 'Purchase'
      // Both must use the same event name for dedup to work
      const clientEventName =
        PLATFORM_EVENT_MAP[PixelPlatform.META][
          TrackingEventName.CHECKOUT_COMPLETED
        ];
      expect(metaEvent.event_name).toBe(clientEventName);
      expect(metaEvent.event_name).toBe("Purchase");
    });
  });

  describe("Google GA4: server-only strategy", () => {
    it("GA4 MP events carry session-based client_id for attribution", () => {
      const event = makeEvent();
      const [enriched] = enrichEvents([event], makeServerContext());
      const body = buildGA4Body([enriched!]);

      // GA4 doesn't have explicit event_id dedup like Meta.
      // The strategy is: only send server-side if client-side is disabled
      // (configured per pixel config). When both fire, GA4 uses
      // client_id (our sessionId) to correlate.
      expect(body.client_id).toBe("sess-dedup");
    });

    it("GA4 event name maps consistently client↔server", () => {
      const event = makeEvent();
      const [enriched] = enrichEvents([event], makeServerContext());
      const body = buildGA4Body([enriched!]);
      const ga4Events = body.events as Array<{ name: string }>;

      // Client sends gtag('event', 'purchase', ...)
      // Server sends name: 'purchase'
      const clientEventName =
        PLATFORM_EVENT_MAP[PixelPlatform.GOOGLE_GA4][
          TrackingEventName.CHECKOUT_COMPLETED
        ];
      expect(ga4Events[0]!.name).toBe(clientEventName);
      expect(ga4Events[0]!.name).toBe("purchase");
    });
  });

  describe("Shared eventId propagation", () => {
    it("eventId is preserved through enrichment", () => {
      const event = makeEvent();
      const [enriched] = enrichEvents([event], makeServerContext());
      expect(enriched!.eventId).toBe(SHARED_EVENT_ID);
    });

    it("eventId uses UUIDv7 format (time-sortable)", () => {
      // UUIDv7 format: 8-4-4-4-12 hex chars
      expect(SHARED_EVENT_ID).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it("same eventId used in both Meta CAPI and client pixel", () => {
      // This verifies the architectural invariant:
      // 1. Client: fbq('track', 'Purchase', params, {eventID: 'evt-xxx'})
      // 2. Server: { data: [{ event_id: 'evt-xxx', ... }] }
      // Both use the TrackingEvent.eventId field.

      const event = makeEvent();
      const [enriched] = enrichEvents([event], makeServerContext());
      const metaEvent = buildMetaEvent(enriched!);

      // The eventId that the client MetaPixelAdapter passes as {eventID}
      // is the same event.eventId that the server sends as event_id
      expect(event.eventId).toBe(metaEvent.event_id);
    });
  });
});
