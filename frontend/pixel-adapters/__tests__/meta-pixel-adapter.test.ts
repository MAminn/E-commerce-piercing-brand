import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MetaPixelAdapter } from "#root/frontend/pixel-adapters/meta-pixel-adapter";
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
    platform: PixelPlatform.META,
    pixelId: "123456789",
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

describe("MetaPixelAdapter", () => {
  let adapter: MetaPixelAdapter;
  let mockFbq: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    adapter = new MetaPixelAdapter();
    // Stub fbq as a global so injectSdk sees it's already "loaded"
    mockFbq = vi.fn();
    (globalThis as unknown as Record<string, unknown>).window = globalThis;
    (window as unknown as Record<string, unknown>).fbq = mockFbq;
    // Provide a minimal document stub for script injection
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
    expect(adapter.platform).toBe(PixelPlatform.META);
  });

  it("should initialize and call fbq init", () => {
    adapter.initialize(makeConfig());

    expect(mockFbq).toHaveBeenCalledWith("init", "123456789");
    expect(adapter.isLoaded()).toBe(true);
    expect(adapter.isEnabled()).toBe(true);
  });

  it("should not be enabled if config.enabled is false", () => {
    adapter.initialize(makeConfig({ enabled: false }));

    expect(adapter.isLoaded()).toBe(true);
    expect(adapter.isEnabled()).toBe(false);
  });

  it("should track a standard PageView event", () => {
    adapter.initialize(makeConfig());
    mockFbq.mockClear();

    adapter.trackEvent(makeEvent({ eventName: TrackingEventName.PAGE_VIEWED }));

    expect(mockFbq).toHaveBeenCalledWith(
      "track",
      "PageView",
      {},
      { eventID: "evt-001" },
    );
  });

  it("should track Purchase event with ecommerce data", () => {
    adapter.initialize(makeConfig());
    mockFbq.mockClear();

    adapter.trackEvent(
      makeEvent({
        eventName: TrackingEventName.CHECKOUT_COMPLETED,
        ecommerce: {
          value: 99.99,
          currency: "USD",
          items: [
            { itemId: "prod-1", itemName: "Widget", price: 49.99, quantity: 2, category: "Gadgets" },
          ],
        },
      }),
    );

    expect(mockFbq).toHaveBeenCalledWith(
      "track",
      "Purchase",
      {
        value: 99.99,
        currency: "USD",
        content_ids: ["prod-1"],
        contents: [{ id: "prod-1", quantity: 2 }],
        content_type: "product",
        content_category: "Gadgets",
        content_name: "Widget",
        num_items: 2,
      },
      { eventID: "evt-001" },
    );
  });

  it("should track Search event with search_string", () => {
    adapter.initialize(makeConfig());
    mockFbq.mockClear();

    adapter.trackEvent(
      makeEvent({
        eventName: TrackingEventName.SEARCH_SUBMITTED,
        ecommerce: { searchQuery: "blue shoes" },
      }),
    );

    expect(mockFbq).toHaveBeenCalledWith(
      "track",
      "Search",
      { search_string: "blue shoes" },
      { eventID: "evt-001" },
    );
  });

  it("should use trackCustom for unmapped events", () => {
    adapter.initialize(makeConfig());
    mockFbq.mockClear();

    adapter.trackEvent(
      makeEvent({ eventName: "my_custom_event" }),
    );

    expect(mockFbq).toHaveBeenCalledWith(
      "trackCustom",
      "my_custom_event",
      {},
      { eventID: "evt-001" },
    );
  });

  it("should attach eventId for server-side dedup", () => {
    adapter.initialize(makeConfig());
    mockFbq.mockClear();

    adapter.trackEvent(makeEvent({ eventId: "dedup-123" }));

    const lastCall = mockFbq.mock.calls[0];
    expect(lastCall?.[3]).toEqual({ eventID: "dedup-123" });
  });

  it("should not track when not loaded", () => {
    // Don't initialize → not loaded
    adapter.trackEvent(makeEvent());
    expect(mockFbq).not.toHaveBeenCalled();
  });

  it("should clean up on destroy", () => {
    adapter.initialize(makeConfig());
    adapter.destroy();

    expect(adapter.isLoaded()).toBe(false);
    expect(adapter.isEnabled()).toBe(false);
  });
});
