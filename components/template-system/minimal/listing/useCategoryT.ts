import { useCallback } from "react";
import { useMinimalI18n } from "#root/lib/i18n/MinimalI18nContext";
import {
  minimalCategoryT,
  type MinimalCategoryKey,
} from "#root/lib/i18n/minimal-category-translations";

/** Listing-page copy in the shopper's language, with `{name}` replacements. */
export function useCategoryT() {
  const { locale } = useMinimalI18n();
  return useCallback(
    (key: MinimalCategoryKey, replacements?: Record<string, string | number>) => {
      const lang = locale === "ar" ? "ar" : "en";
      let value: string = minimalCategoryT[lang][key] ?? key;
      if (replacements) {
        for (const [k, v] of Object.entries(replacements)) {
          value = value.replace(`{${k}}`, String(v));
        }
      }
      return value;
    },
    [locale],
  );
}
