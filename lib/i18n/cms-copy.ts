import type { Locale } from "./translations";

/**
 * Homepage section titles and CTA labels come from the CMS, which stores most
 * of them in English only (`title`, `viewAllText`, the hero `ctaText`) with
 * an optional Arabic field beside some of them. The Arabic storefront used to
 * fall straight back to the English value, so "Shop by placement",
 * "Featured", "New in", "View all", "Shop all" stayed English in RTL.
 *
 * Resolution, Arabic:
 *   1. the merchant's own Arabic field, when set;
 *   2. the interface translation, when the English value is one of the
 *      store's standard labels (the defaults in DEFAULT_HOMEPAGE_CONTENT and
 *      the navigation) — these are UI chrome, not merchant copy;
 *   3. otherwise the merchant's English text, as written. Custom copy is
 *      never machine-translated; an admin can add the Arabic field instead.
 *   4. an empty CMS value falls back to `fallbackKey`'s translation.
 * English is unchanged: the CMS value, else `fallbackKey`.
 */
const STANDARD_LABELS: Record<string, string> = {
  "shop all": "home.shop_all",
  "shop all pieces": "home.shop_all_pieces",
  "shop by placement": "home.shop_by_placement",
  "view all products": "home.view_all_products",
  featured: "featured",
  "new in": "new_arrivals",
  "view all": "view_all",
  offers: "on_sale",
  "shop now": "shop_now",
  sets: "bundles.section_default_title",
  "view all sets": "bundles.view_all",
};

export function standardLabelKey(text: string | null | undefined): string | null {
  const normalized = (text ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return STANDARD_LABELS[normalized] ?? null;
}

export function localizeCmsLabel(
  locale: Locale,
  t: (key: string) => string,
  value: { en?: string | null; ar?: string | null },
  fallbackKey?: string,
): string {
  const en = value.en?.trim() ?? "";
  if (locale === "ar") {
    const ar = value.ar?.trim();
    if (ar) return ar;
    if (!en) return fallbackKey ? t(fallbackKey) : "";
    const key = standardLabelKey(en);
    return key ? t(key) : en;
  }
  return en || (fallbackKey ? t(fallbackKey) : "");
}
