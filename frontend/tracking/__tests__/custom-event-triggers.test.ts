import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CustomEventTriggerManager,
  type CustomEventFireCallback,
} from "#root/frontend/tracking/custom-event-triggers";
import type { CustomTrackingEventConfig } from "#root/shared/types/pixel-tracking";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeConfig(
  overrides?: Partial<CustomTrackingEventConfig>,
): CustomTrackingEventConfig {
  return {
    id: "evt-1",
    name: "test_event",
    displayName: "Test Event",
    description: null,
    triggerType: "manual",
    triggerConfig: {},
    eventData: {},
    platformMapping: {},
    isActive: true,
    createdAt: new Date(),
    updatedAt: null,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("CustomEventTriggerManager", () => {
  let manager: CustomEventTriggerManager;
  let fireCallback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fireCallback = vi.fn();
    manager = new CustomEventTriggerManager(
      fireCallback as CustomEventFireCallback,
    );

    // Ensure window/document globals for testing
    if (typeof window === "undefined") {
      (globalThis as unknown as Record<string, unknown>).window = globalThis;
    }
    if (!globalThis.document) {
      const listeners: Record<string, Array<(e: unknown) => void>> = {};
      (globalThis as unknown as Record<string, unknown>).document = {
        addEventListener: vi.fn(
          (type: string, handler: (e: unknown) => void) => {
            if (!listeners[type]) listeners[type] = [];
            listeners[type].push(handler);
          },
        ),
        removeEventListener: vi.fn(
          (type: string, handler: (e: unknown) => void) => {
            if (listeners[type]) {
              listeners[type] = listeners[type].filter((h) => h !== handler);
            }
          },
        ),
        _listeners: listeners,
      };
    }
  });

  afterEach(() => {
    manager.destroyAll();
    vi.restoreAllMocks();
  });

  // ── Constructor & Basic ─────────────────────────────────────────────────

  it("should create manager without errors", () => {
    expect(manager).toBeDefined();
  });

  it("should not fire callback for inactive events", () => {
    manager.loadConfigs([
      makeConfig({ isActive: false, triggerType: "url_match", triggerConfig: { pattern: ".*" } }),
    ]);
    manager.onPageChange("https://shop.com/products");
    expect(fireCallback).not.toHaveBeenCalled();
  });

  // ── Manual Trigger ──────────────────────────────────────────────────────

  it("should set up manual triggers without auto-firing", () => {
    manager.loadConfigs([
      makeConfig({ triggerType: "manual" }),
    ]);
    // Manual triggers don't auto-fire
    expect(fireCallback).not.toHaveBeenCalled();
  });

  // ── URL Match Trigger ───────────────────────────────────────────────────

  it("should fire url_match trigger when URL matches pattern", () => {
    // Mock window.location.href
    Object.defineProperty(window, "location", {
      value: { href: "https://shop.com/products/size-guide" },
      writable: true,
      configurable: true,
    });

    manager.loadConfigs([
      makeConfig({
        id: "url-1",
        name: "size_guide_viewed",
        triggerType: "url_match",
        triggerConfig: { pattern: "\\/size-guide" },
        eventData: { category: "guide" },
      }),
    ]);

    expect(fireCallback).toHaveBeenCalledOnce();
    expect(fireCallback).toHaveBeenCalledWith(
      "size_guide_viewed",
      expect.objectContaining({
        category: "guide",
        _customEventId: "url-1",
        _triggerType: "url_match",
      }),
    );
  });

  it("should NOT fire url_match trigger when URL does not match", () => {
    Object.defineProperty(window, "location", {
      value: { href: "https://shop.com/products/shirt" },
      writable: true,
      configurable: true,
    });

    manager.loadConfigs([
      makeConfig({
        triggerType: "url_match",
        triggerConfig: { pattern: "\\/size-guide" },
      }),
    ]);

    expect(fireCallback).not.toHaveBeenCalled();
  });

  it("should fire url_match only once per page view", () => {
    Object.defineProperty(window, "location", {
      value: { href: "https://shop.com/products/size-guide" },
      writable: true,
      configurable: true,
    });

    manager.loadConfigs([
      makeConfig({
        id: "url-2",
        triggerType: "url_match",
        triggerConfig: { pattern: "\\/size-guide" },
      }),
    ]);

    // Already fired once on loadConfigs (because setupUrlMatchTrigger evaluates immediately)
    expect(fireCallback).toHaveBeenCalledOnce();

    // onPageChange with same URL should fire again (new page view)
    manager.onPageChange("https://shop.com/products/size-guide");
    expect(fireCallback).toHaveBeenCalledTimes(2);
  });

  it("should re-evaluate url_match on page change", () => {
    Object.defineProperty(window, "location", {
      value: { href: "https://shop.com/" },
      writable: true,
      configurable: true,
    });

    manager.loadConfigs([
      makeConfig({
        id: "url-nav",
        triggerType: "url_match",
        triggerConfig: { pattern: "\\/checkout" },
      }),
    ]);

    expect(fireCallback).not.toHaveBeenCalled();

    // Navigate to checkout
    manager.onPageChange("https://shop.com/checkout");
    expect(fireCallback).toHaveBeenCalledOnce();
  });

  // ── Time on Page Trigger ────────────────────────────────────────────────

  it("should fire time_on_page trigger after specified seconds", () => {
    vi.useFakeTimers();

    manager.loadConfigs([
      makeConfig({
        id: "time-1",
        name: "long_reader",
        triggerType: "time_on_page",
        triggerConfig: { seconds: 30 },
      }),
    ]);

    expect(fireCallback).not.toHaveBeenCalled();

    // Advance 29 seconds — should not fire yet
    vi.advanceTimersByTime(29_000);
    expect(fireCallback).not.toHaveBeenCalled();

    // Advance to 30 seconds
    vi.advanceTimersByTime(1_000);
    expect(fireCallback).toHaveBeenCalledOnce();
    expect(fireCallback).toHaveBeenCalledWith(
      "long_reader",
      expect.objectContaining({
        _customEventId: "time-1",
        _triggerType: "time_on_page",
      }),
    );

    vi.useRealTimers();
  });

  it("should reset time_on_page timer on page change", () => {
    vi.useFakeTimers();

    manager.loadConfigs([
      makeConfig({
        id: "time-2",
        triggerType: "time_on_page",
        triggerConfig: { seconds: 10 },
      }),
    ]);

    // Advance 5 seconds
    vi.advanceTimersByTime(5_000);
    expect(fireCallback).not.toHaveBeenCalled();

    // Page change resets timer
    manager.onPageChange("https://shop.com/new-page");
    vi.advanceTimersByTime(5_000);
    expect(fireCallback).not.toHaveBeenCalled();

    // 5 more seconds — total 10s from page change
    vi.advanceTimersByTime(5_000);
    expect(fireCallback).toHaveBeenCalledOnce();

    vi.useRealTimers();
  });

  // ── CSS Selector Trigger ────────────────────────────────────────────────

  it("should set up document click listener for css_selector trigger", () => {
    manager.loadConfigs([
      makeConfig({
        triggerType: "css_selector",
        triggerConfig: { selector: ".size-guide-btn" },
      }),
    ]);

    expect(document.addEventListener).toHaveBeenCalledWith(
      "click",
      expect.any(Function),
      true,
    );
  });

  it("should remove click listener on destroy", () => {
    manager.loadConfigs([
      makeConfig({
        triggerType: "css_selector",
        triggerConfig: { selector: ".size-guide-btn" },
      }),
    ]);

    manager.destroyAll();

    expect(document.removeEventListener).toHaveBeenCalledWith(
      "click",
      expect.any(Function),
      true,
    );
  });

  // ── Platform Mapping ────────────────────────────────────────────────────

  it("should include platform mapping in fired event when present", () => {
    Object.defineProperty(window, "location", {
      value: { href: "https://shop.com/loyalty" },
      writable: true,
      configurable: true,
    });

    manager.loadConfigs([
      makeConfig({
        id: "map-1",
        name: "loyalty_signup",
        triggerType: "url_match",
        triggerConfig: { pattern: "\\/loyalty" },
        platformMapping: {
          meta: "CustomEvent_LoyaltySignup",
          google_ga4: "loyalty_signup_custom",
        },
      }),
    ]);

    expect(fireCallback).toHaveBeenCalledWith(
      "loyalty_signup",
      expect.objectContaining({
        _platformMapping: {
          meta: "CustomEvent_LoyaltySignup",
          google_ga4: "loyalty_signup_custom",
        },
      }),
    );
  });

  // ── Multiple Configs ────────────────────────────────────────────────────

  it("should handle multiple configs simultaneously", () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "location", {
      value: { href: "https://shop.com/products" },
      writable: true,
      configurable: true,
    });

    manager.loadConfigs([
      makeConfig({
        id: "multi-1",
        name: "product_browse",
        triggerType: "url_match",
        triggerConfig: { pattern: "\\/products" },
      }),
      makeConfig({
        id: "multi-2",
        name: "engaged_reader",
        triggerType: "time_on_page",
        triggerConfig: { seconds: 5 },
      }),
      makeConfig({
        id: "multi-3",
        name: "manual_event",
        triggerType: "manual",
      }),
    ]);

    // url_match fires immediately
    expect(fireCallback).toHaveBeenCalledTimes(1);
    expect(fireCallback).toHaveBeenCalledWith(
      "product_browse",
      expect.any(Object),
    );

    // time_on_page fires after 5s
    vi.advanceTimersByTime(5_000);
    expect(fireCallback).toHaveBeenCalledTimes(2);
    expect(fireCallback).toHaveBeenCalledWith(
      "engaged_reader",
      expect.any(Object),
    );

    vi.useRealTimers();
  });

  // ── destroyAll Clears All ─────────────────────────────────────────────

  it("should clean up all triggers on destroyAll", () => {
    vi.useFakeTimers();

    manager.loadConfigs([
      makeConfig({
        id: "cleanup-1",
        triggerType: "time_on_page",
        triggerConfig: { seconds: 10 },
      }),
    ]);

    manager.destroyAll();

    // Timer should be cleared
    vi.advanceTimersByTime(15_000);
    expect(fireCallback).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  // ── Event Data ────────────────────────────────────────────────────

  it("should include static eventData in fired events", () => {
    Object.defineProperty(window, "location", {
      value: { href: "https://shop.com/promo" },
      writable: true,
      configurable: true,
    });

    manager.loadConfigs([
      makeConfig({
        id: "data-1",
        name: "promo_view",
        triggerType: "url_match",
        triggerConfig: { pattern: "\\/promo" },
        eventData: { promoId: "SPRING2024", discount: "20%" },
      }),
    ]);

    expect(fireCallback).toHaveBeenCalledWith(
      "promo_view",
      expect.objectContaining({
        promoId: "SPRING2024",
        discount: "20%",
      }),
    );
  });

  // ── Invalid Config Handling ──────────────────────────────────────────

  it("should skip url_match with invalid regex gracefully", () => {
    Object.defineProperty(window, "location", {
      value: { href: "https://shop.com/" },
      writable: true,
      configurable: true,
    });

    // Should not throw
    expect(() => {
      manager.loadConfigs([
        makeConfig({
          triggerType: "url_match",
          triggerConfig: { pattern: "[invalid" },
        }),
      ]);
    }).not.toThrow();

    expect(fireCallback).not.toHaveBeenCalled();
  });

  it("should skip time_on_page with no seconds config", () => {
    vi.useFakeTimers();

    manager.loadConfigs([
      makeConfig({
        triggerType: "time_on_page",
        triggerConfig: {},
      }),
    ]);

    vi.advanceTimersByTime(60_000);
    expect(fireCallback).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
