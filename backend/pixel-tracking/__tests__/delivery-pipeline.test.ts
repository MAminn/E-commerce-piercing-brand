import { describe, it, expect, vi } from "vitest";
import {
  processTrackingBeacon,
  SERVER_ADAPTERS,
} from "#root/backend/pixel-tracking/delivery-pipeline";
import { enrichEvents } from "#root/backend/pixel-tracking/event-logger";
import {
  TrackingEventName,
  PixelPlatform,
  type TrackingEvent,
} from "#root/shared/types/pixel-tracking";
import type { ServerContext } from "#root/server/routes/track";

// ─── Helpers ──────────────────────────────────────────────────────────────

const makeEvent = (overrides?: Partial<TrackingEvent>): TrackingEvent => ({
  eventId: "evt-pipeline-001",
  eventName: TrackingEventName.CHECKOUT_COMPLETED,
  timestamp: Date.now(),
  pageUrl: "https://shop.test/checkout",
  sessionId: "sess-pipe",
  ...overrides,
});

const makeServerContext = (
  overrides?: Partial<ServerContext>,
): ServerContext => ({
  ip: "10.0.0.1",
  ipHash: "hash123",
  userAgent: "PipelineBot/1.0",
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe("Delivery Pipeline — backend/pixel-tracking/delivery-pipeline.ts", () => {
  describe("SERVER_ADAPTERS registry", () => {
    it("contains Meta CAPI adapter", () => {
      expect(SERVER_ADAPTERS.meta).toBeDefined();
      expect(SERVER_ADAPTERS.meta!.platform).toBe(PixelPlatform.META);
    });

    it("contains Google MP adapter", () => {
      expect(SERVER_ADAPTERS.google_ga4).toBeDefined();
      expect(SERVER_ADAPTERS.google_ga4!.platform).toBe(
        PixelPlatform.GOOGLE_GA4,
      );
    });

    it("does not have adapters for platforms not yet implemented", () => {
      expect(SERVER_ADAPTERS.custom).toBeUndefined();
    });

    it("contains TikTok Events adapter", () => {
      expect(SERVER_ADAPTERS.tiktok).toBeDefined();
      expect(SERVER_ADAPTERS.tiktok!.platform).toBe(PixelPlatform.TIKTOK);
    });

    it("contains Snapchat CAPI adapter", () => {
      expect(SERVER_ADAPTERS.snapchat).toBeDefined();
      expect(SERVER_ADAPTERS.snapchat!.platform).toBe(PixelPlatform.SNAPCHAT);
    });

    it("contains Pinterest CAPI adapter", () => {
      expect(SERVER_ADAPTERS.pinterest).toBeDefined();
      expect(SERVER_ADAPTERS.pinterest!.platform).toBe(PixelPlatform.PINTEREST);
    });
  });

  describe("processTrackingBeacon", () => {
    it("returns immediately for empty events array", async () => {
      // Should not throw or call any DB
      await expect(
        processTrackingBeacon([], makeServerContext(), {} as never),
      ).resolves.toBeUndefined();
    });

    it("enriches events with server context before processing", () => {
      const events = [
        makeEvent({ eventId: "a" }),
        makeEvent({ eventId: "b" }),
      ];
      const ctx = makeServerContext({ fbp: "fb.1.123", gclid: "CLK-1" });
      const enriched = enrichEvents(events, ctx);

      expect(enriched).toHaveLength(2);
      expect(enriched[0]!.serverContext.fbp).toBe("fb.1.123");
      expect(enriched[0]!.serverContext.gclid).toBe("CLK-1");
      expect(enriched[1]!.serverContext.ip).toBe("10.0.0.1");
    });
  });

  describe("Integration: enrichEvents → pipeline flow", () => {
    it("enriched events contain all fields needed for server adapters", () => {
      const event = makeEvent({
        ecommerce: {
          currency: "USD",
          value: 123.45,
          items: [
            { itemId: "SKU-1", itemName: "Widget", price: 123.45, quantity: 1 },
          ],
          transactionId: "TX-1",
        },
      });
      const ctx = makeServerContext({
        fbp: "fb.1.111.222",
        fbc: "fb.1.333.AbCd",
        gclid: "CjwK",
      });
      const [enriched] = enrichEvents([event], ctx);

      // All server context fields present
      expect(enriched!.serverContext.ip).toBe("10.0.0.1");
      expect(enriched!.serverContext.userAgent).toBe("PipelineBot/1.0");
      expect(enriched!.serverContext.fbp).toBe("fb.1.111.222");
      expect(enriched!.serverContext.fbc).toBe("fb.1.333.AbCd");
      expect(enriched!.serverContext.gclid).toBe("CjwK");

      // Original event data intact
      expect(enriched!.eventId).toBe("evt-pipeline-001");
      expect(enriched!.ecommerce?.transactionId).toBe("TX-1");
      expect(enriched!.ecommerce?.items?.[0]?.itemId).toBe("SKU-1");
    });
  });
});
