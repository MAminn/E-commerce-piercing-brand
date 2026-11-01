/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Percé PROMOTIONAL LAYER — one switch, OFF.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Infrastructure for a campaign period (e.g. Black Friday) in the Object
 * Index language, with no offer, price or copy of its own:
 *
 *   - AnnouncementBar   32px ink bar above the header, one message, no
 *                       carousel / countdown / marquee (height reserved in
 *                       the server render).
 *   - OfferBlock        a 1px ink-ruled text block under the homepage hero.
 *   - BundleEntryTile   a product-card-sized tile leading the listing grid
 *                       into a live Pick Your Set campaign.
 *   - PdpBundleLink     a text link on a product page, only when that
 *                       product is in a live Pick Your Set pool.
 *
 * Compare-at prices need nothing here: the product card, PDP, cart and
 * checkout already show a struck-through price only when the catalogue holds
 * a real, higher previous price. There are no sale badges, percentage
 * overlays or red promotional UI anywhere.
 *
 * Nothing renders — and nothing is fetched — while `enabled` is false. The
 * bundle tile and PDP link additionally need a live Pick Your Set campaign
 * (the existing Pick 3 / Pick 6 configuration); this file never turns one on.
 * The announcement and offer texts are empty on purpose: they are business
 * decisions, written here (EN + AR) only once approved.
 */

export interface PromoMessage {
  text: string;
  textAr?: string;
  /** Optional destination; the message is plain text without one. */
  href?: string;
}

export interface PromoOffer {
  title: string;
  titleAr?: string;
  body?: string;
  bodyAr?: string;
  href?: string;
  linkLabel?: string;
  linkLabelAr?: string;
}

export interface PromoLayerConfig {
  /** The one switch for the whole layer. */
  enabled: boolean;
  announcement: PromoMessage | null;
  offer: PromoOffer | null;
  /** Lead the /shop and category grids with a Pick Your Set tile. */
  bundleEntryTile: boolean;
  /** Link an eligible product's page to its Pick Your Set campaign. */
  pdpBundleLink: boolean;
}

export const PROMO_LAYER: PromoLayerConfig = {
  enabled: false,
  announcement: null,
  offer: null,
  bundleEntryTile: true,
  pdpBundleLink: true,
};

/** Whether the layer is on at all. */
export function isPromoLayerOn(config: PromoLayerConfig = PROMO_LAYER): boolean {
  return config.enabled === true;
}

/** The announcement to show, or null — off, or no approved text. */
export function activeAnnouncement(config: PromoLayerConfig = PROMO_LAYER): PromoMessage | null {
  if (!isPromoLayerOn(config)) return null;
  return config.announcement?.text?.trim() ? config.announcement : null;
}

/** The offer block to show, or null — off, or no approved title. */
export function activeOffer(config: PromoLayerConfig = PROMO_LAYER): PromoOffer | null {
  if (!isPromoLayerOn(config)) return null;
  return config.offer?.title?.trim() ? config.offer : null;
}
