/**
 * Small presentation helpers shared by every bundle surface (card, builder,
 * curated detail, sections). Kept out of the components so the same string
 * interpolation and image resolution can't drift between placements.
 */

import { formatMoney as formatStoreMoney } from "#root/shared/pricing/format-money";

export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}

/**
 * Bundle surfaces format money exactly like the rest of the storefront.
 * Kept as a named export so the existing call sites (which pass the store
 * currency explicitly) do not change.
 */
export function formatMoney(amount: number, currency: string): string {
  return formatStoreMoney(amount, { currency });
}

/** Uploads are stored as bare disknames; anything already absolute is left alone. */
export function resolveBundleImage(url: string | null | undefined): string {
  if (!url) return "/assets/placeholder-product.png";
  if (url.startsWith("http") || url.startsWith("/")) return url;
  return `/uploads/${url}`;
}

export function bundleHref(slug: string): string {
  return `/bundles/${encodeURIComponent(slug)}`;
}

/** The tier facts a card needs. Structurally compatible with `BundleTierDto`. */
export interface BundleCardTier {
  quantity: number;
  price: number;
}

/**
 * THE pricing summary for a multi-tier Build Your Stack campaign, used by
 * every discovery surface (the `/bundles` grid, the homepage rail, category
 * rails, both landing templates) through `BundleCampaignCard`. Kept here so no
 * surface invents its own wording.
 *
 * Returns null for a campaign with zero or one tier: that case keeps the
 * stronger, concrete pre-Phase-5 message ("Choose any 6 for 480.00 EGP"),
 * which is still completely accurate.
 *
 * For several tiers a card cannot honestly claim one quantity or one price, so
 * it states the span and the cheapest entry price. The "from" figure is the
 * LOWEST PRICE, not the smallest quantity — a merchant may price 6 below 2x3,
 * and "from" must never quote a number the shopper cannot actually pay. No
 * tier is labelled best value; that is merchandising, not pricing.
 */
export function summarizeBundleTiers(
  tiers: readonly BundleCardTier[],
  currency: string,
  t: (key: string) => string,
): { price: string; sizes: string } | null {
  if (tiers.length < 2) return null;
  const sorted = [...tiers].sort((a, b) => a.quantity - b.quantity);
  const smallest = sorted[0];
  const largest = sorted[sorted.length - 1];
  if (smallest === undefined || largest === undefined) return null;
  const cheapest = sorted.reduce((a, b) =>
    Math.round(b.price * 100) < Math.round(a.price * 100) ? b : a,
  );
  return {
    price: fillTemplate(t("bundles.from_price"), { price: formatMoney(cheapest.price, currency) }),
    sizes: fillTemplate(t("bundles.tier_range"), { min: smallest.quantity, max: largest.quantity }),
  };
}
