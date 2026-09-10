import { describe, it, expect } from "vitest";
import {
  TrackingEventName,
  PixelPlatform,
  PLATFORM_EVENT_MAP,
  type TrackingEvent,
  type EcommerceEventData,
  type TrackingProductItem,
  type PixelConfig,
} from "#root/shared/types/pixel-tracking.js";

describe("Pixel tracking types", () => {
  it("should export all tracking event names", () => {
    expect(TrackingEventName.PAGE_VIEWED).toBe("page_viewed");
    expect(TrackingEventName.PRODUCT_VIEWED).toBe("product_viewed");
    expect(TrackingEventName.CHECKOUT_COMPLETED).toBe("checkout_completed");
    expect(TrackingEventName.CUSTOM_EVENT).toBe("custom_event");
  });

  it("should export all pixel platform identifiers", () => {
    expect(PixelPlatform.META).toBe("meta");
    expect(PixelPlatform.GOOGLE_GA4).toBe("google_ga4");
    expect(PixelPlatform.TIKTOK).toBe("tiktok");
    expect(PixelPlatform.SNAPCHAT).toBe("snapchat");
    expect(PixelPlatform.PINTEREST).toBe("pinterest");
    expect(PixelPlatform.CUSTOM).toBe("custom");
  });

  it("should have platform event maps for all platforms", () => {
    for (const platform of Object.values(PixelPlatform)) {
      expect(PLATFORM_EVENT_MAP[platform]).toBeDefined();
    }
  });

  it("should map page_viewed to all platforms", () => {
    expect(PLATFORM_EVENT_MAP[PixelPlatform.META][TrackingEventName.PAGE_VIEWED]).toBe("PageView");
    expect(PLATFORM_EVENT_MAP[PixelPlatform.GOOGLE_GA4][TrackingEventName.PAGE_VIEWED]).toBe("page_view");
    expect(PLATFORM_EVENT_MAP[PixelPlatform.TIKTOK][TrackingEventName.PAGE_VIEWED]).toBe("Pageview");
    expect(PLATFORM_EVENT_MAP[PixelPlatform.SNAPCHAT][TrackingEventName.PAGE_VIEWED]).toBe("PAGE_VIEW");
    expect(PLATFORM_EVENT_MAP[PixelPlatform.PINTEREST][TrackingEventName.PAGE_VIEWED]).toBe("pagevisit");
  });

  it("should map purchase to all platforms", () => {
    expect(PLATFORM_EVENT_MAP[PixelPlatform.META][TrackingEventName.CHECKOUT_COMPLETED]).toBe("Purchase");
    expect(PLATFORM_EVENT_MAP[PixelPlatform.GOOGLE_GA4][TrackingEventName.CHECKOUT_COMPLETED]).toBe("purchase");
    expect(PLATFORM_EVENT_MAP[PixelPlatform.TIKTOK][TrackingEventName.CHECKOUT_COMPLETED]).toBe("CompletePayment");
    expect(PLATFORM_EVENT_MAP[PixelPlatform.SNAPCHAT][TrackingEventName.CHECKOUT_COMPLETED]).toBe("PURCHASE");
    expect(PLATFORM_EVENT_MAP[PixelPlatform.PINTEREST][TrackingEventName.CHECKOUT_COMPLETED]).toBe("checkout");
  });

  it("should construct a valid TrackingEvent object", () => {
    const event: TrackingEvent = {
      eventId: "01234567-89ab-7cde-f012-345678901234",
      eventName: TrackingEventName.PRODUCT_VIEWED,
      timestamp: Date.now(),
      pageUrl: "https://shop.com/product/123",
      sessionId: "session-abc",
      userId: "user-xyz",
      ecommerce: {
        currency: "USD",
        value: 29.99,
        items: [
          {
            itemId: "SKU-001",
            itemName: "Blue Widget",
            price: 29.99,
            quantity: 1,
            category: "Widgets",
          },
        ],
      },
    };

    expect(event.eventId).toBeDefined();
    expect(event.eventName).toBe(TrackingEventName.PRODUCT_VIEWED);
    expect(event.ecommerce?.items).toHaveLength(1);
    expect(event.ecommerce?.items?.[0]?.itemId).toBe("SKU-001");
  });

  it("should construct a valid PixelConfig object", () => {
    const config: PixelConfig = {
      id: "config-1",
      platform: PixelPlatform.META,
      pixelId: "123456789",
      accessToken: "EAABsbCS...",
      enabled: true,
      enableClientSide: true,
      enableServerSide: true,
      consentRequired: false,
      consentCategory: "marketing",
      settings: null,
      createdAt: new Date(),
      updatedAt: null,
    };

    expect(config.platform).toBe(PixelPlatform.META);
    expect(config.enableClientSide).toBe(true);
    expect(config.consentCategory).toBe("marketing");
  });
});
