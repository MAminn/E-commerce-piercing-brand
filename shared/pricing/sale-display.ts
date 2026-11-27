/**
 * Sale display — what the storefront shows for a product's price.
 *
 * One rule, derived only from the catalogue's own `price` and `discountPrice`
 * (never from campaign names, SKUs or hardcoded percentages):
 *
 *   - A sale exists only when the discount price is VALID — the same test the
 *     order path charges by (`effectiveUnitPrice`): present, finite, not
 *     negative and strictly below the regular price.
 *   - On sale: show the paid price, the regular price struck through, and the
 *     percentage off.
 *   - Not on sale (no discount, or a misconfigured one at/above the price):
 *     the regular price alone — no strike, no badge.
 *
 * Because it reads the live fields, removing a discount in the dashboard
 * removes the strike and the badge everywhere on the next render.
 *
 * Percentage rounding: the nearest whole percent, halves rounded up, computed
 * in integer minor units so float noise can never tip a value (175 → 123 is
 * 29.71% → "−30%"; 120 → 96 is exactly "−20%"). A real discount that rounds
 * to 0% keeps its struck price but shows no badge.
 */
import { effectiveUnitPrice } from "./effective-price";

export interface SaleDisplay {
  /** What the shopper pays for one unit. */
  paid: number;
  /** The regular price to strike through, or null when not on sale. */
  compareAt: number | null;
  /** Whole percent off (1–100) for the badge, or null for no badge. */
  percentOff: number | null;
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

const toMinor = (amount: number) => Math.round(amount * 100);

/**
 * Whole percent saved going from `original` to `paid`, nearest, halves up.
 * Null when there is no saving, or it rounds to 0%.
 */
export function discountPercent(original: number, paid: number): number | null {
  const o = toMinor(original);
  const p = toMinor(paid);
  if (!(o > 0) || !(p < o) || p < 0) return null;
  // floor((saved * 100 + o / 2) / o) — integer half-up rounding.
  const pct = Math.floor(((o - p) * 100 * 2 + o) / (2 * o));
  return pct >= 1 ? Math.min(pct, 100) : null;
}

/** Sale display for a unit price pair, compared exactly as given. */
export function compareAtDisplay(paid: number, original: number | null | undefined): SaleDisplay {
  if (original === null || original === undefined || !Number.isFinite(original) || !(toMinor(paid) < toMinor(original))) {
    return { paid, compareAt: null, percentOff: null };
  }
  return { paid, compareAt: original, percentOff: discountPercent(original, paid) };
}

/** Sale display for a catalogue product (`price` + `discountPrice`). */
export function saleDisplay(
  price: number | string | null | undefined,
  discountPrice: number | string | null | undefined,
): SaleDisplay {
  const regular = toNumber(price) ?? 0;
  const paid = effectiveUnitPrice(regular, toNumber(discountPrice));
  return paid < regular ? compareAtDisplay(paid, regular) : { paid: regular, compareAt: null, percentOff: null };
}
