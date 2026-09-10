import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildUserData,
  buildCustomData,
  buildSnapchatEvent,
  mapEventName,
  sendToSnapchatCAPI,
} from "#root/backend/pixel-tracking/server-adapters/snapchat-capi-adapter";
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
  platform: PixelPlatform.SNAPCHAT,
  pixelId: "snap-uuid-123",
  accessToken: "tok_snap_xxx",
  enabled: true,
  enableClientSide: true,
  enableServerSide: true,
  consentRequired: false,
  createdAt: new Date(),
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe("Snapchat CAPI Adapter — server-adapters/snapchat-capi-adapter.ts", () => {
  describe("mapEventName", () => {
    it("maps standard event names to Snapchat names", () => {
      expect(mapEventName(TrackingEventName.CHECKOUT_COMPLETED)).toBe("PURCHASE");
      expect(mapEventName(TrackingEventName.PRODUCT_VIEWED)).toBe("VIEW_CONTENT");
      expect(mapEventName(TrackingEventName.PRODUCT_ADDED_TO_CART)).toBe("ADD_CART");
      expect(mapEventName(TrackingEventName.SEARCH_SUBMITTED)).toBe("SEARCH");
    });

    it("passes through unmapped event names", () => {
      expect(mapEventName("my_custom_event")).toBe("my_custom_event");
    });
  });

  describe("buildUserData", () => {
    it("includes IP and user agent", () => {
      const event = makeEvent();
      const userData = buildUserData(event);
      expect(userData.ip_address).toBe("1.2.3.4");
      expect(userData.user_agent).toBe("Mozilla/5.0 TestBot");
    });

    it("includes ScCid cookie when present", () => {
      const event = makeEvent({
        serverContext: makeServerContext({ scid: "sc-click-abc" }),
      });
      const userData = buildUserData(event);
      expect(userData.sc_click_id).toBe("sc-click-abc");
    });

    it("always includes client_dedup_id", () => {
      const event = makeEvent({ eventId: "dedup-999" });
      const userData = buildUserData(event);
      expect(userData.client_dedup_id).toBe("dedup-999");
    });

    it("omits undefined fields", () => {
      const event = makeEvent({
        serverContext: makeServerContext({ ip: undefined, scid: undefined }),
      });
      const userData = buildUserData(event);
      expect(userData).not.toHaveProperty("ip_address");
      expect(userData).not.toHaveProperty("sc_click_id");
    });
  });

  describe("buildCustomData", () => {
    it("maps ecommerce data to Snapchat custom_data format", () => {
      const event = makeEvent({
        ecommerce: {
          currency: "USD",
          value: 99.99,
          transactionId: "T-001",
          items: [
            { itemId: "SKU-001", itemName: "Widget", price: 99.99, quantity: 2 },
          ],
        },
      });
      const data = buildCustomData(event)!;
      expect(data.price).toBe("99.99");
      expect(data.currency).toBe("USD");
      expect(data.transaction_id).toBe("T-001");
      expect(data.item_ids).toEqual(["SKU-001"]);
      expect(data.number_items).toBe("2");
    });

    it("returns undefined when no ecommerce data", () => {
      const event = makeEvent({ ecommerce: undefined });
      expect(buildCustomData(event)).toBeUndefined();
    });

    it("maps search_string from searchQuery", () => {
      const event = makeEvent({
        ecommerce: { searchQuery: "blue widget" },
      });
      const data = buildCustomData(event)!;
      expect(data.search_string).toBe("blue widget");
    });
  });

  describe("buildSnapchatEvent", () => {
    it("builds a complete Snapchat CAPI event payload", () => {
      const event = makeEvent({
        ecommerce: { currency: "USD", value: 42 },
      });
      const snapEvent = buildSnapchatEvent(event);

      expect(snapEvent.event_name).toBe("PURCHASE");
      expect(snapEvent.event_time).toBe("2023-11-14T22:13:20.000Z");
      expect(snapEvent.event_source_url).toBe("https://shop.test/checkout");
      expect(snapEvent.action_source).toBe("WEB");
      expect(snapEvent.user).toBeDefined();
      expect(snapEvent.custom_data).toBeDefined();
    });

    it("includes client_dedup_id in user data", () => {
      const event = makeEvent({ eventId: "dedup-123" });
      const snapEvent = buildSnapchatEvent(event);
      const user = snapEvent.user as Record<string, unknown>;
      expect(user.client_dedup_id).toBe("dedup-123");
    });
  });

  describe("sendToSnapchatCAPI", () => {
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
      const result = await sendToSnapchatCAPI([makeEvent()], config);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Missing access token");
    });

    it("returns success on 200 response", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{"status": "OK"}'),
      });

      const result = await sendToSnapchatCAPI([makeEvent()], makeConfig());
      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    it("sends correct URL with pixel ID", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve("{}"),
      });

      await sendToSnapchatCAPI([makeEvent()], makeConfig({ pixelId: "SNAP-PIX" }));

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("SNAP-PIX/events"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer tok_snap_xxx",
          }),
        }),
      );
    });

    it("does not retry on 400 (client error)", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('{"error": "bad request"}'),
      });

      const result = await sendToSnapchatCAPI([makeEvent()], makeConfig());
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

      const result = await sendToSnapchatCAPI([makeEvent()], makeConfig());
      expect(result.success).toBe(false);
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });

    it("retries on 429 rate limit", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve("Rate limited"),
      });

      const result = await sendToSnapchatCAPI([makeEvent()], makeConfig());
      expect(result.success).toBe(false);
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });
  });
});
