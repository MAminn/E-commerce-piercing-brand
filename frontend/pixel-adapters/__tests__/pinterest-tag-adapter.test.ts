import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  PinterestTagAdapter,
  buildPinterestParams,
} from "#root/frontend/pixel-adapters/pinterest-tag-adapter";
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
    platform: PixelPlatform.PINTEREST,
    pixelId: "2612345678901",
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

describe("PinterestTagAdapter", () => {
  let adapter: PinterestTagAdapter;
  let mockPintrk: ReturnType<typeof vi.fn> & { queue: unknown[]; loaded?: boolean };

  beforeEach(() => {
    adapter = new PinterestTagAdapter();

    mockPintrk = Object.assign(vi.fn(), { queue: [], loaded: true });
    (globalThis as unknown as Record<string, unknown>).window = globalThis;
    (window as unknown as Record<string, unknown>).pintrk = mockPintrk;

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
    expect(adapter.platform).toBe(PixelPlatform.PINTEREST);
  });

  it("should initialize and call pintrk load + page", () => {
    adapter.initialize(makeConfig());

    expect(mockPintrk).toHaveBeenCalledWith("load", "2612345678901");
    expect(mockPintrk).toHaveBeenCalledWith("page");
    expect(adapter.isLoaded()).toBe(true);
    expect(adapter.isEnabled()).toBe(true);
  });

  it("should not be enabled if config.enabled is false", () => {
    adapter.initialize(makeConfig({ enabled: false }));

    expect(adapter.isLoaded()).toBe(true);
    expect(adapter.isEnabled()).toBe(false);
  });

  it("should skip PAGE_VIEWED (handled by pintrk page in init)", () => {
    adapter.initialize(makeConfig());
    mockPintrk.mockClear();

    adapter.trackEvent(makeEvent({ eventName: TrackingEventName.PAGE_VIEWED }));

    expect(mockPintrk).not.toHaveBeenCalled();
  });

  it("should track addtocart for product_added_to_cart", () => {
    adapter.initialize(makeConfig());
    mockPintrk.mockClear();

    adapter.trackEvent(
      makeEvent({
        eventName: TrackingEventName.PRODUCT_ADDED_TO_CART,
        ecommerce: {
          value: 25.0,
          currency: "USD",
          items: [
            { itemId: "SKU-1", itemName: "Widget", price: 25.0, quantity: 1 },
          ],
        },
      }),
    );

    expect(mockPintrk).toHaveBeenCalledWith(
      "track",
      "addtocart",
      expect.objectContaining({
        value: 25.0,
        currency: "USD",
        event_id: "evt-001",
        line_items: [
          { product_id: "SKU-1", product_name: "Widget", product_price: 25.0, product_quantity: 1 },
        ],
        order_quantity: 1,
      }),
    );
  });

  it("should track checkout for checkout_completed", () => {
    adapter.initialize(makeConfig());
    mockPintrk.mockClear();

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

    expect(mockPintrk).toHaveBeenCalledWith(
      "track",
      "checkout",
      expect.objectContaining({
        value: 99.99,
        currency: "USD",
        order_id: "T-001",
        event_id: "evt-001",
      }),
    );
  });

  it("should track search with search_query", () => {
    adapter.initialize(makeConfig());
    mockPintrk.mockClear();

    adapter.trackEvent(
      makeEvent({
        eventName: TrackingEventName.SEARCH_SUBMITTED,
        ecommerce: { searchQuery: "blue shoes" },
      }),
    );

    expect(mockPintrk).toHaveBeenCalledWith(
      "track",
      "search",
      expect.objectContaining({
        search_query: "blue shoes",
        event_id: "evt-001",
      }),
    );
  });

  it("should use custom event name for unmapped events", () => {
    adapter.initialize(makeConfig());
    mockPintrk.mockClear();

    adapter.trackEvent(
      makeEvent({ eventName: "my_custom_event" }),
    );

    expect(mockPintrk).toHaveBeenCalledWith(
      "track",
      "my_custom_event",
      expect.objectContaining({ event_id: "evt-001" }),
    );
  });

  it("should not track when not loaded", () => {
    adapter.trackEvent(makeEvent());
    expect(mockPintrk).not.toHaveBeenCalled();
  });

  it("should clean up on destroy", () => {
    adapter.initialize(makeConfig());
    adapter.destroy();

    expect(adapter.isLoaded()).toBe(false);
    expect(adapter.isEnabled()).toBe(false);
  });
});

describe("buildPinterestParams", () => {
  it("returns params with event_id when no ecommerce data", () => {
    const event = makeEvent();
    const params = buildPinterestParams(event);
    expect(params.event_id).toBe("evt-001");
    expect(Object.keys(params)).toHaveLength(1);
  });

  it("maps ecommerce items to Pinterest line_items format", () => {
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

    const params = buildPinterestParams(event);
    expect(params.value).toBe(42.0);
    expect(params.currency).toBe("USD");
    expect(params.order_id).toBe("T-100");
    expect(params.line_items).toEqual([
      { product_id: "SKU-1", product_name: "Widget", product_price: 21.0, product_quantity: 2 },
    ]);
    expect(params.order_quantity).toBe(2);
  });

  it("maps search query", () => {
    const event = makeEvent({
      ecommerce: { searchQuery: "red dress" },
    });

    const params = buildPinterestParams(event);
    expect(params.search_query).toBe("red dress");
  });
});
