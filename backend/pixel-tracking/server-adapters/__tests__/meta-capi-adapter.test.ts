import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildUserData,
  buildCustomData,
  buildMetaEvent,
  mapEventName,
  sendToMetaCAPI,
} from "#root/backend/pixel-tracking/server-adapters/meta-capi-adapter";
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
  platform: PixelPlatform.META,
  pixelId: "123456789",
  accessToken: "EAAxxxxxxxx",
  enabled: true,
  enableClientSide: true,
  enableServerSide: true,
  consentRequired: false,
  createdAt: new Date(),
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe("Meta CAPI Adapter — server-adapters/meta-capi-adapter.ts", () => {
  describe("mapEventName", () => {
    it("maps standard event names to Meta names", () => {
      expect(mapEventName(TrackingEventName.CHECKOUT_COMPLETED)).toBe(
        "Purchase",
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
      expect(userData.client_ip_address).toBe("1.2.3.4");
      expect(userData.client_user_agent).toBe("Mozilla/5.0 TestBot");
    });

    it("includes Meta cookies when present", () => {
      const event = makeEvent({
        serverContext: makeServerContext({
          fbp: "fb.1.123.456",
          fbc: "fb.1.123.AbCdEf",
        }),
      });
      const userData = buildUserData(event);
      expect(userData.fbp).toBe("fb.1.123.456");
      expect(userData.fbc).toBe("fb.1.123.AbCdEf");
    });

    it("omits undefined fields", () => {
      const event = makeEvent({
        serverContext: makeServerContext({ fbp: undefined, fbc: undefined }),
      });
      const userData = buildUserData(event);
      expect(userData).not.toHaveProperty("fbp");
      expect(userData).not.toHaveProperty("fbc");
    });
  });

  describe("buildCustomData", () => {
    it("maps ecommerce data to Meta format", () => {
      const event = makeEvent({
        ecommerce: {
          currency: "USD",
          value: 99.99,
          items: [
            { itemId: "SKU-001", itemName: "Widget", price: 99.99, quantity: 2 },
          ],
          transactionId: "T-001",
        },
      });
      const customData = buildCustomData(event)!;
      expect(customData.value).toBe(99.99);
      expect(customData.currency).toBe("USD");
      expect(customData.content_ids).toEqual(["SKU-001"]);
      expect(customData.contents).toEqual([{ id: "SKU-001", quantity: 2 }]);
      expect(customData.content_type).toBe("product");
      expect(customData.num_items).toBe(2);
      expect(customData.order_id).toBe("T-001");
    });

    it("returns undefined when no ecommerce data", () => {
      const event = makeEvent({ ecommerce: undefined });
      expect(buildCustomData(event)).toBeUndefined();
    });

    it("maps search_string from searchQuery", () => {
      const event = makeEvent({
        ecommerce: { searchQuery: "blue widget" },
      });
      const customData = buildCustomData(event)!;
      expect(customData.search_string).toBe("blue widget");
    });
  });

  describe("buildMetaEvent", () => {
    it("builds a complete Meta CAPI event payload", () => {
      const event = makeEvent({
        ecommerce: { currency: "USD", value: 42 },
      });
      const metaEvent = buildMetaEvent(event);

      expect(metaEvent.event_name).toBe("Purchase");
      expect(metaEvent.event_time).toBe(1700000000); // seconds
      expect(metaEvent.event_id).toBe("evt-001");
      expect(metaEvent.event_source_url).toBe("https://shop.test/checkout");
      expect(metaEvent.action_source).toBe("website");
      expect(metaEvent.user_data).toBeDefined();
      expect(metaEvent.custom_data).toBeDefined();
    });

    it("shares event_id with client pixel for deduplication", () => {
      const event = makeEvent({ eventId: "dedup-123" });
      const metaEvent = buildMetaEvent(event);
      expect(metaEvent.event_id).toBe("dedup-123");
    });
  });

  describe("sendToMetaCAPI", () => {
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
      const result = await sendToMetaCAPI([makeEvent()], config);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Missing access token");
    });

    it("returns success on 200 response", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{"events_received": 1}'),
      });

      const result = await sendToMetaCAPI([makeEvent()], makeConfig());
      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    it("sends correct URL with pixel ID", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve("{}"),
      });

      await sendToMetaCAPI([makeEvent()], makeConfig({ pixelId: "PIXEL123" }));

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("PIXEL123/events"),
        expect.any(Object),
      );
    });

    it("does not retry on 400 (client error)", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('{"error": "bad request"}'),
      });

      const result = await sendToMetaCAPI([makeEvent()], makeConfig());
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

      const result = await sendToMetaCAPI([makeEvent()], makeConfig());
      expect(result.success).toBe(false);
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });
  });
});
