// ─── Standard E-commerce Tracking Events ───────────────────────────────────
// Superset of all platform event taxonomies (Meta, Google, TikTok, Snapchat, Pinterest)

export enum TrackingEventName {
  PAGE_VIEWED = "page_viewed",
  PRODUCT_VIEWED = "product_viewed",
  PRODUCT_LIST_VIEWED = "product_list_viewed",
  PRODUCT_ADDED_TO_CART = "product_added_to_cart",
  PRODUCT_REMOVED_FROM_CART = "product_removed_from_cart",
  CART_VIEWED = "cart_viewed",
  CHECKOUT_STARTED = "checkout_started",
  CHECKOUT_SHIPPING_SUBMITTED = "checkout_shipping_submitted",
  CHECKOUT_PAYMENT_SUBMITTED = "checkout_payment_submitted",
  CHECKOUT_COMPLETED = "checkout_completed",
  SEARCH_SUBMITTED = "search_submitted",
  REGISTRATION_COMPLETED = "registration_completed",
  LOGIN_COMPLETED = "login_completed",
  PROMO_CODE_APPLIED = "promo_code_applied",
  COLLECTION_VIEWED = "collection_viewed",
  PROMOTION_VIEWED = "promotion_viewed",
  PROMOTION_CLICKED = "promotion_clicked",
  NEWSLETTER_SUBSCRIBED = "newsletter_subscribed",
  CUSTOM_EVENT = "custom_event",
}

// ─── Pixel Platforms ────────────────────────────────────────────────────────

export enum PixelPlatform {
  META = "meta",
  GOOGLE_GA4 = "google_ga4",
  TIKTOK = "tiktok",
  SNAPCHAT = "snapchat",
  PINTEREST = "pinterest",
  CUSTOM = "custom",
  CLARITY = "clarity",
}

// ─── Consent Categories ─────────────────────────────────────────────────────

export type ConsentCategory = "analytics" | "marketing" | "custom";

// ─── E-commerce Event Data ──────────────────────────────────────────────────

export interface TrackingProductItem {
  itemId: string;
  itemName: string;
  price?: number;
  quantity?: number;
  category?: string;
  brand?: string;
  variant?: string;
}

export interface EcommerceEventData {
  currency?: string;
  value?: number;
  items?: TrackingProductItem[];
  transactionId?: string;
  tax?: number;
  shipping?: number;
  coupon?: string;
  searchQuery?: string;
}

// ─── Core Tracking Event ────────────────────────────────────────────────────

export interface TrackingEvent {
  eventId: string;
  eventName: TrackingEventName | string;
  timestamp: number;
  pageUrl: string;
  referrer?: string;
  sessionId: string;
  userId?: string;
  // UTM parameters
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  // E-commerce data
  ecommerce?: EcommerceEventData;
  // Custom properties
  customProperties?: Record<string, unknown>;
}

// ─── Pixel Configuration (mirrors DB shape) ─────────────────────────────────

export interface PixelConfig {
  id: string;
  platform: PixelPlatform;
  pixelId: string;
  accessToken?: string | null;
  enabled: boolean;
  enableClientSide: boolean;
  enableServerSide: boolean;
  consentRequired: boolean;
  consentCategory?: ConsentCategory | null;
  settings?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt?: Date | null;
}

// ─── Platform Event Name Mappings ───────────────────────────────────────────

export const PLATFORM_EVENT_MAP: Record<
  PixelPlatform,
  Partial<Record<TrackingEventName, string>>
> = {
  [PixelPlatform.META]: {
    [TrackingEventName.PAGE_VIEWED]: "PageView",
    [TrackingEventName.PRODUCT_VIEWED]: "ViewContent",
    [TrackingEventName.PRODUCT_LIST_VIEWED]: "ViewContent",
    [TrackingEventName.PRODUCT_ADDED_TO_CART]: "AddToCart",
    [TrackingEventName.PRODUCT_REMOVED_FROM_CART]: "RemoveFromCart",
    [TrackingEventName.CART_VIEWED]: "ViewContent",
    [TrackingEventName.CHECKOUT_STARTED]: "InitiateCheckout",
    [TrackingEventName.CHECKOUT_PAYMENT_SUBMITTED]: "AddPaymentInfo",
    [TrackingEventName.CHECKOUT_COMPLETED]: "Purchase",
    [TrackingEventName.SEARCH_SUBMITTED]: "Search",
    [TrackingEventName.REGISTRATION_COMPLETED]: "CompleteRegistration",
    [TrackingEventName.NEWSLETTER_SUBSCRIBED]: "Lead",
  },
  [PixelPlatform.GOOGLE_GA4]: {
    [TrackingEventName.PAGE_VIEWED]: "page_view",
    [TrackingEventName.PRODUCT_VIEWED]: "view_item",
    [TrackingEventName.PRODUCT_LIST_VIEWED]: "view_item_list",
    [TrackingEventName.PRODUCT_ADDED_TO_CART]: "add_to_cart",
    [TrackingEventName.PRODUCT_REMOVED_FROM_CART]: "remove_from_cart",
    [TrackingEventName.CART_VIEWED]: "view_cart",
    [TrackingEventName.CHECKOUT_STARTED]: "begin_checkout",
    [TrackingEventName.CHECKOUT_SHIPPING_SUBMITTED]: "add_shipping_info",
    [TrackingEventName.CHECKOUT_PAYMENT_SUBMITTED]: "add_payment_info",
    [TrackingEventName.CHECKOUT_COMPLETED]: "purchase",
    [TrackingEventName.SEARCH_SUBMITTED]: "search",
    [TrackingEventName.REGISTRATION_COMPLETED]: "sign_up",
    [TrackingEventName.LOGIN_COMPLETED]: "login",
    [TrackingEventName.PROMO_CODE_APPLIED]: "select_promotion",
  },
  [PixelPlatform.TIKTOK]: {
    [TrackingEventName.PAGE_VIEWED]: "Pageview",
    [TrackingEventName.PRODUCT_VIEWED]: "ViewContent",
    [TrackingEventName.PRODUCT_ADDED_TO_CART]: "AddToCart",
    [TrackingEventName.CHECKOUT_STARTED]: "InitiateCheckout",
    [TrackingEventName.CHECKOUT_PAYMENT_SUBMITTED]: "AddPaymentInfo",
    [TrackingEventName.CHECKOUT_COMPLETED]: "CompletePayment",
    [TrackingEventName.SEARCH_SUBMITTED]: "Search",
    [TrackingEventName.REGISTRATION_COMPLETED]: "CompleteRegistration",
  },
  [PixelPlatform.SNAPCHAT]: {
    [TrackingEventName.PAGE_VIEWED]: "PAGE_VIEW",
    [TrackingEventName.PRODUCT_VIEWED]: "VIEW_CONTENT",
    [TrackingEventName.PRODUCT_LIST_VIEWED]: "LIST_VIEW",
    [TrackingEventName.PRODUCT_ADDED_TO_CART]: "ADD_CART",
    [TrackingEventName.CHECKOUT_STARTED]: "START_CHECKOUT",
    [TrackingEventName.CHECKOUT_COMPLETED]: "PURCHASE",
    [TrackingEventName.SEARCH_SUBMITTED]: "SEARCH",
    [TrackingEventName.REGISTRATION_COMPLETED]: "SIGN_UP",
  },
  [PixelPlatform.PINTEREST]: {
    [TrackingEventName.PAGE_VIEWED]: "pagevisit",
    [TrackingEventName.PRODUCT_VIEWED]: "pagevisit",
    [TrackingEventName.PRODUCT_ADDED_TO_CART]: "addtocart",
    [TrackingEventName.CHECKOUT_STARTED]: "checkout",
    [TrackingEventName.CHECKOUT_COMPLETED]: "checkout",
    [TrackingEventName.SEARCH_SUBMITTED]: "search",
    [TrackingEventName.REGISTRATION_COMPLETED]: "signup",
    [TrackingEventName.NEWSLETTER_SUBSCRIBED]: "lead",
  },
  [PixelPlatform.CUSTOM]: {},
  // Clarity is a session-recording/heatmap tool, not a conversion pixel — it
  // has no standard e-commerce event taxonomy to map into.
  [PixelPlatform.CLARITY]: {},
};

// ─── Custom Event Trigger Types ─────────────────────────────────────────────

export type CustomEventTriggerType =
  | "manual"
  | "css_selector"
  | "url_match"
  | "time_on_page";

export interface CssSelectorTriggerConfig {
  selector: string;
}

export interface UrlMatchTriggerConfig {
  pattern: string; // regex pattern
}

export interface TimeOnPageTriggerConfig {
  seconds: number;
}

export type TriggerConfig =
  | CssSelectorTriggerConfig
  | UrlMatchTriggerConfig
  | TimeOnPageTriggerConfig
  | Record<string, unknown>; // manual has empty config

export interface CustomTrackingEventConfig {
  id: string;
  name: string;
  displayName: string;
  description?: string | null;
  triggerType: CustomEventTriggerType;
  triggerConfig: TriggerConfig;
  eventData: Record<string, unknown>;
  platformMapping: Record<string, string>;
  isActive: boolean;
  createdAt: Date;
  updatedAt?: Date | null;
}

// ─── Attribution Types ──────────────────────────────────────────────────────

export type AttributionChannel =
  | "organic"
  | "paid_meta"
  | "paid_google"
  | "paid_tiktok"
  | "paid_snapchat"
  | "paid_pinterest"
  | "direct"
  | "email"
  | "referral"
  | "social";

export type AttributionModel = "first_touch" | "last_touch" | "linear";

export interface AttributionTouchpointData {
  id: string;
  sessionId: string;
  userId?: string | null;
  channel: AttributionChannel;
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  term?: string | null;
  content?: string | null;
  landingPage?: string | null;
  referrer?: string | null;
  clickId?: string | null;
  clickIdType?: string | null;
  createdAt: Date;
}

export interface AttributionResult {
  channel: AttributionChannel;
  credit: number; // 0-1 fraction
  touchpointId: string;
}

// ─── Consent Types ──────────────────────────────────────────────────────────

export type ConsentMethodType =
  | "banner_accept"
  | "banner_reject"
  | "settings_page"
  | "implied";

export interface ConsentCategories {
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
}

export interface ConsentState {
  given: boolean;
  categories: ConsentCategories;
  method: ConsentMethodType;
  expiresAt?: Date | null;
}

// ─── UTM / Click ID Types ───────────────────────────────────────────────────

export interface UtmData {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
}

export interface ClickIds {
  fbclid?: string;
  gclid?: string;
  ttclid?: string;
  ScCid?: string;
  epik?: string;
}

export const CLICK_ID_PLATFORM_MAP: Record<string, PixelPlatform> = {
  fbclid: PixelPlatform.META,
  gclid: PixelPlatform.GOOGLE_GA4,
  ttclid: PixelPlatform.TIKTOK,
  ScCid: PixelPlatform.SNAPCHAT,
  epik: PixelPlatform.PINTEREST,
};

// ─── Engagement Event Types ─────────────────────────────────────────────────

export type ScrollDepthThreshold = 25 | 50 | 75 | 90;

export const SCROLL_DEPTH_THRESHOLDS: ScrollDepthThreshold[] = [25, 50, 75, 90];

export const TIME_ON_PAGE_INTERVALS = [30, 60, 120, 300] as const;
