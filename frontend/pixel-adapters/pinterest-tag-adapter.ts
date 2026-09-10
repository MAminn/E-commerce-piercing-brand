import {
  PixelPlatform,
  TrackingEventName,
  PLATFORM_EVENT_MAP,
  type PixelConfig,
  type TrackingEvent,
  type TrackingProductItem,
} from "#root/shared/types/pixel-tracking";
import type { PixelAdapter } from "./types";

// ─── Window augmentation for pintrk ─────────────────────────────────────────

declare global {
  interface Window {
    pintrk: PintrkFunction & {
      queue: unknown[];
      loaded?: boolean;
    };
  }
}

type PintrkFunction = (
  command: string,
  eventNameOrTagId?: string,
  params?: Record<string, unknown>,
) => void;

// ─── Pinterest-specific parameter builder ───────────────────────────────────

function buildPinterestParams(event: TrackingEvent): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  // Pinterest dedup via event_id
  params.event_id = event.eventId;

  const ecom = event.ecommerce;
  if (!ecom) return params;

  if (ecom.value !== undefined) params.value = ecom.value;
  if (ecom.currency) params.currency = ecom.currency;
  if (ecom.searchQuery) params.search_query = ecom.searchQuery;
  if (ecom.transactionId) params.order_id = ecom.transactionId;

  if (ecom.items && ecom.items.length > 0) {
    params.line_items = ecom.items.map((i: TrackingProductItem) => ({
      product_id: i.itemId,
      product_name: i.itemName,
      product_price: i.price ?? 0,
      product_quantity: i.quantity ?? 1,
    }));
    params.order_quantity = ecom.items.reduce(
      (sum: number, i: TrackingProductItem) => sum + (i.quantity ?? 1),
      0,
    );
  }

  return params;
}

// ─── Pinterest Tag Adapter ──────────────────────────────────────────────────

const PINTEREST_EVENT_MAP = PLATFORM_EVENT_MAP[PixelPlatform.PINTEREST];

export class PinterestTagAdapter implements PixelAdapter {
  readonly platform = PixelPlatform.PINTEREST;

  private loaded = false;
  private enabled = false;
  private tagId = "";
  private scriptElement: HTMLScriptElement | null = null;

  initialize(config: PixelConfig): void {
    if (typeof window === "undefined") return;
    this.tagId = config.pixelId;
    this.enabled = config.enabled;

    this.injectSdk();
    window.pintrk("load", this.tagId);
    window.pintrk("page");

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
    if (typeof window === "undefined" || !window.pintrk) return;

    const pinterestEventName =
      PINTEREST_EVENT_MAP[event.eventName as TrackingEventName];

    // Page views are handled by pintrk('page') in initialize
    if (
      event.eventName === TrackingEventName.PAGE_VIEWED &&
      pinterestEventName === "pagevisit"
    ) {
      return;
    }

    const params = buildPinterestParams(event);

    if (pinterestEventName) {
      window.pintrk("track", pinterestEventName, params);
    } else {
      window.pintrk("track", event.eventName, params);
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
    if (
      typeof window.pintrk !== "undefined" &&
      typeof window.pintrk === "function" &&
      window.pintrk.loaded
    ) {
      return;
    }

    // Pinterest Tag standard snippet (queue-based)
    const pintrk = function pintrk(...args: unknown[]) {
      (pintrk as PintrkFunction & { queue: unknown[] }).queue.push(args);
    } as PintrkFunction & { queue: unknown[]; loaded?: boolean };
    pintrk.queue = [];

    window.pintrk = pintrk;

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://s.pinimg.com/ct/core.js";
    this.scriptElement = script;

    const firstScript = document.getElementsByTagName("script")[0];
    if (firstScript?.parentNode) {
      firstScript.parentNode.insertBefore(script, firstScript);
    } else {
      document.head.appendChild(script);
    }
  }
}

export { buildPinterestParams };
