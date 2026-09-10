import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mapEventName,
  toGA4Item,
  buildGA4Params,
  buildGA4Body,
  resolveClientId,
  sendToGA4MP,
} from "#root/backend/pixel-tracking/server-adapters/google-mp-adapter";
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
  sessionId: "sess-ga4",
  serverContext: makeServerContext(),
  ...overrides,
});

const makeConfig = (
  overrides?: Partial<PixelConfig>,
): PixelConfig => ({
  id: "cfg-ga4",
  platform: PixelPlatform.GOOGLE_GA4,
  pixelId: "G-XXXXXXX",
  accessToken: "api_secret_123",
  enabled: true,
  enableClientSide: true,
  enableServerSide: true,
  consentRequired: false,
  createdAt: new Date(),
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe("Google MP Adapter — server-adapters/google-mp-adapter.ts", () => {
  describe("mapEventName", () => {
    it("maps standard events to GA4 names", () => {
      expect(mapEventName(TrackingEventName.CHECKOUT_COMPLETED)).toBe(
        "purchase",
      );
      expect(mapEventName(TrackingEventName.PRODUCT_VIEWED)).toBe("view_item");
      expect(mapEventName(TrackingEventName.PRODUCT_ADDED_TO_CART)).toBe(
        "add_to_cart",
      );
      expect(mapEventName(TrackingEventName.SEARCH_SUBMITTED)).toBe("search");
    });

    it("passes through unmapped event names", () => {
      expect(mapEventName("custom_thing")).toBe("custom_thing");
    });
  });

  describe("toGA4Item", () => {
    it("converts a product item to GA4 format", () => {
      const item = toGA4Item({
        itemId: "SKU-001",
        itemName: "Blue Widget",
        price: 29.99,
        quantity: 3,
        category: "Widgets",
        brand: "Acme",
        variant: "Blue",
      });
      expect(item.item_id).toBe("SKU-001");
      expect(item.item_name).toBe("Blue Widget");
      expect(item.price).toBe(29.99);
      expect(item.quantity).toBe(3);
      expect(item.item_category).toBe("Widgets");
      expect(item.item_brand).toBe("Acme");
      expect(item.item_variant).toBe("Blue");
    });

    it("omits undefined optional fields", () => {
      const item = toGA4Item({ itemId: "SKU-002", itemName: "Minimal" });
      expect(item.item_id).toBe("SKU-002");
      expect(item).not.toHaveProperty("price");
      expect(item).not.toHaveProperty("item_category");
    });
  });

  describe("buildGA4Params", () => {
    it("maps ecommerce data to GA4 params", () => {
      const event = makeEvent({
        ecommerce: {
          currency: "USD",
          value: 99.99,
          transactionId: "T-001",
          tax: 5,
          shipping: 10,
          coupon: "SAVE10",
          items: [
            { itemId: "SKU-001", itemName: "Widget", price: 99.99, quantity: 1 },
          ],
        },
      });
      const params = buildGA4Params(event);
      expect(params.value).toBe(99.99);
      expect(params.currency).toBe("USD");
      expect(params.transaction_id).toBe("T-001");
      expect(params.tax).toBe(5);
      expect(params.shipping).toBe(10);
      expect(params.coupon).toBe("SAVE10");
      expect(params.items).toHaveLength(1);
    });

    it("maps search_term from searchQuery", () => {
      const event = makeEvent({
        ecommerce: { searchQuery: "blue widget" },
      });
      const params = buildGA4Params(event);
      expect(params.search_term).toBe("blue widget");
    });

    it("returns empty object when no ecommerce data", () => {
      const event = makeEvent({ ecommerce: undefined });
      expect(buildGA4Params(event)).toEqual({});
    });
  });

  describe("buildGA4Body", () => {
    it("builds a complete MP request body", () => {
      const events = [makeEvent()];
      const body = buildGA4Body(events);
      expect(body.client_id).toBe("sess-ga4");
      expect(body.events).toHaveLength(1);
      const firstEvent = (body.events as Array<{ name: string }>)[0];
      expect(firstEvent!.name).toBe("purchase");
    });
  });

  describe("resolveClientId", () => {
    it("uses sessionId as client_id", () => {
      const event = makeEvent({ sessionId: "my-session-123" });
      expect(resolveClientId(event)).toBe("my-session-123");
    });
  });

  describe("sendToGA4MP", () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      vi.useRealTimers();
    });

    it("returns error when api_secret is missing", async () => {
      const config = makeConfig({ accessToken: null });
      const result = await sendToGA4MP([makeEvent()], config);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Missing api_secret");
    });

    it("returns success on 204 response", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        text: () => Promise.resolve(""),
      });

      const result = await sendToGA4MP([makeEvent()], makeConfig());
      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(204);
    });

    it("sends correct URL with measurement_id and api_secret", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        text: () => Promise.resolve(""),
      });

      await sendToGA4MP(
        [makeEvent()],
        makeConfig({ pixelId: "G-TEST123", accessToken: "secret_abc" }),
      );

      const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
        .calls[0]![0] as string;
      expect(calledUrl).toContain("measurement_id=G-TEST123");
      expect(calledUrl).toContain("api_secret=secret_abc");
    });

    it("does not retry on 400 (client error)", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve("Bad Request"),
      });

      const result = await sendToGA4MP([makeEvent()], makeConfig());
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

      const result = await sendToGA4MP([makeEvent()], makeConfig());
      expect(result.success).toBe(false);
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });
  });
});
