import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GoogleGA4Adapter } from "#root/frontend/pixel-adapters/google-ga4-adapter";
import {
  PixelPlatform,
  TrackingEventName,
  type PixelConfig,
  type TrackingEvent,
} from "#root/shared/types/pixel-tracking";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeConfig(overrides?: Partial<PixelConfig>): PixelConfig {
  return {
    id: "cfg-2",
    platform: PixelPlatform.GOOGLE_GA4,
    pixelId: "G-TESTMEAS01",
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
    eventId: "evt-ga4-001",
    eventName: TrackingEventName.PAGE_VIEWED,
    timestamp: Date.now(),
    pageUrl: "https://shop.com",
    sessionId: "sess-1",
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("GoogleGA4Adapter", () => {
  let adapter: GoogleGA4Adapter;
  let mockGtag: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    adapter = new GoogleGA4Adapter();
    mockGtag = vi.fn();
    (globalThis as unknown as Record<string, unknown>).window = globalThis;
    (window as unknown as Record<string, unknown>).dataLayer = [];
    // Do NOT set window.gtag here — let initialize() set it up.
    // Tests that need to spy on gtag calls should set mockGtag after initialize().
    delete (window as unknown as Record<string, unknown>).gtag;
    if (!globalThis.document) {
      (globalThis as unknown as Record<string, unknown>).document = {
        createElement: vi.fn(() => ({ async: false, src: "", setAttribute: vi.fn() })),
        getElementsByTagName: vi.fn(() => []),
        querySelector: vi.fn(() => null),
        head: { appendChild: vi.fn() },
      };
    } else if (typeof document.querySelector !== "function") {
      (document as unknown as Record<string, unknown>).querySelector = vi.fn(() => null);
    }
  });

  afterEach(() => {
    adapter.destroy();
  });

  it("should report correct platform", () => {
    expect(adapter.platform).toBe(PixelPlatform.GOOGLE_GA4);
  });

  it("should initialize and call gtag config", () => {
    adapter.initialize(makeConfig());

    // gtag is reassigned during initialize; grab it from window
    expect(adapter.isLoaded()).toBe(true);
    expect(adapter.isEnabled()).toBe(true);
    // dataLayer should contain initialization calls
    expect(window.dataLayer?.length).toBeGreaterThan(0);
  });

  it("should not be enabled if config.enabled is false", () => {
    adapter.initialize(makeConfig({ enabled: false }));
    expect(adapter.isLoaded()).toBe(true);
    expect(adapter.isEnabled()).toBe(false);
  });

  it("tags the injected script so a second init doesn't duplicate it", () => {
    const setAttribute = vi.fn();
    const createElement = vi.fn(() => ({ async: false, src: "", setAttribute }));
    (document as unknown as Record<string, unknown>).createElement = createElement;

    adapter.initialize(makeConfig({ pixelId: "G-DEDUPE01" }));

    expect(createElement).toHaveBeenCalledTimes(1);
    expect(setAttribute).toHaveBeenCalledWith("data-pixel-platform", "google_ga4");
    expect(setAttribute).toHaveBeenCalledWith("data-pixel-id", "G-DEDUPE01");
  });

  it("skips re-injecting the script when one matching platform+id already exists", () => {
    const existingScript = { async: true, src: "existing" };
    const querySelector = vi.fn(() => existingScript);
    const createElement = vi.fn();
    (document as unknown as Record<string, unknown>).querySelector = querySelector;
    (document as unknown as Record<string, unknown>).createElement = createElement;

    adapter.initialize(makeConfig({ pixelId: "G-DEDUPE01" }));

    expect(querySelector).toHaveBeenCalledWith(
      'script[data-pixel-platform="google_ga4"][data-pixel-id="G-DEDUPE01"]',
    );
    expect(createElement).not.toHaveBeenCalled();
  });

  it("should track view_item event with GA4 item format", () => {
    adapter.initialize(makeConfig());
    // Capture the gtag that was set during initialize
    const gtag = window.gtag;
    const gtagSpy = vi.fn();
    window.gtag = gtagSpy;

    adapter.trackEvent(
      makeEvent({
        eventName: TrackingEventName.PRODUCT_VIEWED,
        ecommerce: {
          currency: "USD",
          value: 29.99,
          items: [
            {
              itemId: "prod-1",
              itemName: "Widget",
              price: 29.99,
              quantity: 1,
              category: "Gadgets",
              brand: "Acme",
              variant: "Blue",
            },
          ],
        },
      }),
    );

    expect(gtagSpy).toHaveBeenCalledWith("event", "view_item", {
      currency: "USD",
      value: 29.99,
      items: [
        {
          item_id: "prod-1",
          item_name: "Widget",
          price: 29.99,
          quantity: 1,
          item_category: "Gadgets",
          item_brand: "Acme",
          item_variant: "Blue",
        },
      ],
    });

    window.gtag = gtag; // restore
  });

  it("should track purchase event with full ecommerce data", () => {
    adapter.initialize(makeConfig());
    const gtagSpy = vi.fn();
    window.gtag = gtagSpy;

    adapter.trackEvent(
      makeEvent({
        eventName: TrackingEventName.CHECKOUT_COMPLETED,
        ecommerce: {
          currency: "USD",
          value: 149.99,
          transactionId: "order-42",
          tax: 12.0,
          shipping: 5.99,
          coupon: "SAVE10",
          items: [
            { itemId: "p1", itemName: "Shirt", price: 49.99, quantity: 3 },
          ],
        },
      }),
    );

    expect(gtagSpy).toHaveBeenCalledWith("event", "purchase", {
      currency: "USD",
      value: 149.99,
      transaction_id: "order-42",
      tax: 12.0,
      shipping: 5.99,
      coupon: "SAVE10",
      items: [
        { item_id: "p1", item_name: "Shirt", price: 49.99, quantity: 3 },
      ],
    });
  });

  it("should track search event with search_term", () => {
    adapter.initialize(makeConfig());
    const gtagSpy = vi.fn();
    window.gtag = gtagSpy;

    adapter.trackEvent(
      makeEvent({
        eventName: TrackingEventName.SEARCH_SUBMITTED,
        ecommerce: { searchQuery: "blue shoes" },
      }),
    );

    expect(gtagSpy).toHaveBeenCalledWith("event", "search", {
      search_term: "blue shoes",
    });
  });

  it("should send custom event for unmapped event names", () => {
    adapter.initialize(makeConfig());
    const gtagSpy = vi.fn();
    window.gtag = gtagSpy;

    adapter.trackEvent(makeEvent({ eventName: "my_custom_event" }));

    expect(gtagSpy).toHaveBeenCalledWith("event", "my_custom_event", {});
  });

  it("should not track when not loaded", () => {
    const gtagSpy = vi.fn();
    window.gtag = gtagSpy;

    adapter.trackEvent(makeEvent());
    expect(gtagSpy).not.toHaveBeenCalled();
  });

  it("should clean up on destroy", () => {
    adapter.initialize(makeConfig());
    adapter.destroy();

    expect(adapter.isLoaded()).toBe(false);
    expect(adapter.isEnabled()).toBe(false);
  });

  it("should map add_to_cart correctly", () => {
    adapter.initialize(makeConfig());
    const gtagSpy = vi.fn();
    window.gtag = gtagSpy;

    adapter.trackEvent(
      makeEvent({
        eventName: TrackingEventName.PRODUCT_ADDED_TO_CART,
        ecommerce: {
          currency: "EUR",
          value: 19.99,
          items: [{ itemId: "p2", itemName: "Mug", price: 19.99, quantity: 1 }],
        },
      }),
    );

    expect(gtagSpy).toHaveBeenCalledWith("event", "add_to_cart", {
      currency: "EUR",
      value: 19.99,
      items: [{ item_id: "p2", item_name: "Mug", price: 19.99, quantity: 1 }],
    });
  });
});
