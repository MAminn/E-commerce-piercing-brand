/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE money formatter — Egyptian pounds, one way, everywhere.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every customer-facing price (cards, product page, cart, checkout, order
 * confirmation, account, emails, sticky bars, search dropdown, bundles) and
 * every admin money figure goes through `formatMoney`. Before this existed the
 * same amount was rendered a dozen different ways — `270.00 EGP`, `EGP 270.00`,
 * `EGP270.00`, `270 SAR` (a leftover from a template this shop was copied
 * from), `$270` — depending on which component happened to render it.
 *
 * Rules:
 *   - Amounts are ALREADY Egyptian pounds. This formats; it never converts.
 *   - Whole pounds render without decimals ("EGP 270"): catalogue and bundle
 *     prices are whole-pound commercial amounts (270 / 340 / 480) and the
 *     storefront should read that way. A genuinely fractional amount keeps two
 *     decimals ("EGP 12.25") so totals never lose piasters.
 *   - Formatting is delegated to Intl.NumberFormat with the store locale
 *     (`en-EG`), which is what the brand asked for. Arabic UI uses `ar-EG`
 *     with Latin digits so a price reads the same in both languages and next
 *     to the same product photo.
 */

import { STORE_CURRENCY, STORE_LOCALE } from "#root/shared/config/branding";

export type MoneyLocale = "en" | "ar";

export interface FormatMoneyOptions {
  /** UI language. Defaults to English. */
  locale?: MoneyLocale;
  /** ISO 4217 code. Defaults to STORE_CURRENCY (EGP). */
  currency?: string;
  /**
   * Force two decimals even for whole amounts. Use in tabular contexts
   * (admin order lines, invoices) where columns should align.
   */
  alwaysShowFraction?: boolean;
}

const formatterCache = new Map<string, Intl.NumberFormat>();

/** U+00A0 — the same joiner Intl emits between code and amount. */
const NO_BREAK_SPACE = String.fromCharCode(0xa0);

function resolveLocaleTag(locale: MoneyLocale): string {
  // `-u-nu-latn` keeps Western Arabic digits in the Arabic UI: prices must
  // match what is printed on the product card, the invoice and the courier
  // slip, all of which use 0-9.
  return locale === "ar" ? "ar-EG-u-nu-latn" : STORE_LOCALE;
}

function getFormatter(
  locale: MoneyLocale,
  currency: string,
  fractionDigits: 0 | 2,
): Intl.NumberFormat {
  const key = `${locale}|${currency}|${fractionDigits}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(resolveLocaleTag(locale), {
      style: "currency",
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    formatterCache.set(key, formatter);
  }
  return formatter;
}

/**
 * Coerces whatever a price column, DTO or form field hands us into a finite
 * number of pounds. Postgres `numeric` arrives as a string; a blank or
 * missing value is treated as zero rather than rendering "NaN".
 */
export function toMoneyNumber(amount: number | string | null | undefined): number {
  if (typeof amount === "number") return Number.isFinite(amount) ? amount : 0;
  if (typeof amount === "string" && amount.trim() !== "") {
    const parsed = Number(amount);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/**
 * Formats an amount of Egyptian pounds for display.
 *
 *   formatMoney(270)            → "EGP 270"
 *   formatMoney(1234.5)         → "EGP 1,234.50"
 *   formatMoney("480.00")       → "EGP 480"
 *   formatMoney(270, { locale: "ar" }) → "270 ج.م."  (with bidi marks)
 */
export function formatMoney(
  amount: number | string | null | undefined,
  options: FormatMoneyOptions = {},
): string {
  const { locale = "en", currency = STORE_CURRENCY, alwaysShowFraction = false } = options;
  // Round to piasters first so 12.499999 does not decide it "has a fraction".
  const value = Math.round(toMoneyNumber(amount) * 100) / 100;
  const fractionDigits: 0 | 2 =
    alwaysShowFraction || !Number.isInteger(value) ? 2 : 0;
  return getFormatter(locale, currency, fractionDigits).format(value);
}

/**
 * Compact figure for dashboard tiles ("EGP 12.4K"). Never used on the
 * storefront — customers always see the exact amount.
 */
export function formatMoneyCompact(
  amount: number | string | null | undefined,
  options: Pick<FormatMoneyOptions, "currency"> = {},
): string {
  const value = toMoneyNumber(amount);
  if (Math.abs(value) < 1000) return formatMoney(value, options);
  const { currency = STORE_CURRENCY } = options;
  const compact = new Intl.NumberFormat(STORE_LOCALE, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
  // Same no-break space Intl uses, so compact and exact figures align.
  return `${currency}${NO_BREAK_SPACE}${compact}`;
}
