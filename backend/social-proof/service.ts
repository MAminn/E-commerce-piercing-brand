import { query } from "#root/shared/database/drizzle/db";
import {
  file,
  order,
  orderItem,
  product,
  productImage,
} from "#root/shared/database/drizzle/schema";
import type { SocialProofConfig } from "#root/shared/database/drizzle/schema";
import { and, desc, eq, gte, inArray, isNull, notInArray } from "drizzle-orm";
import { Effect } from "effect";
import { MAX_PUBLIC_EVENTS } from "./defaults";
import { getSocialProofConfig } from "./config-service";
import {
  toPublicEvents,
  type PublicSocialProofEvent,
  type RawSocialProofRow,
} from "./sanitize";

/**
 * The slice of the config the storefront actually needs.
 *
 * Query-shaping fields (`lookbackDays`, `eligibleStatuses`,
 * `allowedProductIds`) are deliberately absent: they are decisions the server
 * has already applied by the time the response is built, and
 * `allowedProductIds` in particular is a merchandising choice that anonymous
 * visitors have no reason to be handed.
 */
export interface PublicSocialProofClientConfig {
  enabled: boolean;
  firstDelaySeconds: number;
  displayDurationSeconds: number;
  intervalSeconds: number;
  maxPerSession: number;
  showRelativeTime: boolean;
}

export interface PublicSocialProofFeed {
  config: PublicSocialProofClientConfig;
  events: PublicSocialProofEvent[];
}

function toClientConfig(config: SocialProofConfig): PublicSocialProofClientConfig {
  return {
    enabled: config.enabled,
    firstDelaySeconds: config.firstDelaySeconds,
    displayDurationSeconds: config.displayDurationSeconds,
    intervalSeconds: config.intervalSeconds,
    maxPerSession: config.maxPerSession,
    showRelativeTime: config.showRelativeTime,
  };
}

/**
 * How many raw item rows to pull before collapsing to one event per order.
 * Orders hold several items, so the row count has to over-fetch the event
 * cap — but only by a bounded factor, so a store with large baskets can't
 * turn this into an unbounded scan.
 */
const ROW_FETCH_MULTIPLIER = 5;

/**
 * Percé adaptation. Percé's order row carries a payment status alongside the
 * fulfilment status, and an order can be refunded (or its online payment can
 * fail) without the fulfilment status ever reaching `cancelled`. Mach's own
 * rule — "a cancelled order is a purchase that did not happen" — applies
 * equally to these, so they are excluded the same way.
 */
export const INELIGIBLE_PAYMENT_STATUSES = ["refunded", "failed"] as const;
const MAX_ROW_FETCH = 100;

/**
 * The public recent-order feed.
 *
 * This is a purpose-built read, NOT a filtered view of the admin order list:
 * the select below names the six order/product columns the card can show and
 * nothing else, so email, phone, street address, totals, payment fields and
 * the order id are not merely stripped later — they are never read out of
 * Postgres in the first place. What the select does return still passes
 * through `toPublicEvents` before leaving the server.
 *
 * Eligibility, in one place:
 *  - status ∈ the configured eligible set (default: processing/shipped/
 *    delivered — never pending or cancelled)
 *  - placed within `lookbackDays`
 *  - not archived
 *  - payment not refunded or failed (Percé adaptation, see above)
 *  - the product still exists, is not soft-deleted and is not hidden
 *  - the product is in `allowedProductIds`, when the admin has set one
 *
 * A disabled config short-circuits before any order is touched.
 */
export const getPublicSocialProofFeed = () =>
  Effect.gen(function* ($) {
    const config = yield* $(getSocialProofConfig());

    if (!config.enabled) {
      return { config: toClientConfig(config), events: [] } as PublicSocialProofFeed;
    }

    // A config saved before a status was retired (or hand-edited in the DB)
    // could name nothing valid; with no statuses there is nothing eligible,
    // so return empty rather than building a query with an empty IN clause.
    if (config.eligibleStatuses.length === 0) {
      return { config: toClientConfig(config), events: [] } as PublicSocialProofFeed;
    }
    const since = new Date(Date.now() - config.lookbackDays * 24 * 60 * 60 * 1000);
    const rowLimit = Math.min(MAX_PUBLIC_EVENTS * ROW_FETCH_MULTIPLIER, MAX_ROW_FETCH);

    const conditions = [
      inArray(order.status, config.eligibleStatuses),
      gte(order.createdAt, since),
      isNull(order.archivedAt),
      notInArray(order.paymentStatus, [...INELIGIBLE_PAYMENT_STATUSES]),
      eq(product.deleted, false),
      eq(product.hidden, false),
    ];

    // Empty list means "all eligible products" — adding an IN clause here
    // would instead mean "none".
    if (config.allowedProductIds.length > 0) {
      conditions.push(inArray(product.id, config.allowedProductIds));
    }

    const rows = yield* $(
      query(async (db) =>
        db
          .select({
            orderId: order.id,
            customerName: order.customerName,
            shippingCity: order.shippingCity,
            shippingState: order.shippingState,
            occurredAt: order.createdAt,
            productId: product.id,
            productSlug: product.slug,
            productName: product.name,
            productImageDiskname: file.diskname,
          })
          .from(orderItem)
          .innerJoin(order, eq(orderItem.orderId, order.id))
          .innerJoin(product, eq(orderItem.productId, product.id))
          .leftJoin(file, eq(product.imageId, file.id))
          .where(and(...conditions))
          .orderBy(desc(order.createdAt))
          .limit(rowLimit),
      ),
    );

    const events = toPublicEvents(
      rows as RawSocialProofRow[],
      config,
      MAX_PUBLIC_EVENTS,
    );

    // Prefer the product's primary gallery image — the same one the shop grid
    // and product card show — falling back to the base `product.imageId` the
    // join above already resolved.
    const productIds = [...new Set(events.map((e) => e.productId))];
    if (productIds.length > 0) {
      const primaries = yield* $(
        query(async (db) =>
          db
            .select({ productId: productImage.productId, diskname: file.diskname })
            .from(productImage)
            .innerJoin(file, eq(productImage.fileId, file.id))
            .where(
              and(
                inArray(productImage.productId, productIds),
                eq(productImage.isPrimary, true),
              ),
            ),
        ),
      );
      const byProduct = new Map(primaries.map((p) => [p.productId, p.diskname]));
      for (const event of events) {
        const primary = byProduct.get(event.productId);
        if (primary) event.productImageUrl = `/uploads/${primary}`;
      }
    }

    return { config: toClientConfig(config), events } as PublicSocialProofFeed;
  });
