import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ClarityAdapter } from "#root/frontend/pixel-adapters/clarity-adapter";
import {
  PixelPlatform,
  TrackingEventName,
  type PixelConfig,
  type TrackingEvent,
} from "#root/shared/types/pixel-tracking";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeConfig(overrides?: Partial<PixelConfig>): PixelConfig {
  return {
    id: "cfg-clarity-1",
    platform: PixelPlatform.CLARITY,
    pixelId: "abcdefghij",
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
    eventId: "evt-clarity-001",
    eventName: TrackingEventName.PAGE_VIEWED,
    timestamp: Date.now(),
    pageUrl: "https://shop.com",
    sessionId: "sess-1",
    ...overrides,
  };
}

function makeFakeScriptElement() {
  return {
    async: false,
    src: "",
    setAttribute: vi.fn(),
    parentNode: { removeChild: vi.fn(), insertBefore: vi.fn() },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("ClarityAdapter", () => {
  let adapter: ClarityAdapter;

  beforeEach(() => {
    adapter = new ClarityAdapter();
    (globalThis as unknown as Record<string, unknown>).window = globalThis;
    delete (window as unknown as Record<string, unknown>).clarity;

    if (!globalThis.document) {
      (globalThis as unknown as Record<string, unknown>).document = {
        createElement: vi.fn(() => makeFakeScriptElement()),
        getElementsByTagName: vi.fn(() => []),
        querySelector: vi.fn(() => null),
        head: { appendChild: vi.fn() },
      };
    } else {
      (document as unknown as Record<string, unknown>).createElement = vi.fn(
        () => makeFakeScriptElement(),
      );
      (document as unknown as Record<string, unknown>).querySelector = vi.fn(
        () => null,
      );
      (document as unknown as Record<string, unknown>).getElementsByTagName =
        vi.fn(() => []);
      if (!document.head) {
        (document as unknown as Record<string, unknown>).head = {
          appendChild: vi.fn(),
        };
      } else {
        document.head.appendChild = vi.fn();
      }
    }
  });

  afterEach(() => {
    adapter.destroy();
  });

  it("should report correct platform", () => {
    expect(adapter.platform).toBe(PixelPlatform.CLARITY);
  });

  it("should initialize, injecting the clarity() stub onto window", () => {
    adapter.initialize(makeConfig());

    expect(adapter.isLoaded()).toBe(true);
    expect(adapter.isEnabled()).toBe(true);
    expect(typeof window.clarity).toBe("function");
  });

  it("should not be enabled if config.enabled is false", () => {
    adapter.initialize(makeConfig({ enabled: false }));
    expect(adapter.isLoaded()).toBe(true);
    expect(adapter.isEnabled()).toBe(false);
  });

  it("should not double-inject if window.clarity already exists", () => {
    const existingClarity = vi.fn();
    window.clarity = existingClarity;

    adapter.initialize(makeConfig());

    // Our injectSdk() must not have overwritten the pre-existing function
    expect(window.clarity).toBe(existingClarity);
  });

  it("should forward trackEvent as a Clarity custom event", () => {
    adapter.initialize(makeConfig());
    const claritySpy = vi.fn();
    window.clarity = claritySpy;

    adapter.trackEvent(
      makeEvent({ eventName: TrackingEventName.PRODUCT_ADDED_TO_CART }),
    );

    expect(claritySpy).toHaveBeenCalledWith(
      "event",
      TrackingEventName.PRODUCT_ADDED_TO_CART,
    );
  });

  it("should not track when not loaded", () => {
    const claritySpy = vi.fn();
    window.clarity = claritySpy;

    adapter.trackEvent(makeEvent());
    expect(claritySpy).not.toHaveBeenCalled();
  });

  it("should not track when disabled even if loaded", () => {
    adapter.initialize(makeConfig({ enabled: false }));
    const claritySpy = vi.fn();
    window.clarity = claritySpy;

    adapter.trackEvent(makeEvent());
    expect(claritySpy).not.toHaveBeenCalled();
  });

  it("should clean up on destroy", () => {
    adapter.initialize(makeConfig());
    adapter.destroy();

    expect(adapter.isLoaded()).toBe(false);
    expect(adapter.isEnabled()).toBe(false);
  });

  it("should reuse an existing injected script tag for the same pixel id", () => {
    const existingScript = makeFakeScriptElement();
    (document.querySelector as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      existingScript,
    );

    adapter.initialize(makeConfig());

    // Should not attempt to append a fresh script when one already exists
    expect(document.createElement).not.toHaveBeenCalled();
  });
});
