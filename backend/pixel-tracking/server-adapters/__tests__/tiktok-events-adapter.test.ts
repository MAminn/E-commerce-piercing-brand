import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildUserData,
  buildProperties,
  buildTikTokEvent,
  mapEventName,
  sendToTikTokEventsAPI,
} from "#root/backend/pixel-tracking/server-adapters/tiktok-events-adapter";
import type { EnrichedTrackingEvent } from "#root/backend/pixel-tracking/event-logger";
import {
  TrackingEventName,
  PixelPlatform,
  type PixelConfig,
} from "#root/shared/types/pixel-tracking";
import type { ServerContext } from "#root/server/routes/track";

// ─── Helpers ──────────────────────────────────────────────────────────────

const makeServerContext = (
  overrides?: Partial<ServerContext>,
): ServerContext => ({
  ip: "1.2.3.4",
  ipHash: "abc123",
  userAgent: "Mozilla/5.0 TestBot",
  ...overrides,
});

const makeEvent = (
  overrides?: Partial<EnrichedTrackingEvent>,
): EnrichedTrackingEvent => ({
  eventId: "evt-001",
  eventName: TrackingEventName.CHECKOUT_COMPLETED,
  timestamp: 1700000000000,
  pageUrl: "https://shop.test/checkout",
  sessionId: "sess-1",
  serverContext: makeServerContext(),
  ...overrides,
});

const makeConfig = (
  overrides?: Partial<PixelConfig>,
): PixelConfig => ({
  id: "cfg-1",
  platform: PixelPlatform.TIKTOK,
  pixelId: "C1234567890",
  accessToken: "tok_tiktok_xxx",
  enabled: true,
  enableClientSide: true,
  enableServerSide: true,
  consentRequired: false,
  createdAt: new Date(),
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe("TikTok Events API Adapter — server-adapters/tiktok-events-adapter.ts", () => {
  describe("mapEventName", () => {
    it("maps standard event names to TikTok names", () => {
      expect(mapEventName(TrackingEventName.CHECKOUT_COMPLETED)).toBe(
        "CompletePayment",
      );
      expect(mapEventName(TrackingEventName.PRODUCT_VIEWED)).toBe(
        "ViewContent",
      );
      expect(mapEventName(TrackingEventName.PRODUCT_ADDED_TO_CART)).toBe(
        "AddToCart",
      );
      expect(mapEventName(TrackingEventName.SEARCH_SUBMITTED)).toBe("Search");
    });

    it("passes through unmapped event names", () => {
      expect(mapEventName("my_custom_event")).toBe("my_custom_event");
    });
  });

  describe("buildUserData", () => {
    it("includes IP and user agent", () => {
      const event = makeEvent();
      const userData = buildUserData(event);
      expect(userData.ip).toBe("1.2.3.4");
      expect(userData.user_agent).toBe("Mozilla/5.0 TestBot");
    });

    it("includes TTP cookie when present", () => {
      const event = makeEvent({
        serverContext: makeServerContext({ ttp: "ttp-abc-123" }),
      });
      const userData = buildUserData(event);
      expect(userData.ttp).toBe("ttp-abc-123");
    });

    it("omits undefined fields", () => {
      const event = makeEvent({
        serverContext: makeServerContext({ ip: undefined, ttp: undefined }),
      });
      const userData = buildUserData(event);
      expect(userData).not.toHaveProperty("ip");
      expect(userData).not.toHaveProperty("ttp");
    });
  });

  describe("buildProperties", () => {
    it("maps ecommerce data to TikTok properties format", () => {
      const event = makeEvent({
        ecommerce: {
          currency: "USD",
          value: 99.99,
          items: [
            { itemId: "SKU-001", itemName: "Widget", price: 99.99, quantity: 2 },
          ],
        },
      });
      const props = buildProperties(event)!;
      expect(props.value).toBe(99.99);
      expect(props.currency).toBe("USD");
      expect(props.content_id).toBe("SKU-001");
      expect(props.content_type).toBe("product");
      expect(props.contents).toEqual([
        {
          content_id: "SKU-001",
          content_type: "product",
          content_name: "Widget",
          quantity: 2,
          price: 99.99,
        },
      ]);
    });

    it("returns undefined when no ecommerce data", () => {
      const event = makeEvent({ ecommerce: undefined });
      expect(buildProperties(event)).toBeUndefined();
    });

    it("maps search query", () => {
      const event = makeEvent({
        ecommerce: { searchQuery: "blue widget" },
      });
      const props = buildProperties(event)!;
      expect(props.query).toBe("blue widget");
    });
  });

  describe("buildTikTokEvent", () => {
    it("builds a complete TikTok Events API payload", () => {
      const event = makeEvent({
        ecommerce: { currency: "USD", value: 42 },
      });
      const tiktokEvent = buildTikTokEvent(event);

      expect(tiktokEvent.event).toBe("CompletePayment");
      expect(tiktokEvent.event_time).toBe(1700000000); // seconds
      expect(tiktokEvent.event_id).toBe("evt-001");
      expect(tiktokEvent.page).toEqual({
        url: "https://shop.test/checkout",
        referrer: undefined,
      });
      expect(tiktokEvent.user).toBeDefined();
      expect(tiktokEvent.properties).toBeDefined();
    });

    it("shares event_id with client pixel for deduplication", () => {
      const event = makeEvent({ eventId: "dedup-123" });
      const tiktokEvent = buildTikTokEvent(event);
      expect(tiktokEvent.event_id).toBe("dedup-123");
    });
  });

  describe("sendToTikTokEventsAPI", () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      vi.useRealTimers();
    });

    it("returns error when access token is missing", async () => {
      const config = makeConfig({ accessToken: null });
      const result = await sendToTikTokEventsAPI([makeEvent()], config);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Missing access token");
    });

    it("returns success on 200 response", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{"code": 0, "message": "OK"}'),
      });

      const result = await sendToTikTokEventsAPI([makeEvent()], makeConfig());
      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    it("sends correct URL and headers", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve("{}"),
      });

      await sendToTikTokEventsAPI([makeEvent()], makeConfig());

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("business-api.tiktok.com"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Access-Token": "tok_tiktok_xxx",
            "Content-Type": "application/json",
          }),
        }),
      );
    });

    it("sends event_source_id in body", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve("{}"),
      });

      await sendToTikTokEventsAPI([makeEvent()], makeConfig({ pixelId: "PIX123" }));

      const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const body = JSON.parse(call[1].body);
      expect(body.event_source).toBe("web");
      expect(body.event_source_id).toBe("PIX123");
      expect(body.data).toHaveLength(1);
    });

    it("does not retry on 400 (client error)", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('{"code": 40001, "message": "bad request"}'),
      });

      const result = await sendToTikTokEventsAPI([makeEvent()], makeConfig());
      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(400);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("retries on 500 errors up to 3 times", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Server Error"),
      });

      const result = await sendToTikTokEventsAPI([makeEvent()], makeConfig());
      expect(result.success).toBe(false);
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });

    it("retries on 429 rate limit", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve("Rate limited"),
      });

      const result = await sendToTikTokEventsAPI([makeEvent()], makeConfig());
      expect(result.success).toBe(false);
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });
  });
});
