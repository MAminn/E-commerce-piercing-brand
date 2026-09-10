import {
  PixelPlatform,
  TrackingEventName,
  PLATFORM_EVENT_MAP,
  type PixelConfig,
  type TrackingEvent,
  type TrackingProductItem,
} from "#root/shared/types/pixel-tracking";
import type { PixelAdapter } from "./types";

// ─── Window augmentation ────────────────────────────────────────────────────
// window.dataLayer and window.gtag are already declared in pages/+Head.tsx.
// We do NOT re-declare them here to avoid conflicting types.

// ─── GA4-specific parameter builders ────────────────────────────────────────

function toGA4Item(item: TrackingProductItem): Record<string, unknown> {
  const ga4Item: Record<string, unknown> = {
    item_id: item.itemId,
    item_name: item.itemName,
  };
  if (item.price !== undefined) ga4Item.price = item.price;
  if (item.quantity !== undefined) ga4Item.quantity = item.quantity;
  if (item.category) ga4Item.item_category = item.category;
  if (item.brand) ga4Item.item_brand = item.brand;
  if (item.variant) ga4Item.item_variant = item.variant;
  return ga4Item;
}

function buildGA4Params(event: TrackingEvent): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const ecom = event.ecommerce;
  if (!ecom) return params;

  if (ecom.currency) params.currency = ecom.currency;
  if (ecom.value !== undefined) params.value = ecom.value;
  if (ecom.transactionId) params.transaction_id = ecom.transactionId;
  if (ecom.tax !== undefined) params.tax = ecom.tax;
  if (ecom.shipping !== undefined) params.shipping = ecom.shipping;
  if (ecom.coupon) params.coupon = ecom.coupon;
  if (ecom.searchQuery) params.search_term = ecom.searchQuery;

  if (ecom.items && ecom.items.length > 0) {
    params.items = ecom.items.map(toGA4Item);
  }

  return params;
}

// ─── Google GA4 Adapter ─────────────────────────────────────────────────────

const GA4_EVENT_MAP = PLATFORM_EVENT_MAP[PixelPlatform.GOOGLE_GA4];

export class GoogleGA4Adapter implements PixelAdapter {
  readonly platform = PixelPlatform.GOOGLE_GA4;

  private loaded = false;
  private enabled = false;
  private measurementId = "";
  private scriptElement: HTMLScriptElement | null = null;

  initialize(config: PixelConfig): void {
    if (typeof window === "undefined") return;
    this.measurementId = config.pixelId;
    this.enabled = config.enabled;

    this.injectSdk();

    // Only initialize gtag if not already set up by SSR (+Head.tsx)
    if (typeof window.gtag !== "function") {
      const dataLayer = (window.dataLayer = window.dataLayer || []);
      window.gtag = function gtag(...args: unknown[]) {
        dataLayer.push(args);
      };
      window.gtag("js", new Date());
      window.gtag("config", this.measurementId, {
        send_page_view: false,
      });
    }

    this.loaded = true;
  }

  destroy(): void {
    if (this.scriptElement?.parentNode) {
      this.scriptElement.parentNode.removeChild(this.scriptElement);
      this.scriptElement = null;
    }
    this.loaded = false;
    this.enabled = false;
  }

  trackEvent(event: TrackingEvent): void {
    if (!this.loaded || !this.enabled) return;
    if (typeof window === "undefined" || typeof window.gtag !== "function")
      return;

    const ga4EventName = GA4_EVENT_MAP[event.eventName as TrackingEventName];

    if (ga4EventName) {
      const params = buildGA4Params(event);
      window.gtag("event", ga4EventName, params);
    } else {
      // Custom / unmapped events — send with our canonical name
      const params = buildGA4Params(event);
      window.gtag("event", event.eventName, params);
    }
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private injectSdk(): void {
    // Check if the script was already injected by SSR (+Head.tsx)
    const existingScript = document.querySelector(
      `script[data-pixel-platform="google_ga4"][data-pixel-id="${this.measurementId}"]`,
    ) as HTMLScriptElement | null;

    if (existingScript) {
      // SSR already injected the script — just track a reference for cleanup
      this.scriptElement = existingScript;
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${this.measurementId}`;
    script.setAttribute("data-pixel-platform", "google_ga4");
    script.setAttribute("data-pixel-id", this.measurementId);
    this.scriptElement = script;

    const firstScript = document.getElementsByTagName("script")[0];
    if (firstScript?.parentNode) {
      firstScript.parentNode.insertBefore(script, firstScript);
    } else {
      document.head.appendChild(script);
    }
  }
}
