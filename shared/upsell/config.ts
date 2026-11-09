/**
 * Upsell configuration — the single source of truth for how a product's
 * recommendations are chosen.
 *
 * A product carries one `upsell_mode`:
 *
 *  - `global`   — follow the store-wide default (random recommendations).
 *                 Every existing and new product starts here, so the owner
 *                 never has to configure products one by one.
 *  - `manual`   — show exactly the products the admin picked, in their order.
 *                 The list is the product's existing curated add-ons
 *                 (`best_layered_with_ids`); no second relation exists.
 *  - `disabled` — no upsell for this product anywhere.
 *
 * The store-wide switches live in `store_settings.upsell_config`. A row saved
 * before a field existed inherits that field's default here, so new fields
 * never need a data migration.
 *
 * This is a recommendation system only. Nothing here touches prices,
 * discounts, promo codes, offers or checkout.
 */

export const UPSELL_MODES = ["global", "manual", "disabled"] as const;
export type UpsellMode = (typeof UPSELL_MODES)[number];

/**
 * Which products the random (global) mode may draw from.
 *
 *  - `any`              — every eligible product in the catalogue.
 *  - `other-categories` — only products sharing no category with the current
 *                         one (e.g. a chain on an earring page).
 *  - `same-category`    — only products sharing a category with it.
 */
export const UPSELL_RANDOM_POOLS = [
  "any",
  "other-categories",
  "same-category",
] as const;
export type UpsellRandomPool = (typeof UPSELL_RANDOM_POOLS)[number];

export const UPSELL_MIN_ITEMS = 1;
export const UPSELL_MAX_ITEMS = 6;

export interface UpsellSettings {
  /** Master switch. Off = no upsells anywhere and the legacy add-ons strip returns. */
  enabled: boolean;
  /** Compact block next to the product page's purchase controls. */
  productPageEnabled: boolean;
  /** Modal / bottom sheet after the main product is added to the bag. */
  postAddEnabled: boolean;
  /** How many recommendations each surface shows. */
  maxItems: number;
  /** Eligibility rule for random recommendations. */
  randomPool: UpsellRandomPool;
}

/**
 * Upsells ship OFF. A store with no saved `upsell_config` (every store at
 * deploy time) shows no upsells and keeps its legacy add-ons strip until the
 * owner switches the feature on in Settings → Upsells and saves. The other
 * defaults only take effect once that happens.
 */
export const DEFAULT_UPSELL_SETTINGS: UpsellSettings = {
  enabled: false,
  productPageEnabled: true,
  postAddEnabled: true,
  maxItems: 3,
  randomPool: "any",
};

export function isUpsellMode(value: unknown): value is UpsellMode {
  return (
    typeof value === "string" &&
    (UPSELL_MODES as readonly string[]).includes(value)
  );
}

/** Unknown / missing values fall back to `global`, the safe default. */
export function normalizeUpsellMode(value: unknown): UpsellMode {
  return isUpsellMode(value) ? value : "global";
}

/**
 * Merges a stored (possibly partial, possibly hand-edited) config over the
 * defaults, discarding anything out of range rather than trusting it.
 */
export function normalizeUpsellSettings(raw: unknown): UpsellSettings {
  const src =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const bool = (key: keyof UpsellSettings) =>
    typeof src[key] === "boolean"
      ? (src[key] as boolean)
      : (DEFAULT_UPSELL_SETTINGS[key] as boolean);

  const rawMax = src.maxItems;
  const maxItems =
    typeof rawMax === "number" && Number.isFinite(rawMax)
      ? Math.min(
          UPSELL_MAX_ITEMS,
          Math.max(UPSELL_MIN_ITEMS, Math.floor(rawMax)),
        )
      : DEFAULT_UPSELL_SETTINGS.maxItems;

  const randomPool = (UPSELL_RANDOM_POOLS as readonly string[]).includes(
    src.randomPool as string,
  )
    ? (src.randomPool as UpsellRandomPool)
    : DEFAULT_UPSELL_SETTINGS.randomPool;

  return {
    enabled: bool("enabled"),
    productPageEnabled: bool("productPageEnabled"),
    postAddEnabled: bool("postAddEnabled"),
    maxItems,
    randomPool,
  };
}
