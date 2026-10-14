import {
  PixelPlatform,
  TrackingEventName,
  PLATFORM_EVENT_MAP,
  type PixelConfig,
  type TrackingEvent,
  type TrackingProductItem,
} from "#root/shared/types/pixel-tracking";
import type { PixelAdapter } from "./types";

// ─── Window augmentation for fbq ────────────────────────────────────────────

declare global {
  interface Window {
    fbq: FbqFunction & { callMethod?: (...args: unknown[]) => void; queue: unknown[] };
    _fbq: Window["fbq"];
  }
}

type FbqFunction = (
  command: string,
  eventNameOrPixelId: string,
  params?: Record<string, unknown>,
  options?: Record<string, unknown>,
) => void;

// ─── Meta-specific parameter builder ────────────────────────────────────────

function buildMetaParams(event: TrackingEvent): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const ecom = event.ecommerce;
  if (!ecom) return params;

  if (ecom.value !== undefined) params.value = ecom.value;
  if (ecom.currency) params.currency = ecom.currency;
  if (ecom.searchQuery) params.search_string = ecom.searchQuery;

  if (ecom.items && ecom.items.length > 0) {
    params.content_ids = ecom.items.map((i: TrackingProductItem) => i.itemId);
    params.contents = ecom.items.map((i: TrackingProductItem) => ({
      id: i.itemId,
      quantity: i.quantity ?? 1,
    }));
    params.content_type = "product";

    // Use the first item's category/name as top-level fields (Meta convention)
    const first = ecom.items[0];
    if (first?.category) params.content_category = first.category;
    if (first?.itemName) params.content_name = first.itemName;

    // num_items = sum of all item quantities (or count if no quantities)
    params.num_items = ecom.items.reduce(
      (sum: number, i: TrackingProductItem) => sum + (i.quantity ?? 1),
      0,
    );
  }

  return params;
}

// ─── Purchase: an explicit, validated payload ───────────────────────────────

/**
 * Meta drops a Purchase whose `currency` is not an exact ISO 4217 code
 * ("Parameter 'currency' is invalid for event 'Purchase'") or whose `value`
 * is not a number. The store charges every order in Egyptian pounds, so the
 * Purchase currency is fixed here rather than trusted from the event, which
 * could carry a build-time env value, a display label or a localized symbol.
 */
export const META_PURCHASE_CURRENCY = "EGP";

/** A plain number of pounds (2 dp), or null for anything that is not one. */
export function toMetaValue(raw: unknown): number | null {
  const value =
    typeof raw === "number" ? raw : typeof raw === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100) / 100;
}

/**
 * The literal Purchase parameters: the shared ecommerce fields (content ids,
 * contents with quantities, num_items) plus a numeric `value`, currency
 * "EGP" and the order id. Null when there is no usable value — Meta would
 * reject that Purchase anyway.
 */
export function buildMetaPurchaseParams(event: TrackingEvent): Record<string, unknown> | null {
  const value = toMetaValue(event.ecommerce?.value);
  if (value === null) return null;
  const params: Record<string, unknown> = {
    ...buildMetaParams(event),
    value,
    currency: META_PURCHASE_CURRENCY,
  };
  if (event.ecommerce?.transactionId) params.order_id = event.ecommerce.transactionId;
  return params;
}

// ─── Meta Pixel Adapter ─────────────────────────────────────────────────────

const META_EVENT_MAP = PLATFORM_EVENT_MAP[PixelPlatform.META];

export class MetaPixelAdapter implements PixelAdapter {
  readonly platform = PixelPlatform.META;

  private loaded = false;
  private enabled = false;
  private pixelId = "";
  private scriptElement: HTMLScriptElement | null = null;

  initialize(config: PixelConfig): void {
    if (typeof window === "undefined") return;
    this.pixelId = config.pixelId;
    this.enabled = config.enabled;

    // Inject Meta's fbevents.js snippet
    this.injectSdk();

    // Init the pixel
    window.fbq("init", this.pixelId);

    this.loaded = true;
  }

  destroy(): void {
    // Remove injected script element
    if (this.scriptElement?.parentNode) {
      this.scriptElement.parentNode.removeChild(this.scriptElement);
      this.scriptElement = null;
    }
    this.loaded = false;
    this.enabled = false;
  }

  trackEvent(event: TrackingEvent): void {
    if (!this.loaded || !this.enabled) return;
    if (typeof window === "undefined" || typeof window.fbq !== "function") return;

    const metaEventName = META_EVENT_MAP[event.eventName as TrackingEventName];

    // Attach eventId for server-side deduplication (Conversions API Phase 3)
    const options: Record<string, unknown> = { eventID: event.eventId };

    if (metaEventName === "Purchase") {
      const purchase = buildMetaPurchaseParams(event);
      if (purchase) window.fbq("track", "Purchase", purchase, options);
      return;
    }

    // The order's one Purchase comes from checkout_completed above. A custom
    // event that happens to be named "Purchase" would reach Meta as a second,
    // unvalidated Purchase with no value or currency — never send it.
    if (!metaEventName && event.eventName.trim().toLowerCase() === "purchase") return;

    const params = buildMetaParams(event);
    if (metaEventName) {
      // Standard Meta event
      window.fbq("track", metaEventName, params, options);
    } else {
      // Custom event — use trackCustom
      window.fbq("trackCustom", event.eventName, params, options);
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
    // Standard Meta Pixel initialization (adapted from their snippet)
    // Only inject if fbq doesn't already exist
    if (typeof window.fbq === "function") return;

    const queue: unknown[] = [];
    const fbq: Window["fbq"] = Object.assign(
      (...args: unknown[]) => {
        if (fbq.callMethod) {
          fbq.callMethod(...args);
        } else {
          fbq.queue.push(args);
        }
      },
      { callMethod: undefined as ((...a: unknown[]) => void) | undefined, queue },
    );

    window.fbq = fbq;
    window._fbq = fbq;

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    this.scriptElement = script;

    const firstScript = document.getElementsByTagName("script")[0];
    if (firstScript?.parentNode) {
      firstScript.parentNode.insertBefore(script, firstScript);
    } else {
      document.head.appendChild(script);
    }
  }
}
