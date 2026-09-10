import {
  PixelPlatform,
  TrackingEventName,
  PLATFORM_EVENT_MAP,
  type PixelConfig,
  type TrackingEvent,
  type TrackingProductItem,
} from "#root/shared/types/pixel-tracking";
import type { PixelAdapter } from "./types";

// ─── Window augmentation for snaptr ─────────────────────────────────────────

declare global {
  interface Window {
    snaptr: SnaptrFunction & {
      _: unknown[];
      handleRequest?: (...args: unknown[]) => void;
    };
  }
}

type SnaptrFunction = (
  command: string,
  eventNameOrPixelId: string,
  params?: Record<string, unknown>,
) => void;

// ─── Snapchat-specific parameter builder ────────────────────────────────────

function buildSnapchatParams(event: TrackingEvent): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  // Snapchat dedup — always include
  params.client_dedup_id = event.eventId;

  const ecom = event.ecommerce;
  if (!ecom) return params;

  if (ecom.value !== undefined) params.price = String(ecom.value);
  if (ecom.currency) params.currency = ecom.currency;
  if (ecom.searchQuery) params.search_string = ecom.searchQuery;
  if (ecom.transactionId) params.transaction_id = ecom.transactionId;

  if (ecom.items && ecom.items.length > 0) {
    params.item_ids = ecom.items.map((i: TrackingProductItem) => i.itemId);
    params.number_items = String(
      ecom.items.reduce(
        (sum: number, i: TrackingProductItem) => sum + (i.quantity ?? 1),
        0,
      ),
    );
  }

  return params;
}

// ─── Snapchat Pixel Adapter ─────────────────────────────────────────────────

const SNAPCHAT_EVENT_MAP = PLATFORM_EVENT_MAP[PixelPlatform.SNAPCHAT];

export class SnapchatPixelAdapter implements PixelAdapter {
  readonly platform = PixelPlatform.SNAPCHAT;

  private loaded = false;
  private enabled = false;
  private pixelId = "";
  private scriptElement: HTMLScriptElement | null = null;

  initialize(config: PixelConfig): void {
    if (typeof window === "undefined") return;
    this.pixelId = config.pixelId;
    this.enabled = config.enabled;

    this.injectSdk();
    window.snaptr("init", this.pixelId);
    window.snaptr("track", "PAGE_VIEW");

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
    if (typeof window === "undefined" || !window.snaptr) return;

    const snapEventName =
      SNAPCHAT_EVENT_MAP[event.eventName as TrackingEventName];

    // Page views are handled in initialize
    if (
      event.eventName === TrackingEventName.PAGE_VIEWED &&
      snapEventName === "PAGE_VIEW"
    ) {
      return;
    }

    const params = buildSnapchatParams(event);

    if (snapEventName) {
      window.snaptr("track", snapEventName, params);
    } else {
      window.snaptr("track", event.eventName, params);
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
      typeof window.snaptr !== "undefined" &&
      typeof window.snaptr === "function" &&
      window.snaptr.handleRequest
    ) {
      return;
    }

    // Snapchat Pixel standard snippet (queue-based)
    const snaptr = function snaptr(...args: unknown[]) {
      if ((snaptr as SnaptrFunction & { handleRequest?: (...a: unknown[]) => void }).handleRequest) {
        (snaptr as SnaptrFunction & { handleRequest: (...a: unknown[]) => void }).handleRequest(...args);
      } else {
        (snaptr as SnaptrFunction & { _: unknown[] })._.push(args);
      }
    } as SnaptrFunction & { _: unknown[]; handleRequest?: (...a: unknown[]) => void };
    snaptr._ = [];

    window.snaptr = snaptr;

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://sc-static.net/scevent.min.js";
    this.scriptElement = script;

    const firstScript = document.getElementsByTagName("script")[0];
    if (firstScript?.parentNode) {
      firstScript.parentNode.insertBefore(script, firstScript);
    } else {
      document.head.appendChild(script);
    }
  }
}

export { buildSnapchatParams };
