import type { LayoutSettings } from "#root/shared/types/layout-settings";
import { DEFAULT_NAVBAR_STYLE } from "#root/shared/config/storefront";

/**
 * Whether the server should render the document in Arabic: exactly the rule
 * MinimalI18nProvider applies on the client (layouts/LayoutDefault.tsx) —
 * the Percé (minimal) shell is active AND the `minimal-locale=ar` cookie was
 * sent (server.ts → pageContext.ssrLocale). Used by +lang.ts and
 * +htmlAttributes.ts so `<html lang="ar" dir="rtl">` is in the raw HTML
 * instead of appearing only after hydration. English is unchanged.
 */
export function isArabicDocument(pageContext: {
  ssrLocale?: "en" | "ar";
  layoutSettingsData?: LayoutSettings;
}): boolean {
  const navbarStyle = pageContext.layoutSettingsData?.header?.navbarStyle ?? DEFAULT_NAVBAR_STYLE;
  return pageContext.ssrLocale === "ar" && navbarStyle === "minimal";
}
