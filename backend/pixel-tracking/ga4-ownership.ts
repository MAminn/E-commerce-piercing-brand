import { TrackingEventName } from "#root/shared/types/pixel-tracking";

/**
 * GA4 event ownership (G1) — who sends each logical event to GA4.
 *
 * Every storefront event is emitted ONCE in the browser and fans out to two
 * places: the browser gtag (GoogleGA4Adapter) and the /api/track beacon. The
 * beacon used to be mirrored to GA4 again through the Measurement Protocol
 * (googleMPAdapter) whenever the GA4 row had "server-side" on with an API
 * secret. Unlike Meta (event_id), GA4 does NOT merge a browser hit and an MP
 * hit into one event — so every page_view / view_item / add_to_cart /
 * begin_checkout / scroll_depth / … was counted twice (seen in production:
 * 2 server add_to_cart → 4 in GA4 Realtime).
 *
 * Ownership after G1: the BROWSER owns every GA4 event, purchase included.
 *   - page_view, view_item, view_item_list, add_to_cart, remove_from_cart,
 *     view_cart, begin_checkout, add_shipping_info, add_payment_info,
 *     purchase, search, sign_up, login, select_promotion and custom events
 *     (scroll_depth, time_on_page, …) → gtag only.
 *   - purchase stays browser-owned too: gtag sends it with
 *     transaction_id = order id on /order-confirmation, once per order
 *     (frontend/tracking/purchase-event.ts), inside the visitor's own GA4
 *     session — the attribution Black Friday reporting relies on. A second
 *     MP copy would depend on GA4's transaction_id de-duplication, which
 *     Google applies in processing only (Realtime/DebugView still show two)
 *     and does not guarantee for browser + MP pairs.
 *   - The SERVER sends nothing to GA4 (GA4_MP_MODE=off, the default).
 *
 * Unaffected: Meta CAPI and the other server adapters (they de-duplicate by
 * event_id), and the tracking_event table (internal analytics) — every event
 * is still stored once.
 *
 * GA4_MP_MODE (server env):
 *   off        (default, also any unknown value) — no GA4 Measurement Protocol
 *   legacy_all — the pre-G1 mirror of every beaconed event. Double counts in
 *                GA4. Kept only as an emergency rollback switch.
 */
export type Ga4MpMode = "off" | "legacy_all";

export function readGa4MpMode(env: Record<string, string | undefined> = process.env): Ga4MpMode {
  const v = (env.GA4_MP_MODE ?? "").trim().toLowerCase();
  return v === "legacy_all" ? "legacy_all" : "off";
}

/** The side that sends each GA4 event to Google. */
export type Ga4Owner = "browser" | "server";

/** Explicit per-event ownership — every mapped GA4 event is browser-owned. */
export const GA4_EVENT_OWNER: Readonly<Partial<Record<TrackingEventName, Ga4Owner>>> = {
  [TrackingEventName.PAGE_VIEWED]: "browser",
  [TrackingEventName.PRODUCT_VIEWED]: "browser",
  [TrackingEventName.PRODUCT_LIST_VIEWED]: "browser",
  [TrackingEventName.PRODUCT_ADDED_TO_CART]: "browser",
  [TrackingEventName.PRODUCT_REMOVED_FROM_CART]: "browser",
  [TrackingEventName.CART_VIEWED]: "browser",
  [TrackingEventName.CHECKOUT_STARTED]: "browser",
  [TrackingEventName.CHECKOUT_SHIPPING_SUBMITTED]: "browser",
  [TrackingEventName.CHECKOUT_PAYMENT_SUBMITTED]: "browser",
  [TrackingEventName.CHECKOUT_COMPLETED]: "browser",
  [TrackingEventName.SEARCH_SUBMITTED]: "browser",
  [TrackingEventName.REGISTRATION_COMPLETED]: "browser",
  [TrackingEventName.LOGIN_COMPLETED]: "browser",
  [TrackingEventName.PROMO_CODE_APPLIED]: "browser",
};

/** Unmapped / custom events (scroll_depth, time_on_page, …) are browser-owned too. */
export function ga4OwnerOf(eventName: string): Ga4Owner {
  return GA4_EVENT_OWNER[eventName as TrackingEventName] ?? "browser";
}

/**
 * Whether the server relays this batch to GA4 at all. With browser ownership
 * of every event, only the legacy rollback mode does.
 */
export function shouldServerSendToGa4(mode: Ga4MpMode = readGa4MpMode()): boolean {
  return mode === "legacy_all";
}
