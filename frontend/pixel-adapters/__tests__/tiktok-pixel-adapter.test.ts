import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  TikTokPixelAdapter,
  buildTikTokParams,
} from "#root/frontend/pixel-adapters/tiktok-pixel-adapter";
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
    platform: PixelPlatform.TIKTOK,
    pixelId: "C1234567890",
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

describe("TikTokPixelAdapter", () => {
  let adapter: TikTokPixelAdapter;
  let mockTtq: {
    load: ReturnType<typeof vi.fn>;
    page: ReturnType<typeof vi.fn>;
    track: ReturnType<typeof vi.fn>;
    identify: ReturnType<typeof vi.fn>;
    instance: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    adapter = new TikTokPixelAdapter();

    // Build a mock ttq with all expected methods
    mockTtq = {
      load: vi.fn(),
      page: vi.fn(),
      track: vi.fn(),
      identify: vi.fn(),
      instance: vi.fn(),
    };
    (globalThis as unknown as Record<string, unknown>).window = globalThis;
    (window as unknown as Record<string, unknown>).ttq = mockTtq;
    (window as unknown as Record<string, unknown>).TiktokAnalyticsObject = "ttq";

    // Provide a minimal document stub
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
    expect(adapter.platform).toBe(PixelPlatform.TIKTOK);
  });

  it("should initialize and call ttq.load + ttq.page", () => {
    adapter.initialize(makeConfig());

    expect(mockTtq.load).toHaveBeenCalledWith("C1234567890");
    expect(mockTtq.page).toHaveBeenCalled();
    expect(adapter.isLoaded()).toBe(true);
    expect(adapter.isEnabled()).toBe(true);
  });

  it("should not be enabled if config.enabled is false", () => {
    adapter.initialize(makeConfig({ enabled: false }));

    expect(adapter.isLoaded()).toBe(true);
    expect(adapter.isEnabled()).toBe(false);
  });

  it("should skip PAGE_VIEWED (handled by ttq.page in init)", () => {
    adapter.initialize(makeConfig());
    mockTtq.track.mockClear();

    adapter.trackEvent(makeEvent({ eventName: TrackingEventName.PAGE_VIEWED }));

    expect(mockTtq.track).not.toHaveBeenCalled();
  });

  it("should track ViewContent for product_viewed", () => {
    adapter.initialize(makeConfig());
    mockTtq.track.mockClear();

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

    expect(mockTtq.track).toHaveBeenCalledWith(
      "ViewContent",
      expect.objectContaining({
        content_id: "SKU-1",
        content_name: "Widget",
        content_type: "product",
      }),
      { event_id: "evt-001" },
    );
  });

  it("should track CompletePayment for checkout_completed", () => {
    adapter.initialize(makeConfig());
    mockTtq.track.mockClear();

    adapter.trackEvent(
      makeEvent({
        eventName: TrackingEventName.CHECKOUT_COMPLETED,
        ecommerce: {
          value: 99.99,
          currency: "USD",
          items: [
            { itemId: "SKU-1", itemName: "Widget", price: 49.99, quantity: 2, category: "Gadgets" },
          ],
        },
      }),
    );

    expect(mockTtq.track).toHaveBeenCalledWith(
      "CompletePayment",
      expect.objectContaining({
        value: 99.99,
        currency: "USD",
        content_type: "product",
        quantity: 2,
      }),
      { event_id: "evt-001" },
    );
  });

  it("should track Search with query param", () => {
    adapter.initialize(makeConfig());
    mockTtq.track.mockClear();

    adapter.trackEvent(
      makeEvent({
        eventName: TrackingEventName.SEARCH_SUBMITTED,
        ecommerce: { searchQuery: "blue shoes" },
      }),
    );

    expect(mockTtq.track).toHaveBeenCalledWith(
      "Search",
      { query: "blue shoes" },
      { event_id: "evt-001" },
    );
  });

  it("should use custom event name for unmapped events", () => {
    adapter.initialize(makeConfig());
    mockTtq.track.mockClear();

    adapter.trackEvent(
      makeEvent({ eventName: "my_custom_event" }),
    );

    expect(mockTtq.track).toHaveBeenCalledWith(
      "my_custom_event",
      {},
      { event_id: "evt-001" },
    );
  });

  it("should attach event_id for server-side dedup", () => {
    adapter.initialize(makeConfig());
    mockTtq.track.mockClear();

    adapter.trackEvent(
      makeEvent({
        eventId: "dedup-123",
        eventName: TrackingEventName.PRODUCT_ADDED_TO_CART,
      }),
    );

    const lastCall = mockTtq.track.mock.calls[0];
    expect(lastCall?.[2]).toEqual({ event_id: "dedup-123" });
  });

  it("should not track when not loaded", () => {
    adapter.trackEvent(makeEvent());
    expect(mockTtq.track).not.toHaveBeenCalled();
  });

  it("should clean up on destroy", () => {
    adapter.initialize(makeConfig());
    adapter.destroy();

    expect(adapter.isLoaded()).toBe(false);
    expect(adapter.isEnabled()).toBe(false);
  });
});

describe("buildTikTokParams", () => {
  it("returns empty object when no ecommerce data", () => {
    const event = makeEvent();
    expect(buildTikTokParams(event)).toEqual({});
  });

  it("maps ecommerce items to TikTok contents format", () => {
    const event = makeEvent({
      ecommerce: {
        value: 42.0,
        currency: "USD",
        items: [
          { itemId: "SKU-1", itemName: "Widget", price: 21.0, quantity: 2 },
        ],
      },
    });

    const params = buildTikTokParams(event);
    expect(params.value).toBe(42.0);
    expect(params.currency).toBe("USD");
    expect(params.contents).toEqual([
      {
        content_id: "SKU-1",
        content_name: "Widget",
        content_type: "product",
        quantity: 2,
        price: 21.0,
      },
    ]);
    expect(params.content_type).toBe("product");
    expect(params.content_id).toBe("SKU-1");
    expect(params.content_name).toBe("Widget");
    expect(params.quantity).toBe(2);
  });

  it("maps search query", () => {
    const event = makeEvent({
      ecommerce: { searchQuery: "red dress" },
    });

    const params = buildTikTokParams(event);
    expect(params.query).toBe("red dress");
  });
});
