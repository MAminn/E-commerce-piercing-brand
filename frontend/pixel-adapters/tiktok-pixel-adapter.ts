import {
  PixelPlatform,
  TrackingEventName,
  PLATFORM_EVENT_MAP,
  type PixelConfig,
  type TrackingEvent,
  type TrackingProductItem,
} from "#root/shared/types/pixel-tracking";
import type { PixelAdapter } from "./types";

// ─── Window augmentation for ttq ────────────────────────────────────────────

declare global {
  interface Window {
    ttq: TtqFunction & {
      _i: Record<string, unknown>;
      _o: Record<string, unknown>;
      methods: string[];
      _t: Record<string, unknown>;
      queue: unknown[];
    };
    TiktokAnalyticsObject: string;
  }
}

type TtqFunction = {
  load: (pixelId: string) => void;
  page: () => void;
  track: (
    eventName: string,
    params?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => void;
  identify: (params: Record<string, unknown>) => void;
  instance: (pixelId: string) => TtqFunction;
};

// ─── TikTok-specific parameter builder ──────────────────────────────────────

function buildTikTokParams(event: TrackingEvent): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const ecom = event.ecommerce;
  if (!ecom) return params;

  if (ecom.value !== undefined) params.value = ecom.value;
  if (ecom.currency) params.currency = ecom.currency;

  if (ecom.items && ecom.items.length > 0) {
    params.contents = ecom.items.map((i: TrackingProductItem) => ({
      content_id: i.itemId,
      content_name: i.itemName,
      content_type: "product",
      quantity: i.quantity ?? 1,
      price: i.price ?? 0,
    }));
    params.content_type = "product";

    const first = ecom.items[0];
    if (first) {
      params.content_id = first.itemId;
      params.content_name = first.itemName;
    }

    params.quantity = ecom.items.reduce(
      (sum: number, i: TrackingProductItem) => sum + (i.quantity ?? 1),
      0,
    );
  }

  if (ecom.searchQuery) params.query = ecom.searchQuery;

  return params;
}

// ─── TikTok Pixel Adapter ───────────────────────────────────────────────────

const TIKTOK_EVENT_MAP = PLATFORM_EVENT_MAP[PixelPlatform.TIKTOK];

export class TikTokPixelAdapter implements PixelAdapter {
  readonly platform = PixelPlatform.TIKTOK;

  private loaded = false;
  private enabled = false;
  private pixelId = "";
  private scriptElement: HTMLScriptElement | null = null;

  initialize(config: PixelConfig): void {
    if (typeof window === "undefined") return;
    this.pixelId = config.pixelId;
    this.enabled = config.enabled;

    this.injectSdk();
    window.ttq.load(this.pixelId);
    window.ttq.page();

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
    if (typeof window === "undefined" || !window.ttq) return;

    const tiktokEventName =
      TIKTOK_EVENT_MAP[event.eventName as TrackingEventName];

    // TikTok page views are handled via ttq.page() in initialize
    if (
      event.eventName === TrackingEventName.PAGE_VIEWED &&
      tiktokEventName === "Pageview"
    ) {
      return; // Already sent during init / page transition is handled by ttq.page()
    }

    const params = buildTikTokParams(event);
    const options: Record<string, unknown> = { event_id: event.eventId };

    if (tiktokEventName) {
      window.ttq.track(tiktokEventName, params, options);
    } else {
      // Custom event
      window.ttq.track(event.eventName, params, options);
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
    if (typeof window.ttq !== "undefined" && typeof window.ttq.load === "function") return;

    // TikTok Pixel standard snippet (queue-based)
    const ttq = Object.assign(
      {} as TtqFunction & {
        _i: Record<string, unknown>;
        _o: Record<string, unknown>;
        methods: string[];
        _t: Record<string, unknown>;
        queue: unknown[];
      },
      {
        _i: {},
        _o: {},
        methods: [
          "page",
          "track",
          "identify",
          "instances",
          "debug",
          "on",
          "off",
          "once",
          "ready",
          "alias",
          "group",
          "enableCookie",
          "disableCookie",
        ],
        _t: {},
        queue: [] as unknown[],
      },
    );

    // Create stub methods that queue calls
    for (const method of ttq.methods) {
      (ttq as unknown as Record<string, (...args: unknown[]) => void>)[method] =
        (...args: unknown[]) => {
          ttq.queue.push([method, ...args]);
        };
    }
    ttq.load = (pixelId: string) => {
      ttq.queue.push(["load", pixelId]);
    };
    ttq.instance = (_pixelId: string) => ttq as unknown as TtqFunction;

    window.ttq = ttq;
    window.TiktokAnalyticsObject = "ttq";

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://analytics.tiktok.com/i18n/pixel/events.js";
    this.scriptElement = script;

    const firstScript = document.getElementsByTagName("script")[0];
    if (firstScript?.parentNode) {
      firstScript.parentNode.insertBefore(script, firstScript);
    } else {
      document.head.appendChild(script);
    }
  }
}

export { buildTikTokParams };
