import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SnapchatPixelAdapter,
  buildSnapchatParams,
} from "#root/frontend/pixel-adapters/snapchat-pixel-adapter";
import {
  PixelPlatform,
  TrackingEventName,
  type PixelConfig,
  type TrackingEvent,
} from "#root/shared/types/pixel-tracking";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeConfig(overrides?: Partial<PixelConfig>): PixelConfig {
  return {
    id: "cfg-1",
    platform: PixelPlatform.SNAPCHAT,
    pixelId: "snap-uuid-123",
    accessToken: null,
    enabled: true,
    enableClientSide: true,
    enableServerSide: false,
    consentRequired: false,
    consentCategory: null,
    settings: null,
    createdAt: new Date(),
    updatedAt: null,
    ...overrides,
  };
}

function makeEvent(overrides?: Partial<TrackingEvent>): TrackingEvent {
  return {
    eventId: "evt-001",
    eventName: TrackingEventName.PAGE_VIEWED,
    timestamp: Date.now(),
    pageUrl: "https://shop.com",
    sessionId: "sess-1",
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("SnapchatPixelAdapter", () => {
  let adapter: SnapchatPixelAdapter;
  let mockSnaptr: ReturnType<typeof vi.fn> & { _: unknown[]; handleRequest?: unknown };

  beforeEach(() => {
    adapter = new SnapchatPixelAdapter();

    mockSnaptr = Object.assign(vi.fn(), { _: [], handleRequest: vi.fn() });
    (globalThis as unknown as Record<string, unknown>).window = globalThis;
    (window as unknown as Record<string, unknown>).snaptr = mockSnaptr;

    if (!globalThis.document) {
      (globalThis as unknown as Record<string, unknown>).document = {
        createElement: vi.fn(() => ({ async: false, src: "" })),
        getElementsByTagName: vi.fn(() => []),
        head: { appendChild: vi.fn() },
      };
    }
  });

  afterEach(() => {
    adapter.destroy();
  });

  it("should report correct platform", () => {
    expect(adapter.platform).toBe(PixelPlatform.SNAPCHAT);
  });

  it("should initialize and call snaptr init + PAGE_VIEW", () => {
    adapter.initialize(makeConfig());

    expect(mockSnaptr).toHaveBeenCalledWith("init", "snap-uuid-123");
    expect(mockSnaptr).toHaveBeenCalledWith("track", "PAGE_VIEW");
    expect(adapter.isLoaded()).toBe(true);
    expect(adapter.isEnabled()).toBe(true);
  });

  it("should not be enabled if config.enabled is false", () => {
    adapter.initialize(makeConfig({ enabled: false }));

    expect(adapter.isLoaded()).toBe(true);
    expect(adapter.isEnabled()).toBe(false);
  });

  it("should skip PAGE_VIEWED (handled in init)", () => {
    adapter.initialize(makeConfig());
    mockSnaptr.mockClear();

    adapter.trackEvent(makeEvent({ eventName: TrackingEventName.PAGE_VIEWED }));

    expect(mockSnaptr).not.toHaveBeenCalled();
  });

  it("should track VIEW_CONTENT for product_viewed", () => {
    adapter.initialize(makeConfig());
    mockSnaptr.mockClear();

    adapter.trackEvent(
      makeEvent({
        eventName: TrackingEventName.PRODUCT_VIEWED,
        ecommerce: {
          items: [
            { itemId: "SKU-1", itemName: "Widget", price: 19.99, quantity: 1 },
          ],
        },
      }),
    );

    expect(mockSnaptr).toHaveBeenCalledWith(
      "track",
      "VIEW_CONTENT",
      expect.objectContaining({
        item_ids: ["SKU-1"],
        number_items: "1",
        client_dedup_id: "evt-001",
      }),
    );
  });

  it("should track PURCHASE for checkout_completed", () => {
    adapter.initialize(makeConfig());
    mockSnaptr.mockClear();

    adapter.trackEvent(
      makeEvent({
        eventName: TrackingEventName.CHECKOUT_COMPLETED,
        ecommerce: {
          value: 99.99,
          currency: "USD",
          transactionId: "T-001",
          items: [
            { itemId: "SKU-1", itemName: "Widget", price: 49.99, quantity: 2 },
          ],
        },
      }),
    );

    expect(mockSnaptr).toHaveBeenCalledWith(
      "track",
      "PURCHASE",
      expect.objectContaining({
        price: "99.99",
        currency: "USD",
        transaction_id: "T-001",
        item_ids: ["SKU-1"],
        number_items: "2",
        client_dedup_id: "evt-001",
      }),
    );
  });

  it("should track SEARCH with search_string", () => {
    adapter.initialize(makeConfig());
    mockSnaptr.mockClear();

    adapter.trackEvent(
      makeEvent({
        eventName: TrackingEventName.SEARCH_SUBMITTED,
        ecommerce: { searchQuery: "blue shoes" },
      }),
    );

    expect(mockSnaptr).toHaveBeenCalledWith(
      "track",
      "SEARCH",
      expect.objectContaining({
        search_string: "blue shoes",
        client_dedup_id: "evt-001",
      }),
    );
  });

  it("should use custom event name for unmapped events", () => {
    adapter.initialize(makeConfig());
    mockSnaptr.mockClear();

    adapter.trackEvent(
      makeEvent({ eventName: "my_custom_event" }),
    );

    expect(mockSnaptr).toHaveBeenCalledWith(
      "track",
      "my_custom_event",
      expect.objectContaining({ client_dedup_id: "evt-001" }),
    );
  });

  it("should not track when not loaded", () => {
    adapter.trackEvent(makeEvent());
    expect(mockSnaptr).not.toHaveBeenCalled();
  });

  it("should clean up on destroy", () => {
    adapter.initialize(makeConfig());
    adapter.destroy();

    expect(adapter.isLoaded()).toBe(false);
    expect(adapter.isEnabled()).toBe(false);
  });
});

describe("buildSnapchatParams", () => {
  it("returns params with only client_dedup_id when no ecommerce data", () => {
    const event = makeEvent();
    const params = buildSnapchatParams(event);
    expect(params.client_dedup_id).toBe("evt-001");
  });

  it("maps ecommerce items to Snapchat format", () => {
    const event = makeEvent({
      ecommerce: {
        value: 42.0,
        currency: "USD",
        transactionId: "T-100",
        items: [
          { itemId: "SKU-1", itemName: "Widget", price: 21.0, quantity: 2 },
        ],
      },
    });

    const params = buildSnapchatParams(event);
    expect(params.price).toBe("42");
    expect(params.currency).toBe("USD");
    expect(params.transaction_id).toBe("T-100");
    expect(params.item_ids).toEqual(["SKU-1"]);
    expect(params.number_items).toBe("2");
  });

  it("maps search query", () => {
    const event = makeEvent({
      ecommerce: { searchQuery: "red dress" },
    });

    const params = buildSnapchatParams(event);
    expect(params.search_string).toBe("red dress");
  });
});
