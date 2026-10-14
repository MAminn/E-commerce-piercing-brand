import type { Locale } from "./translations";

/**
 * "1 item" / "6 items" · "قطعة واحدة" / "قطعتان" / "6 قطع" / "11 قطعة".
 *
 * Arabic has six plural forms, so the label is picked by the locale's plural
 * category (`cart.item_count_<category>`), falling back to `_other`. The count
 * is always a number, never empty — the cart title used to be able to read
 * "( ITEM )".
 */
export function formatItemCount(count: number, locale: Locale, t: (key: string) => string): string {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  let category = "other";
  try {
    category = new Intl.PluralRules(locale).select(n);
  } catch {
    category = n === 1 ? "one" : "other";
  }
  const key = `cart.item_count_${category}`;
  const template = t(key);
  const resolved = template === key ? t("cart.item_count_other") : template;
  return resolved.replace("{count}", String(n));
}
