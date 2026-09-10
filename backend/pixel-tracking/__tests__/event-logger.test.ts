import { describe, it, expect } from "vitest";
import {
  enrichEvents,
  type EnrichedTrackingEvent,
} from "#root/backend/pixel-tracking/event-logger";
import type { TrackingEvent } from "#root/shared/types/pixel-tracking";
import { TrackingEventName } from "#root/shared/types/pixel-tracking";
import type { ServerContext } from "#root/server/routes/track";

const makeEvent = (overrides?: Partial<TrackingEvent>): TrackingEvent => ({
  eventId: "evt-001",
  eventName: TrackingEventName.PAGE_VIEWED,
  timestamp: Date.now(),
  pageUrl: "https://shop.test/",
  sessionId: "sess-1",
  ...overrides,
});

const makeServerContext = (
  overrides?: Partial<ServerContext>,
): ServerContext => ({
  ip: "10.0.0.1",
  ipHash: "abc123",
  userAgent: "TestBot/1.0",
  ...overrides,
});

describe("Event Logger — backend/pixel-tracking/event-logger.ts", () => {
  describe("enrichEvents", () => {
    it("attaches server context to each event", () => {
      const events = [makeEvent(), makeEvent({ eventId: "evt-002" })];
      const ctx = makeServerContext();
      const enriched = enrichEvents(events, ctx);

      expect(enriched).toHaveLength(2);
      expect(enriched[0]!.serverContext).toBe(ctx);
      expect(enriched[1]!.serverContext).toBe(ctx);
    });

    it("preserves all original event fields", () => {
      const event = makeEvent({
        referrer: "https://google.com",
        utmSource: "google",
        ecommerce: { currency: "USD", value: 42 },
      });
      const ctx = makeServerContext();
      const enriched = enrichEvents([event], ctx);
      const first = enriched[0]!;

      expect(first.eventId).toBe(event.eventId);
      expect(first.eventName).toBe(event.eventName);
      expect(first.referrer).toBe("https://google.com");
      expect(first.utmSource).toBe("google");
      expect(first.ecommerce?.currency).toBe("USD");
      expect(first.ecommerce?.value).toBe(42);
    });

    it("returns empty array for empty input", () => {
      expect(enrichEvents([], makeServerContext())).toEqual([]);
    });

    it("enriches Meta cookie context (fbp, fbc)", () => {
      const ctx = makeServerContext({
        fbp: "fb.1.123.456",
        fbc: "fb.1.123.AbCdEf",
      });
      const enriched = enrichEvents([makeEvent()], ctx);

      expect(enriched[0]!.serverContext.fbp).toBe("fb.1.123.456");
      expect(enriched[0]!.serverContext.fbc).toBe("fb.1.123.AbCdEf");
    });

    it("enriches Google Click ID context (gclid)", () => {
      const ctx = makeServerContext({ gclid: "CjwKCAjw" });
      const enriched = enrichEvents([makeEvent()], ctx);

      expect(enriched[0]!.serverContext.gclid).toBe("CjwKCAjw");
    });
  });

  describe("EnrichedTrackingEvent type", () => {
    it("requires serverContext field", () => {
      const enriched: EnrichedTrackingEvent = {
        ...makeEvent(),
        serverContext: makeServerContext(),
      };
      expect(enriched.serverContext).toBeDefined();
      expect(enriched.serverContext.ip).toBe("10.0.0.1");
    });
  });
});
