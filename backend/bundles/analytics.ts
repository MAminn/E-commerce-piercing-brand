/**
 * Bundle sales analytics — the grouped queries behind the admin dashboard and
 * the storefront Best Sellers ranking.
 *
 * Every figure here comes from placed orders and their immutable
 * `order_bundle` snapshots. Nothing reads the live `bundle_campaign` /
 * `bundle_campaign_tier` rows for a historical number, so repricing a tier or
 * deleting a campaign cannot rewrite what a past sale was worth. The only
 * live lookups are (a) the product NAME shown beside a product's unit count
 * and (b) the campaign liveness check the storefront ranking applies — both
 * display/eligibility concerns, never a source of money.
 *
 * See shared/bundles/analytics.ts for the metric definitions and the
 * sales-status rule this module implements.
 *
 * ── Query budget ────────────────────────────────────────────────────────────
 *
 * `getBundleAnalytics` runs SEVEN statements, independent of how many
 * campaigns, tiers, products or days are in range: the headline totals (the
 * only ungrouped one), then six GROUP BY queries — per campaign, per type,
 * per tier, per product twice (shopper-selected vs included in any bundle)
 * and per time bucket. There is no per-campaign or per-product follow-up
 * query anywhere; the "query shape" tests in __tests__/analytics.integration
 * .test.ts fail if that ever changes.
 */

import { query } from "#root/shared/database/drizzle/db";
import {
  order,
  orderBundle,
  orderItem,
  product,
} from "#root/shared/database/drizzle/schema";
import { and, desc, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import {
  BEST_SELLING_MAX_PERIOD_DAYS,
  BEST_SELLING_MIN_PERIOD_DAYS,
  BEST_SELLING_PERIOD_DAYS,
  BUNDLE_ANALYTICS_PERIODS,
  type BundleAnalyticsBucket,
  type BundleAnalyticsRange,
  type BundleSalesMetrics,
  type BestSellerSales,
  bundleAnalyticsBucket,
  computeBundleSalesMetrics,
  resolveBundleAnalyticsRange,
} from "#root/shared/bundles/analytics";

// ─── Input ────────────────────────────────────────────────────────────────────

export const bundleAnalyticsSchema = z.object({
  period: z.enum(BUNDLE_ANALYTICS_PERIODS).default("30d"),
  /** Inclusive first day, `YYYY-MM-DD`. Only read when period = custom. */
  from: z.string().max(10).optional(),
  /** Inclusive last day, `YYYY-MM-DD`. Only read when period = custom. */
  to: z.string().max(10).optional(),
  /** Rows per breakdown table. */
  limit: z.number().int().min(1).max(100).default(25),
});

export type BundleAnalyticsInput = z.infer<typeof bundleAnalyticsSchema>;

// ─── Output ───────────────────────────────────────────────────────────────────

export interface BundleCampaignPerformance extends BundleSalesMetrics {
  /** Stable historical identity — see historicalCampaignKey(). */
  key: string;
  /** Null once the campaign was deleted; only ever used to offer an "Open campaign" link. */
  campaignId: string | null;
  /** Snapshot identity, taken from the most recent sale so a rename shows the current name. */
  title: string;
  slug: string;
  type: "build_your_stack" | "curated_stack";
}

export interface BundleTypePerformance extends BundleSalesMetrics {
  type: "build_your_stack" | "curated_stack";
}

export interface BundleTierPerformance extends BundleSalesMetrics {
  key: string;
  campaignId: string | null;
  title: string;
  /** The tier's unit count as sold, e.g. 3 / 4 / 6. */
  quantity: number;
}

export interface BundleProductPerformance {
  productId: string;
  /** Current catalogue name — a display lookup, never a source of sales data. */
  name: string;
  slug: string | null;
  /** Σ child order-item quantities inside bundles. */
  units: number;
  /** Distinct bundle instances that contained this product at least once. */
  instances: number;
}

export interface BundleRevenuePoint {
  /** Bucket start, `YYYY-MM-DD` in UTC. */
  date: string;
  revenue: number;
  instances: number;
}

export interface BundleAnalyticsResult {
  range: { start: string | null; end: string; period: string; bucket: BundleAnalyticsBucket };
  totals: BundleSalesMetrics;
  byCampaign: BundleCampaignPerformance[];
  byType: BundleTypePerformance[];
  byTier: BundleTierPerformance[];
  /** Products shoppers PICKED themselves, i.e. inside build_your_stack instances. */
  mostSelectedInBuildYourStack: BundleProductPerformance[];
  /** Products that shipped inside any bundle, chosen or merchant-composed. */
  mostIncludedInBundles: BundleProductPerformance[];
  series: BundleRevenuePoint[];
}

// ─── Shared filters ───────────────────────────────────────────────────────────

/**
 * THE sales-status rule, in one place. Identical to the store-wide revenue
 * filter in backend/analytics/service.ts: an order counts unless it was
 * cancelled or archived. Every query in this module — and the Best Sellers
 * ranking — composes this, so no two bundle figures can disagree about which
 * orders happened.
 *
 * The range is half-open `[start, end)` on `order.createdAt`, the same
 * timestamp the rest of the dashboard reports orders by.
 */
export const countedBundleOrderWhere = (range: BundleAnalyticsRange) =>
  and(
    sql`${order.status} != 'cancelled'`,
    isNull(order.archivedAt),
    range.start ? gte(order.createdAt, range.start) : undefined,
    lt(order.createdAt, range.end),
  );

/** Matches historicalCampaignKey() in shared/bundles/analytics.ts. */
const campaignKeyExpr = sql<string>`coalesce(${orderBundle.campaignId}::text, 'slug:' || ${orderBundle.campaignSlug})`;

/** Most recent snapshot value for a grouped campaign — how a renamed campaign shows its current name. */
const latest = (column: unknown, cast = "") =>
  sql<string | null>`(array_agg(${column}${sql.raw(cast)} order by ${orderBundle.createdAt} desc))[1]`;

const num = (value: string | number | null | undefined): number => Number(value ?? 0);

/**
 * Buckets in UTC, deliberately: `date_trunc` on a `timestamptz` would
 * otherwise truncate in whatever the session's TimeZone happens to be, so the
 * same order could land on different days on different servers. Converting to
 * UTC first makes the bucket a property of the order, not of the connection.
 *
 * The bucket name is inlined rather than bound — `date_trunc`'s first
 * argument must be a literal for Postgres to resolve the overload — and it
 * comes from a closed union, never from user input.
 */
const bucketExpr = (bucket: BundleAnalyticsBucket) =>
  sql<string>`to_char(date_trunc('${sql.raw(bucket)}', ${order.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`;

// ─── Admin analytics ──────────────────────────────────────────────────────────

export const getBundleAnalytics = (input: BundleAnalyticsInput) =>
  Effect.gen(function* ($) {
    return yield* $(
      query(async (db): Promise<BundleAnalyticsResult> => {
        const range = resolveBundleAnalyticsRange(input.period, new Date(), {
          from: input.from,
          to: input.to,
        });
        const bucket = bundleAnalyticsBucket(range);
        const counted = countedBundleOrderWhere(range);

        // One shared shape: join the snapshot to its order so the sales-status
        // rule applies, then group. Instances are COUNT(*) over order_bundle —
        // two stacks from the same campaign are two rows and stay two sales.
        const totalsQ = db
          .select({
            instances: sql<string>`count(*)`,
            orders: sql<string>`count(distinct ${orderBundle.orderId})`,
            pieces: sql<string>`coalesce(sum(${orderBundle.requiredQuantity}), 0)`,
            revenue: sql<string>`coalesce(sum(${orderBundle.bundleTotal}), 0)`,
            regularValue: sql<string>`coalesce(sum(${orderBundle.regularTotal}), 0)`,
          })
          .from(orderBundle)
          .innerJoin(order, eq(order.id, orderBundle.orderId))
          .where(counted);

        const byCampaignQ = db
          .select({
            key: campaignKeyExpr,
            campaignId: latest(orderBundle.campaignId, "::text"),
            title: latest(orderBundle.campaignTitle),
            slug: latest(orderBundle.campaignSlug),
            type: latest(orderBundle.campaignType, "::text"),
            instances: sql<string>`count(*)`,
            orders: sql<string>`count(distinct ${orderBundle.orderId})`,
            pieces: sql<string>`coalesce(sum(${orderBundle.requiredQuantity}), 0)`,
            revenue: sql<string>`coalesce(sum(${orderBundle.bundleTotal}), 0)`,
            regularValue: sql<string>`coalesce(sum(${orderBundle.regularTotal}), 0)`,
          })
          .from(orderBundle)
          .innerJoin(order, eq(order.id, orderBundle.orderId))
          .where(counted)
          .groupBy(campaignKeyExpr)
          .orderBy(desc(sql`coalesce(sum(${orderBundle.bundleTotal}), 0)`), campaignKeyExpr)
          .limit(input.limit);

        const byTypeQ = db
          .select({
            type: orderBundle.campaignType,
            instances: sql<string>`count(*)`,
            orders: sql<string>`count(distinct ${orderBundle.orderId})`,
            pieces: sql<string>`coalesce(sum(${orderBundle.requiredQuantity}), 0)`,
            revenue: sql<string>`coalesce(sum(${orderBundle.bundleTotal}), 0)`,
            regularValue: sql<string>`coalesce(sum(${orderBundle.regularTotal}), 0)`,
          })
          .from(orderBundle)
          .innerJoin(order, eq(order.id, orderBundle.orderId))
          .where(counted)
          .groupBy(orderBundle.campaignType);

        // Tier performance: grouped by campaign identity AND the tier's unit
        // count as sold — never by tier id, which a merchant may delete, and
        // never by today's tier price. The same quantity sold at two prices
        // aggregates as ONE tier row whose revenue is the sum of both actual
        // charges. Curated stacks have no tiers and are excluded.
        const byTierQ = db
          .select({
            key: sql<string>`${campaignKeyExpr} || ':' || ${orderBundle.requiredQuantity}`,
            campaignId: latest(orderBundle.campaignId, "::text"),
            title: latest(orderBundle.campaignTitle),
            quantity: orderBundle.requiredQuantity,
            instances: sql<string>`count(*)`,
            orders: sql<string>`count(distinct ${orderBundle.orderId})`,
            pieces: sql<string>`coalesce(sum(${orderBundle.requiredQuantity}), 0)`,
            revenue: sql<string>`coalesce(sum(${orderBundle.bundleTotal}), 0)`,
            regularValue: sql<string>`coalesce(sum(${orderBundle.regularTotal}), 0)`,
          })
          .from(orderBundle)
          .innerJoin(order, eq(order.id, orderBundle.orderId))
          .where(and(counted, eq(orderBundle.campaignType, "build_your_stack")))
          .groupBy(campaignKeyExpr, orderBundle.requiredQuantity)
          .orderBy(campaignKeyExpr, orderBundle.requiredQuantity)
          .limit(input.limit * 4);

        // Product performance: the children as they were bought. `units` sums
        // the order-item quantity (a shopper who took 2 of one stud adds 2),
        // while `instances` counts DISTINCT bundle instances, so that same
        // shopper counts once there. The product join supplies today's name
        // for display only — the numbers come from the order rows.
        const productQ = (buildYourStackOnly: boolean) =>
          db
            .select({
              productId: orderItem.productId,
              name: product.name,
              slug: product.slug,
              units: sql<string>`coalesce(sum(${orderItem.quantity}), 0)`,
              instances: sql<string>`count(distinct ${orderItem.orderBundleId})`,
            })
            .from(orderItem)
            .innerJoin(orderBundle, eq(orderItem.orderBundleId, orderBundle.id))
            .innerJoin(order, eq(order.id, orderBundle.orderId))
            .leftJoin(product, eq(product.id, orderItem.productId))
            .where(
              and(
                counted,
                isNotNull(orderItem.orderBundleId),
                buildYourStackOnly
                  ? eq(orderBundle.campaignType, "build_your_stack")
                  : undefined,
              ),
            )
            .groupBy(orderItem.productId, product.name, product.slug)
            .orderBy(
              desc(sql`coalesce(sum(${orderItem.quantity}), 0)`),
              orderItem.productId,
            )
            .limit(input.limit);

        const seriesQ = db
          .select({
            date: bucketExpr(bucket),
            revenue: sql<string>`coalesce(sum(${orderBundle.bundleTotal}), 0)`,
            instances: sql<string>`count(*)`,
          })
          .from(orderBundle)
          .innerJoin(order, eq(order.id, orderBundle.orderId))
          .where(counted)
          .groupBy(bucketExpr(bucket))
          .orderBy(bucketExpr(bucket));

        const [totalsRows, campaignRows, typeRows, tierRows, selectedRows, includedRows, seriesRows] =
          await Promise.all([
            totalsQ.execute(),
            byCampaignQ.execute(),
            byTypeQ.execute(),
            byTierQ.execute(),
            productQ(true).execute(),
            productQ(false).execute(),
            seriesQ.execute(),
          ]);

        const metrics = (r: {
          instances: string;
          orders: string;
          pieces: string;
          revenue: string;
          regularValue: string;
        }) =>
          computeBundleSalesMetrics({
            instances: num(r.instances),
            orders: num(r.orders),
            pieces: num(r.pieces),
            revenue: num(r.revenue),
            regularValue: num(r.regularValue),
          });

        const toProduct = (r: {
          productId: string;
          name: string | null;
          slug: string | null;
          units: string;
          instances: string;
        }): BundleProductPerformance => ({
          productId: r.productId,
          name: r.name ?? "Deleted product",
          slug: r.slug ?? null,
          units: num(r.units),
          instances: num(r.instances),
        });

        return {
          range: {
            start: range.start ? range.start.toISOString() : null,
            end: range.end.toISOString(),
            period: input.period,
            bucket,
          },
          totals: metrics(
            totalsRows[0] ?? {
              instances: "0",
              orders: "0",
              pieces: "0",
              revenue: "0",
              regularValue: "0",
            },
          ),
          byCampaign: campaignRows.map((r) => ({
            key: r.key,
            campaignId: r.campaignId ?? null,
            title: r.title ?? "Deleted campaign",
            slug: r.slug ?? "",
            type: (r.type as BundleCampaignPerformance["type"]) ?? "build_your_stack",
            ...metrics(r),
          })),
          byType: typeRows.map((r) => ({ type: r.type, ...metrics(r) })),
          byTier: tierRows.map((r) => ({
            key: r.key,
            campaignId: r.campaignId ?? null,
            title: r.title ?? "Deleted campaign",
            quantity: r.quantity,
            ...metrics(r),
          })),
          mostSelectedInBuildYourStack: selectedRows.map(toProduct),
          mostIncludedInBundles: includedRows.map(toProduct),
          series: seriesRows.map((r) => ({
            date: r.date,
            revenue: num(r.revenue),
            instances: num(r.instances),
          })),
        };
      }),
    );
  });

// ─── Best Sellers ranking ─────────────────────────────────────────────────────

export const bestSellingPeriodSchema = z
  .number()
  .int()
  .min(BEST_SELLING_MIN_PERIOD_DAYS)
  .max(BEST_SELLING_MAX_PERIOD_DAYS);

/**
 * Bundle sales per LIVE campaign over the trailing window, ranked in SQL.
 *
 * One grouped query. Snapshots whose `campaignId` is null (campaign deleted)
 * are excluded up front: a deleted campaign cannot be merchandised, so
 * carrying it here would only produce a dead storefront link. Rows are
 * returned already ordered by the documented metric so the caller can apply
 * the liveness filter without re-sorting; `rankBestSellingCampaignIds`
 * re-applies the identical comparator on the filtered set.
 */
export async function loadBundleSalesRanking(
  db: Parameters<Parameters<typeof query>[0]>[0],
  periodDays: number = BEST_SELLING_PERIOD_DAYS,
  now: Date = new Date(),
): Promise<BestSellerSales[]> {
  const start = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      campaignId: orderBundle.campaignId,
      instances: sql<string>`count(*)`,
      revenue: sql<string>`coalesce(sum(${orderBundle.bundleTotal}), 0)`,
    })
    .from(orderBundle)
    .innerJoin(order, eq(order.id, orderBundle.orderId))
    .where(
      and(
        countedBundleOrderWhere({ start, end: now }),
        isNotNull(orderBundle.campaignId),
      ),
    )
    .groupBy(orderBundle.campaignId)
    .orderBy(
      desc(sql`count(*)`),
      desc(sql`coalesce(sum(${orderBundle.bundleTotal}), 0)`),
      orderBundle.campaignId,
    )
    .execute();

  return rows
    .filter((r): r is typeof r & { campaignId: string } => r.campaignId !== null)
    .map((r) => ({
      campaignId: r.campaignId,
      instances: num(r.instances),
      revenue: num(r.revenue),
    }));
}
