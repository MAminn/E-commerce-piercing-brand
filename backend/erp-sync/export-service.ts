import { createHash } from "node:crypto";
import { asc, eq, gt, inArray } from "drizzle-orm";

import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import {
  category,
  order,
  orderBundle,
  orderItem,
  orderLog,
  product,
  productVariant,
} from "#root/shared/database/drizzle/schema";
import { effectiveUnitPriceFromRow } from "#root/shared/pricing/effective-price";

/**
 * READ-ONLY ORDER AND CATALOGUE EXPORT FOR THE ERP.
 *
 * The ERP is the financial and inventory source of truth; this store stays
 * the system of record for what a customer ordered. The ERP PULLS from here —
 * nothing in this module writes, and nothing in the checkout or admin paths
 * calls it — so enabling or disabling the integration cannot change how the
 * shop behaves.
 *
 * Contract (versioned by the URL prefix, /api/erp/v1):
 *   digest  — every order's id, number and a content VERSION (a hash of its
 *             export). The ERP diffs versions to find new, changed and
 *             deleted orders without trusting any `updated_at` column, which
 *             several write paths here do not maintain.
 *   orders  — the full export for up to MAX_ORDERS_PER_REQUEST ids.
 *   products — the catalogue the ERP maps its SKUs to.
 *
 * DATA MINIMISATION. The ERP needs to recognise an order on a courier
 * statement, not to contact the customer, so the export carries the
 * customer's name, phone and destination governorate/city — never the email,
 * street address, notes or the free-text activity notes.
 *
 * MONEY stays a decimal string exactly as stored. Nothing is converted to a
 * float on its way out.
 */

export const EXPORT_SCHEMA_VERSION = 1;
export const MAX_ORDERS_PER_REQUEST = 100;
export const MAX_DIGEST_PAGE = 1000;

export type ExportedOrderLine = {
  id: string;
  productId: string;
  /** The merchant SKU snapshotted on the line (product.internal_code at purchase). */
  internalCode: string | null;
  name: string;
  quantity: number;
  /** The product's regular price for this configuration, as snapshotted. */
  listPrice: string;
  /** The product's sale price for this configuration, if it had one. */
  salePrice: string | null;
  /**
   * What one unit was charged BEFORE order-level discounts (Set savings,
   * automatic offers, promo codes) — the same rule the checkout used.
   * Σ unitPrice × quantity is expected to equal `amounts.subtotal`.
   */
  unitPrice: string;
  selectedOptions: Record<string, string> | null;
  /** Set when the line was bought as part of a Set; see `bundles`. */
  orderBundleId: string | null;
};

export type ExportedOrderBundle = {
  id: string;
  campaignSlug: string;
  campaignTitle: string;
  campaignType: string;
  regularTotal: string;
  bundleTotal: string;
  pricingType: string;
  discountPercent: string | null;
  freeShipping: boolean;
};

export type ExportedOrderEvent = {
  action: string;
  oldStatus: string | null;
  newStatus: string | null;
  at: string;
};

export type ExportedOrder = {
  schemaVersion: number;
  id: string;
  orderNumber: number;
  createdAt: string;
  updatedAt: string | null;
  archivedAt: string | null;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  currency: "EGP";
  customer: {
    name: string;
    phone: string;
    governorateCode: string | null;
    governorate: string;
    city: string;
  };
  amounts: {
    subtotal: string;
    /** Combined order-level discount: Set savings + offers + promo code. */
    discount: string | null;
    shipping: string;
    tax: string;
    total: string;
  };
  promoCodeId: string | null;
  freeShippingApplied: boolean;
  /** True once the shop has put this order's units back on sale. */
  stockRestored: boolean;
  courier: {
    provider: "bosta" | "fincart" | null;
    trackingNumber: string | null;
    returnTrackingNumber: string | null;
    rawStatus: string | null;
    rawStatusCode: string | null;
    rawSubStatus: string | null;
    statusUpdatedAt: string | null;
  };
  lines: ExportedOrderLine[];
  bundles: ExportedOrderBundle[];
  events: ExportedOrderEvent[];
};

export type OrderDigestEntry = { id: string; orderNumber: number; version: string };

type OrderRow = typeof order.$inferSelect;
type ItemRow = typeof orderItem.$inferSelect;
type BundleRow = typeof orderBundle.$inferSelect;
type LogRow = Pick<typeof orderLog.$inferSelect, "orderId" | "action" | "oldStatus" | "newStatus" | "createdAt">;

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
const money = (v: string | number): string => Number(v).toFixed(2);

function courierOf(o: OrderRow): ExportedOrder["courier"] {
  if (o.bostaDeliveryId || o.bostaTrackingNumber || o.bostaStatus) {
    return {
      provider: "bosta",
      trackingNumber: o.bostaTrackingNumber,
      returnTrackingNumber: null,
      rawStatus: o.bostaStatus,
      rawStatusCode: o.bostaStatusCode,
      rawSubStatus: null,
      statusUpdatedAt: iso(o.bostaStatusUpdatedAt),
    };
  }
  if (o.fincartTrackingNumber || o.fincartStatus) {
    return {
      provider: "fincart",
      trackingNumber: o.fincartTrackingNumber,
      returnTrackingNumber: o.fincartReturnTrackingNumber,
      rawStatus: o.fincartStatus,
      rawStatusCode: null,
      rawSubStatus: o.fincartSubStatus,
      statusUpdatedAt: iso(o.fincartStatusUpdatedDate),
    };
  }
  return {
    provider: null,
    trackingNumber: null,
    returnTrackingNumber: null,
    rawStatus: null,
    rawStatusCode: null,
    rawSubStatus: null,
    statusUpdatedAt: null,
  };
}

/** Pure: one order row plus its children → the export shape. */
export function buildOrderExport(
  o: OrderRow,
  items: readonly ItemRow[],
  bundles: readonly BundleRow[],
  logs: readonly LogRow[],
): ExportedOrder {
  const lines = [...items]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
    .map<ExportedOrderLine>((item) => ({
      id: item.id,
      productId: item.productId,
      internalCode: item.internalCode,
      name: item.name,
      quantity: item.quantity,
      listPrice: money(item.price),
      salePrice: item.discountPrice === null ? null : money(item.discountPrice),
      unitPrice: money(effectiveUnitPriceFromRow({ price: item.price, discountPrice: item.discountPrice })),
      selectedOptions: item.selectedOptions ?? null,
      orderBundleId: item.orderBundleId,
    }));

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    id: o.id,
    orderNumber: o.orderNumber,
    createdAt: o.createdAt.toISOString(),
    updatedAt: iso(o.updatedAt),
    archivedAt: iso(o.archivedAt),
    status: o.status,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    currency: "EGP",
    customer: {
      name: o.customerName,
      phone: o.customerPhone,
      governorateCode: o.shippingGovernorateCode,
      governorate: o.shippingState,
      city: o.shippingCity,
    },
    amounts: {
      subtotal: money(o.subtotal),
      discount: o.discount === null ? null : money(o.discount),
      shipping: money(o.shipping),
      tax: money(o.tax),
      total: money(o.total),
    },
    promoCodeId: o.promoCodeId,
    freeShippingApplied: Boolean(o.shippingQuote && (o.shippingQuote as { freeShippingApplied?: boolean }).freeShippingApplied),
    stockRestored: o.stockRestored,
    courier: courierOf(o),
    lines,
    bundles: [...bundles]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((b) => ({
        id: b.id,
        campaignSlug: b.campaignSlug,
        campaignTitle: b.campaignTitle,
        campaignType: b.campaignType,
        regularTotal: money(b.regularTotal),
        bundleTotal: money(b.bundleTotal),
        pricingType: b.pricingType,
        discountPercent: b.discountPercent === null ? null : money(b.discountPercent),
        freeShipping: b.freeShipping,
      })),
    events: [...logs]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((l) => ({ action: l.action, oldStatus: l.oldStatus, newStatus: l.newStatus, at: l.createdAt.toISOString() })),
  };
}

/** Deterministic JSON: object keys sorted at every level, so equal content hashes equally. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/** The content version the ERP compares. Any change to the export changes it. */
export function orderVersion(exported: ExportedOrder): string {
  return createHash("sha256").update(canonicalJson(exported)).digest("hex");
}

async function loadExports(db: DatabaseClient, orders: readonly OrderRow[]): Promise<ExportedOrder[]> {
  if (orders.length === 0) return [];
  const ids = orders.map((o) => o.id);
  const [items, bundles, logs] = [
    await db.select().from(orderItem).where(inArray(orderItem.orderId, ids)),
    await db.select().from(orderBundle).where(inArray(orderBundle.orderId, ids)),
    await db
      .select({
        orderId: orderLog.orderId,
        action: orderLog.action,
        oldStatus: orderLog.oldStatus,
        newStatus: orderLog.newStatus,
        createdAt: orderLog.createdAt,
      })
      .from(orderLog)
      .where(inArray(orderLog.orderId, ids)),
  ];
  const group = <T extends { orderId: string }>(rows: readonly T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const list = m.get(r.orderId);
      if (list) list.push(r);
      else m.set(r.orderId, [r]);
    }
    return m;
  };
  const itemsBy = group(items);
  const bundlesBy = group(bundles);
  const logsBy = group(logs);
  return orders.map((o) => buildOrderExport(o, itemsBy.get(o.id) ?? [], bundlesBy.get(o.id) ?? [], logsBy.get(o.id) ?? []));
}

/**
 * One page of the digest, in order-number order. `afterOrderNumber` is the
 * cursor: pass the last number of the previous page; `nextCursor` is null on
 * the final page.
 */
export async function listOrderDigest(
  db: DatabaseClient,
  opts: { afterOrderNumber?: number; limit?: number } = {},
): Promise<{ orders: OrderDigestEntry[]; nextCursor: number | null }> {
  const limit = Math.min(Math.max(opts.limit ?? MAX_DIGEST_PAGE, 1), MAX_DIGEST_PAGE);
  const rows = await db
    .select()
    .from(order)
    .where(opts.afterOrderNumber === undefined ? undefined : gt(order.orderNumber, opts.afterOrderNumber))
    .orderBy(asc(order.orderNumber))
    .limit(limit);
  const exports = await loadExports(db, rows);
  const entries = exports.map((e) => ({ id: e.id, orderNumber: e.orderNumber, version: orderVersion(e) }));
  return {
    orders: entries,
    nextCursor: rows.length === limit ? (rows[rows.length - 1]?.orderNumber ?? null) : null,
  };
}

/** Full exports for the given ids. Unknown ids are simply absent from the result. */
export async function getOrdersForExport(
  db: DatabaseClient,
  ids: readonly string[],
): Promise<Array<ExportedOrder & { version: string }>> {
  const unique = [...new Set(ids)].slice(0, MAX_ORDERS_PER_REQUEST);
  if (unique.length === 0) return [];
  const rows = await db.select().from(order).where(inArray(order.id, unique)).orderBy(asc(order.orderNumber));
  const exports = await loadExports(db, rows);
  return exports.map((e) => ({ ...e, version: orderVersion(e) }));
}

export type ExportedProduct = {
  id: string;
  name: string;
  slug: string | null;
  internalCode: string | null;
  catalogueNo: number | null;
  category: string | null;
  price: string;
  salePrice: string | null;
  /** Merchant cost as entered in the shop admin; null = never entered. Informational only. */
  costPrice: string | null;
  /** The shop's sellable counter: decremented when an order is placed, restored on cancel. */
  stock: number;
  hidden: boolean;
  deleted: boolean;
  optionGroups: string[];
};

export async function listProductsForExport(db: DatabaseClient): Promise<ExportedProduct[]> {
  const rows = await db
    .select({
      id: product.id,
      name: product.name,
      slug: product.slug,
      internalCode: product.internalCode,
      catalogueNo: product.catalogueNo,
      categoryName: category.name,
      price: product.price,
      discountPrice: product.discountPrice,
      costPrice: product.costPrice,
      stock: product.stock,
      hidden: product.hidden,
      deleted: product.deleted,
    })
    .from(product)
    .leftJoin(category, eq(category.id, product.categoryId))
    .orderBy(asc(product.createdAt), asc(product.id));
  const groups = await db.select({ productId: productVariant.productId, name: productVariant.name }).from(productVariant);
  const groupsBy = new Map<string, string[]>();
  for (const g of groups) groupsBy.set(g.productId, [...(groupsBy.get(g.productId) ?? []), g.name]);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    internalCode: r.internalCode,
    catalogueNo: r.catalogueNo,
    category: r.categoryName ?? null,
    price: money(r.price),
    salePrice: r.discountPrice === null ? null : money(r.discountPrice),
    costPrice: r.costPrice === null ? null : money(r.costPrice),
    stock: r.stock,
    hidden: r.hidden,
    deleted: r.deleted,
    optionGroups: (groupsBy.get(r.id) ?? []).sort(),
  }));
}
