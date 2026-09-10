import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildUserData,
  buildCustomData,
  buildPinterestEvent,
  mapEventName,
  getAdAccountId,
  sendToPinterestCAPI,
} from "#root/backend/pixel-tracking/server-adapters/pinterest-capi-adapter";
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
  platform: PixelPlatform.PINTEREST,
  pixelId: "2612345678901",
  accessToken: "tok_pin_xxx",
  enabled: true,
  enableClientSide: true,
  enableServerSide: true,
  consentRequired: false,
  settings: { adAccountId: "ad-acc-123" },
  createdAt: new Date(),
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe("Pinterest CAPI Adapter — server-adapters/pinterest-capi-adapter.ts", () => {
  describe("mapEventName", () => {
    it("maps standard event names to Pinterest names", () => {
      expect(mapEventName(TrackingEventName.CHECKOUT_COMPLETED)).toBe("checkout");
      expect(mapEventName(TrackingEventName.PRODUCT_VIEWED)).toBe("pagevisit");
      expect(mapEventName(TrackingEventName.PRODUCT_ADDED_TO_CART)).toBe("addtocart");
      expect(mapEventName(TrackingEventName.SEARCH_SUBMITTED)).toBe("search");
      expect(mapEventName(TrackingEventName.REGISTRATION_COMPLETED)).toBe("signup");
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

    it("omits undefined fields", () => {
      const event = makeEvent({
        serverContext: makeServerContext({ ip: undefined }),
      });
      const userData = buildUserData(event);
      expect(userData).not.toHaveProperty("client_ip_address");
    });
  });

  describe("buildCustomData", () => {
    it("maps ecommerce data to Pinterest custom_data format", () => {
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
      expect(data.value).toBe("99.99");
      expect(data.currency).toBe("USD");
      expect(data.order_id).toBe("T-001");
      expect(data.content_ids).toEqual(["SKU-001"]);
      expect(data.contents).toEqual([{ item_price: "99.99", quantity: 2 }]);
      expect(data.num_items).toBe(2);
    });

    it("returns undefined when no ecommerce data", () => {
      const event = makeEvent({ ecommerce: undefined });
      expect(buildCustomData(event)).toBeUndefined();
    });
  });

  describe("buildPinterestEvent", () => {
    it("builds a complete Pinterest CAPI event payload", () => {
      const event = makeEvent({
        ecommerce: { currency: "USD", value: 42 },
      });
      const pinEvent = buildPinterestEvent(event);

      expect(pinEvent.event_name).toBe("checkout");
      expect(pinEvent.event_time).toBe(1700000000); // seconds
      expect(pinEvent.event_id).toBe("evt-001");
      expect(pinEvent.event_source_url).toBe("https://shop.test/checkout");
      expect(pinEvent.action_source).toBe("web");
      expect(pinEvent.user_data).toBeDefined();
      expect(pinEvent.custom_data).toBeDefined();
    });

    it("shares event_id for deduplication", () => {
      const event = makeEvent({ eventId: "dedup-123" });
      const pinEvent = buildPinterestEvent(event);
      expect(pinEvent.event_id).toBe("dedup-123");
    });
  });

  describe("getAdAccountId", () => {
    it("returns ad_account_id from settings", () => {
      const config = makeConfig({ settings: { adAccountId: "acc-789" } });
      expect(getAdAccountId(config)).toBe("acc-789");
    });

    it("returns null when settings is null", () => {
      const config = makeConfig({ settings: null });
      expect(getAdAccountId(config)).toBeNull();
    });

    it("returns null when adAccountId is missing", () => {
      const config = makeConfig({ settings: {} });
      expect(getAdAccountId(config)).toBeNull();
    });

    it("returns null when adAccountId is empty string", () => {
      const config = makeConfig({ settings: { adAccountId: "" } });
      expect(getAdAccountId(config)).toBeNull();
    });
  });

  describe("sendToPinterestCAPI", () => {
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
      const result = await sendToPinterestCAPI([makeEvent()], config);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Missing access token");
    });

    it("returns error when ad_account_id is missing", async () => {
      const config = makeConfig({ settings: null });
      const result = await sendToPinterestCAPI([makeEvent()], config);
      expect(result.success).toBe(false);
      expect(result.error).toContain("ad_account_id");
    });

    it("returns success on 200 response", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{"num_events_received": 1}'),
      });

      const result = await sendToPinterestCAPI([makeEvent()], makeConfig());
      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    it("sends correct URL with ad_account_id", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve("{}"),
      });

      await sendToPinterestCAPI(
        [makeEvent()],
        makeConfig({ settings: { adAccountId: "ACC-X" } }),
      );

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("ACC-X/events"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer tok_pin_xxx",
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

      const result = await sendToPinterestCAPI([makeEvent()], makeConfig());
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

      const result = await sendToPinterestCAPI([makeEvent()], makeConfig());
      expect(result.success).toBe(false);
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });

    it("retries on 429 rate limit", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve("Rate limited"),
      });

      const result = await sendToPinterestCAPI([makeEvent()], makeConfig());
      expect(result.success).toBe(false);
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });
  });
});
