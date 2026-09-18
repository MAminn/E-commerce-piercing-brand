/**
 * Bundle sales analytics — pure domain, no I/O.
 *
 * ── What counts as a bundle sale ────────────────────────────────────────────
 *
 * The commercial source of truth is the ORDER, never a tracking event:
 *
 *     order  +  order_bundle  +  bundle child order_item rows
 *
 * `order_bundle` is an immutable snapshot of one purchased bundle instance
 * (see the table comment in the schema and shared/bundles/order-grouping.ts).
 * It records the campaign's identity AS SOLD, the tier quantity as sold and —
 * the part that matters for money — `bundleTotal`, what the shopper was
 * actually charged, plus `regularTotal`, what the children would have cost
 * separately. Analytics reads those columns and nothing else: repricing a
 * tier, renaming a campaign or deleting it outright can never rewrite a past
 * sale.
 *
 * ── No double counting ──────────────────────────────────────────────────────
 *
 * A bundle's children are ordinary `order_item` rows carrying the products'
 * REGULAR prices, which the shopper did not pay. Bundle revenue is therefore
 * Σ `order_bundle.bundleTotal` and never touches child prices. A stack
 * charged 480 whose children list at 600 contributes 480 — not 600, not 1080.
 *
 * ── Sales-status rule ───────────────────────────────────────────────────────
 *
 * This repository already has one convention for "an order that counts as
 * revenue", used by backend/analytics/service.ts for every store-wide figure:
 *
 *     order.status != 'cancelled'  AND  order.archivedAt IS NULL
 *
 * Bundle analytics reuses exactly that (see `COUNTED_ORDER_RULE` and the SQL
 * helper in backend/bundles/analytics.ts) so a bundle number and a store
 * number can never disagree about which orders existed. It is applied
 * identically to the dashboard totals, the campaign table, tier analytics,
 * product analytics and the Best Sellers ranking — there is one filter, not
 * five interpretations of a sale.
 *
 * Refunds: `payment_status` has a `refunded` value but the schema stores no
 * refunded AMOUNT anywhere, so a partial refund cannot be represented. Rather
 * than invent a prorated bundle refund, analytics counts a refunded-but-not-
 * cancelled order at its full charged value, exactly as the store-wide
 * revenue figure does. See docs/BUNDLES_AND_STACKS.md for the limitation.
 */

import { fromMinorUnits, toMinorUnits } from "./evaluate";

// ─── Sales-status rule ────────────────────────────────────────────────────────

/**
 * Human-readable statement of the rule the SQL helper implements. Exported so
 * the admin UI can show the merchant precisely what it is counting rather
 * than making them guess.
 */
export const COUNTED_ORDER_RULE =
  "Orders that are not cancelled and not archived, by order date.";

// ─── Date ranges ──────────────────────────────────────────────────────────────

export const BUNDLE_ANALYTICS_PERIODS = ["7d", "30d", "90d", "all", "custom"] as const;
export type BundleAnalyticsPeriod = (typeof BUNDLE_ANALYTICS_PERIODS)[number];

/**
 * Half-open `[start, end)`. `start === null` means "all time" (no lower
 * bound). Half-open is what makes a day boundary unambiguous: an order placed
 * at exactly the end instant belongs to the NEXT range, never to both.
 */
export interface BundleAnalyticsRange {
  start: Date | null;
  end: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` → that day's 00:00:00.000 UTC. Null for anything malformed. */
export function parseUtcDay(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  // Rejects 2025-02-31 and friends, which Date.UTC would silently roll over.
  if (
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() !== Number(m) - 1 ||
    date.getUTCDate() !== Number(d)
  ) {
    return null;
  }
  return date;
}

export interface CustomRangeInput {
  /** Inclusive first day, `YYYY-MM-DD`. */
  from?: string | null;
  /** Inclusive last day, `YYYY-MM-DD` — expanded to the following midnight. */
  to?: string | null;
}

/**
 * Turns a period selection into the instants the queries filter on.
 *
 * Relative periods are measured backwards from `now` in whole days, which is
 * exactly how backend/analytics/service.ts computes its own "last 7 days" —
 * keeping the two comparable and, more importantly, keeping the server the
 * only thing that decides what "last 30 days" means. The browser never sends
 * a locally-computed instant, so a shopper's or admin's timezone can't shift
 * which orders land in the range.
 *
 * A custom range is given as calendar days and interpreted in UTC, the same
 * zone the day buckets use, so the picker and the chart agree.
 */
export function resolveBundleAnalyticsRange(
  period: BundleAnalyticsPeriod,
  now: Date,
  custom?: CustomRangeInput,
): BundleAnalyticsRange {
  switch (period) {
    case "7d":
      return { start: new Date(now.getTime() - 7 * DAY_MS), end: now };
    case "30d":
      return { start: new Date(now.getTime() - 30 * DAY_MS), end: now };
    case "90d":
      return { start: new Date(now.getTime() - 90 * DAY_MS), end: now };
    case "all":
      return { start: null, end: now };
    case "custom": {
      const from = parseUtcDay(custom?.from);
      const toDay = parseUtcDay(custom?.to);
      // End is exclusive, so an inclusive "to" day becomes the next midnight.
      const end = toDay ? new Date(toDay.getTime() + DAY_MS) : now;
      // A backwards range would silently return zeros; treat it as unbounded
      // below rather than pretending it selected nothing.
      if (from && from.getTime() >= end.getTime()) return { start: null, end };
      return { start: from, end };
    }
  }
}

export type BundleAnalyticsBucket = "day" | "week" | "month";

/**
 * Time-series granularity for a range. Deliberately a fixed ladder, not a
 * configurable cube: up to ~92 days reads well as daily bars, up to ~18
 * months as weekly, anything longer as monthly.
 */
export function bundleAnalyticsBucket(range: BundleAnalyticsRange): BundleAnalyticsBucket {
  if (!range.start) return "month";
  const days = (range.end.getTime() - range.start.getTime()) / DAY_MS;
  if (days <= 92) return "day";
  if (days <= 550) return "week";
  return "month";
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

/** The raw sums a grouped query returns for one slice of bundle sales. */
export interface BundleSalesRaw {
  /** COUNT(*) over order_bundle — one per purchased bundle instance. */
  instances: number;
  /** COUNT(DISTINCT order_id) — orders containing at least one counted bundle. */
  orders: number;
  /** Σ order_bundle.required_quantity — units sold through bundles. */
  pieces: number;
  /** Σ order_bundle.bundle_total — what shoppers were actually charged. */
  revenue: number;
  /** Σ order_bundle.regular_total — the children's regular value at purchase. */
  regularValue: number;
}

export interface BundleSalesMetrics extends BundleSalesRaw {
  /** revenue ÷ instances. 0 when nothing sold. */
  averageBundleValue: number;
  /**
   * regularValue − revenue, as recorded at purchase. May be zero or NEGATIVE
   * (a stack priced above its parts); never clamped, and never called a
   * "saving" unless positive — see `isDiscountGranted`.
   */
  savings: number;
}

const EMPTY_RAW: BundleSalesRaw = {
  instances: 0,
  orders: 0,
  pieces: 0,
  revenue: 0,
  regularValue: 0,
};

/**
 * Derives the reported metrics from raw sums.
 *
 * Money is reduced through minor units so an average never surfaces a float
 * artefact like 216.66666666666666 — the same convention the pricing engine
 * uses (shared/bundles/evaluate.ts).
 */
export function computeBundleSalesMetrics(raw: Partial<BundleSalesRaw>): BundleSalesMetrics {
  const merged: BundleSalesRaw = { ...EMPTY_RAW, ...raw };
  const revenueMinor = toMinorUnits(merged.revenue);
  const regularMinor = toMinorUnits(merged.regularValue);
  return {
    ...merged,
    revenue: fromMinorUnits(revenueMinor),
    regularValue: fromMinorUnits(regularMinor),
    averageBundleValue:
      merged.instances > 0 ? fromMinorUnits(Math.round(revenueMinor / merged.instances)) : 0,
    savings: fromMinorUnits(regularMinor - revenueMinor),
  };
}

/**
 * Whether the aggregate difference may be presented as a discount the store
 * granted. Zero is not a discount, and a negative figure is a premium — the
 * dashboard states that rather than dressing it up.
 */
export function isDiscountGranted(savings: number): boolean {
  return toMinorUnits(savings) > 0;
}

// ─── Best Sellers ranking ─────────────────────────────────────────────────────

/** Default sales window for the storefront Best Selling Bundles ranking. */
export const BEST_SELLING_PERIOD_DAYS = 30;
export const BEST_SELLING_MIN_PERIOD_DAYS = 1;
export const BEST_SELLING_MAX_PERIOD_DAYS = 365;

/** One campaign's sales inside the ranking window. */
export interface BestSellerSales {
  campaignId: string;
  instances: number;
  revenue: number;
}

/**
 * Deterministic ordering of campaigns for merchandising.
 *
 * Metric: bundle INSTANCES sold in the window — how many stacks left the
 * shop, which is what "best selling" means to a shopper looking at a rail of
 * stacks. Revenue is the tie breaker so that, between two campaigns that sold
 * the same number of stacks, the bigger commercial contributor leads. The
 * final tie breaker is the campaign id, which is a UUIDv7 and therefore
 * stable and creation-ordered — SQL is never left to pick.
 *
 * `liveIds` are the campaigns currently eligible to be shown publicly, in
 * their CMS merchandising order. Campaigns with sales that are no longer live
 * (deleted, drafted, expired, not yet started) are dropped here: historical
 * analytics keeps them, the storefront must not link to them. Live campaigns
 * with no sales in the window fill any remaining slots in CMS order, so the
 * section never collapses to nothing in a quiet week.
 */
export function rankBestSellingCampaignIds(
  sales: readonly BestSellerSales[],
  liveIds: readonly string[],
  limit: number,
): string[] {
  const live = new Set(liveIds);
  const ranked = sales
    .filter((s) => live.has(s.campaignId) && s.instances > 0)
    .sort(
      (a, b) =>
        b.instances - a.instances ||
        toMinorUnits(b.revenue) - toMinorUnits(a.revenue) ||
        (a.campaignId < b.campaignId ? -1 : a.campaignId > b.campaignId ? 1 : 0),
    )
    .map((s) => s.campaignId);

  const seen = new Set(ranked);
  const backfill = liveIds.filter((id) => !seen.has(id));
  return [...ranked, ...backfill].slice(0, Math.max(0, limit));
}

// ─── Campaign identity ────────────────────────────────────────────────────────

/**
 * Stable grouping key for a historical campaign.
 *
 * `campaignId` survives renames and repricing but is SET NULL when the
 * merchant deletes the campaign; the snapshotted slug survives the delete.
 * Using the id when present and falling back to the slug means a renamed
 * campaign stays ONE row in the table, and a deleted campaign's sales remain
 * visible under the identity they were sold with instead of vanishing or
 * merging into an "unknown" bucket.
 *
 * Kept in sync with the SQL expression in backend/bundles/analytics.ts.
 */
export function historicalCampaignKey(campaignId: string | null, campaignSlug: string): string {
  return campaignId ?? `slug:${campaignSlug}`;
}
