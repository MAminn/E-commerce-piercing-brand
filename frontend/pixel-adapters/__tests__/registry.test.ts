import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PixelAdapterRegistry } from "#root/frontend/pixel-adapters/registry";
import type { PixelAdapter } from "#root/frontend/pixel-adapters/types";
import {
  PixelPlatform,
  TrackingEventName,
  type PixelConfig,
  type TrackingEvent,
} from "#root/shared/types/pixel-tracking";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeEvent(overrides?: Partial<TrackingEvent>): TrackingEvent {
  return {
    eventId: "test-event-id",
    eventName: TrackingEventName.PAGE_VIEWED,
    timestamp: Date.now(),
    pageUrl: "https://shop.com",
    sessionId: "test-session",
    ...overrides,
  };
}

function makeMockAdapter(
  platform: PixelPlatform,
  overrides?: Partial<PixelAdapter>,
): PixelAdapter {
  return {
    platform,
    initialize: vi.fn(),
    destroy: vi.fn(),
    trackEvent: vi.fn(),
    isLoaded: vi.fn(() => true),
    isEnabled: vi.fn(() => true),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("PixelAdapterRegistry", () => {
  let registry: PixelAdapterRegistry;

  beforeEach(() => {
    registry = new PixelAdapterRegistry();
  });

  afterEach(() => {
    registry.destroyAll();
  });

  // ── Registration ────────────────────────────────────────────────────────

  it("should register and retrieve an adapter", () => {
    const adapter = makeMockAdapter(PixelPlatform.META);
    registry.register(adapter);

    expect(registry.getAdapter(PixelPlatform.META)).toBe(adapter);
    expect(registry.size).toBe(1);
  });

  it("should return undefined for unregistered platform", () => {
    expect(registry.getAdapter(PixelPlatform.GOOGLE_GA4)).toBeUndefined();
  });

  it("should replace an existing adapter for the same platform", () => {
    const first = makeMockAdapter(PixelPlatform.META);
    const second = makeMockAdapter(PixelPlatform.META);

    registry.register(first);
    registry.register(second);

    expect(registry.getAdapter(PixelPlatform.META)).toBe(second);
    expect(registry.size).toBe(1);
  });

  it("should register multiple adapters for different platforms", () => {
    registry.register(makeMockAdapter(PixelPlatform.META));
    registry.register(makeMockAdapter(PixelPlatform.GOOGLE_GA4));
    registry.register(makeMockAdapter(PixelPlatform.TIKTOK));

    expect(registry.size).toBe(3);
    expect(registry.getAllAdapters()).toHaveLength(3);
  });

  // ── Unregistration ──────────────────────────────────────────────────────

  it("should unregister an adapter and call destroy", () => {
    const adapter = makeMockAdapter(PixelPlatform.META);
    registry.register(adapter);

    registry.unregister(PixelPlatform.META);

    expect(adapter.destroy).toHaveBeenCalledOnce();
    expect(registry.getAdapter(PixelPlatform.META)).toBeUndefined();
    expect(registry.size).toBe(0);
  });

  it("should do nothing when unregistering a non-existent platform", () => {
    expect(() => registry.unregister(PixelPlatform.SNAPCHAT)).not.toThrow();
  });

  // ── Broadcast ───────────────────────────────────────────────────────────

  it("should broadcast event to all enabled & loaded adapters", () => {
    const meta = makeMockAdapter(PixelPlatform.META);
    const ga4 = makeMockAdapter(PixelPlatform.GOOGLE_GA4);
    registry.register(meta);
    registry.register(ga4);

    const event = makeEvent();
    registry.broadcastEvent(event);

    expect(meta.trackEvent).toHaveBeenCalledOnce();
    expect(meta.trackEvent).toHaveBeenCalledWith(event);
    expect(ga4.trackEvent).toHaveBeenCalledOnce();
    expect(ga4.trackEvent).toHaveBeenCalledWith(event);
  });

  it("should skip adapters that are not enabled", () => {
    const enabled = makeMockAdapter(PixelPlatform.META);
    const disabled = makeMockAdapter(PixelPlatform.GOOGLE_GA4, {
      isEnabled: vi.fn(() => false),
    });
    registry.register(enabled);
    registry.register(disabled);

    registry.broadcastEvent(makeEvent());

    expect(enabled.trackEvent).toHaveBeenCalledOnce();
    expect(disabled.trackEvent).not.toHaveBeenCalled();
  });

  it("should skip adapters that are not loaded", () => {
    const loaded = makeMockAdapter(PixelPlatform.META);
    const notLoaded = makeMockAdapter(PixelPlatform.GOOGLE_GA4, {
      isLoaded: vi.fn(() => false),
    });
    registry.register(loaded);
    registry.register(notLoaded);

    registry.broadcastEvent(makeEvent());

    expect(loaded.trackEvent).toHaveBeenCalledOnce();
    expect(notLoaded.trackEvent).not.toHaveBeenCalled();
  });

  it("should not break if an adapter throws during broadcast", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const badAdapter = makeMockAdapter(PixelPlatform.META, {
      trackEvent: vi.fn(() => {
        throw new Error("Tracking failure");
      }),
    });
    const goodAdapter = makeMockAdapter(PixelPlatform.GOOGLE_GA4);
    registry.register(badAdapter);
    registry.register(goodAdapter);

    registry.broadcastEvent(makeEvent());

    expect(badAdapter.trackEvent).toHaveBeenCalledOnce();
    expect(goodAdapter.trackEvent).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledOnce();

    warnSpy.mockRestore();
  });

  // ── destroyAll ──────────────────────────────────────────────────────────

  it("should destroy all adapters and clear the registry", () => {
    const meta = makeMockAdapter(PixelPlatform.META);
    const ga4 = makeMockAdapter(PixelPlatform.GOOGLE_GA4);
    registry.register(meta);
    registry.register(ga4);

    registry.destroyAll();

    expect(meta.destroy).toHaveBeenCalledOnce();
    expect(ga4.destroy).toHaveBeenCalledOnce();
    expect(registry.size).toBe(0);
    expect(registry.getAllAdapters()).toHaveLength(0);
  });

  it("should not break if an adapter throws during destroyAll", () => {
    const badAdapter = makeMockAdapter(PixelPlatform.META, {
      destroy: vi.fn(() => {
        throw new Error("Cleanup failure");
      }),
    });
    const goodAdapter = makeMockAdapter(PixelPlatform.GOOGLE_GA4);
    registry.register(badAdapter);
    registry.register(goodAdapter);

    expect(() => registry.destroyAll()).not.toThrow();

    expect(badAdapter.destroy).toHaveBeenCalledOnce();
    expect(goodAdapter.destroy).toHaveBeenCalledOnce();
    expect(registry.size).toBe(0);
  });
});
