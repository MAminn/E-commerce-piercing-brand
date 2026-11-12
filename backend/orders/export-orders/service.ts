import { and, asc, desc, eq, inArray, lt, type SQL } from "drizzle-orm";
import { z } from "zod";

import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import {
  order,
  orderBundle,
  orderItem,
  orderLog,
  product,
  promoCode,
  user,
  webhookLog,
} from "#root/shared/database/drizzle/schema";
import { orderFilterConditions, orderSearchCondition } from "../view-orders/filters";
import {
  EXPORT_TIME_ZONE,
  type ExportBundleRecord,
  type ExportItemRecord,
  type ExportLogRecord,
  type ExportOrderRecord,
  type ExportWebhookRecord,
  type InfoRow,
  infoRows,
  ORDERS_WORKBOOK_SHEETS,
  rowsForOrder,
  SHEET,
} from "./sheets";
import { XlsxWorkbookWriter } from "./xlsx-writer";

/**
 * ADMIN EXCEL EXPORT OF ORDERS — read-only.
 *
 * Walks every matching order newest-first in batches, inside ONE read-only
 * REPEATABLE READ transaction, so the whole workbook reflects a single
 * consistent snapshot even if orders are placed or edited mid-export, and
 * nothing here can write. Each batch loads its items, Sets, status history
 * and webhook metadata with one query apiece (no per-order queries).
 */

export const EXPORT_BATCH_SIZE = 500;

const isoDateTime = z
  .string()
  .max(40)
  .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date");

export const exportOrdersRequestSchema = z.object({
  /** "all" ignores every filter; "filtered" applies the Orders page filters below. */
  scope: z.enum(["all", "filtered"]),
  status: z.enum(["pending", "processing", "shipped", "delivered", "cancelled"]).optional(),
  dateFrom: isoDateTime.optional(),
  dateTo: isoDateTime.optional(),
  paymentIssueOnly: z.boolean().optional(),
  /** The Orders page search box text. */
  search: z.string().max(200).optional(),
  /** Label of the dashboard date filter ("Today", "2026-11-12"), shown on the Export Info sheet. */
  dateLabel: z.string().max(60).optional(),
});

export type ExportOrdersRequest = z.infer<typeof exportOrdersRequestSchema>;

export type ExportOrdersSummary = {
  orders: number;
  items: number;
  units: number;
  bundles: number;
  historyEntries: number;
  webhookEntries: number;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  byStatus: Record<string, number>;
};

/** The WHERE clause for a request; undefined = every order. */
export function exportWhere(req: ExportOrdersRequest): SQL<unknown> | undefined {
  if (req.scope === "all") return undefined;
  const conditions = orderFilterConditions({
    status: req.status,
    dateFrom: req.dateFrom,
    dateTo: req.dateTo,
    paymentIssueOnly: req.paymentIssueOnly,
  });
  const search = orderSearchCondition(req.search);
  if (search) conditions.push(search);
  return conditions.length > 0 ? and(...conditions) : undefined;
}

const ORDER_COLUMNS = {
  id: order.id,
  orderNumber: order.orderNumber,
  userId: order.userId,
  customerName: order.customerName,
  customerEmail: order.customerEmail,
  customerPhone: order.customerPhone,
  shippingAddress: order.shippingAddress,
  shippingDistrict: order.shippingDistrict,
  shippingCity: order.shippingCity,
  shippingState: order.shippingState,
  shippingPostalCode: order.shippingPostalCode,
  shippingCountry: order.shippingCountry,
  shippingGovernorateCode: order.shippingGovernorateCode,
  subtotal: order.subtotal,
  shipping: order.shipping,
  shippingQuote: order.shippingQuote,
  tax: order.tax,
  discount: order.discount,
  promoCode: promoCode.code,
  total: order.total,
  status: order.status,
  notes: order.notes,
  paymentMethod: order.paymentMethod,
  paymentStatus: order.paymentStatus,
  paymentTransactionId: order.paymentTransactionId,
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
  fincartTrackingNumber: order.fincartTrackingNumber,
  fincartStatus: order.fincartStatus,
  fincartSubStatus: order.fincartSubStatus,
  fincartRejectionReason: order.fincartRejectionReason,
  fincartSupportNote: order.fincartSupportNote,
  fincartReturnTrackingNumber: order.fincartReturnTrackingNumber,
  fincartStatusUpdatedDate: order.fincartStatusUpdatedDate,
  bostaDeliveryId: order.bostaDeliveryId,
  bostaTrackingNumber: order.bostaTrackingNumber,
  bostaStatus: order.bostaStatus,
  bostaStatusCode: order.bostaStatusCode,
  bostaStatusUpdatedAt: order.bostaStatusUpdatedAt,
  bostaSyncStatus: order.bostaSyncStatus,
  bostaSyncError: order.bostaSyncError,
  bostaSyncedAt: order.bostaSyncedAt,
  archivedAt: order.archivedAt,
  stockRestored: order.stockRestored,
} as const;

function groupByOrder<T extends { orderId: string }>(rows: readonly T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const list = m.get(r.orderId);
    if (list) list.push(r);
    else m.set(r.orderId, [r]);
  }
  return m;
}

type Tx = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];

async function loadChildren(tx: Tx, ids: string[]) {
  const items: ExportItemRecord[] = await tx
    .select({
      id: orderItem.id,
      orderId: orderItem.orderId,
      productId: orderItem.productId,
      name: orderItem.name,
      internalCode: orderItem.internalCode,
      quantity: orderItem.quantity,
      price: orderItem.price,
      discountPrice: orderItem.discountPrice,
      selectedOptions: orderItem.selectedOptions,
      orderBundleId: orderItem.orderBundleId,
      createdAt: orderItem.createdAt,
      currentCostPrice: product.costPrice,
    })
    .from(orderItem)
    .leftJoin(product, eq(orderItem.productId, product.id))
    .where(inArray(orderItem.orderId, ids))
    .orderBy(asc(orderItem.createdAt), asc(orderItem.id));

  const bundles: ExportBundleRecord[] = await tx
    .select({
      id: orderBundle.id,
      orderId: orderBundle.orderId,
      instanceId: orderBundle.instanceId,
      campaignSlug: orderBundle.campaignSlug,
      campaignTitle: orderBundle.campaignTitle,
      campaignType: orderBundle.campaignType,
      pricingType: orderBundle.pricingType,
      discountPercent: orderBundle.discountPercent,
      requiredQuantity: orderBundle.requiredQuantity,
      regularTotal: orderBundle.regularTotal,
      bundleTotal: orderBundle.bundleTotal,
      freeShipping: orderBundle.freeShipping,
      offerStacking: orderBundle.offerStacking,
      createdAt: orderBundle.createdAt,
    })
    .from(orderBundle)
    .where(inArray(orderBundle.orderId, ids))
    .orderBy(asc(orderBundle.createdAt), asc(orderBundle.id));

  const logs: ExportLogRecord[] = await tx
    .select({
      orderId: orderLog.orderId,
      createdAt: orderLog.createdAt,
      action: orderLog.action,
      oldStatus: orderLog.oldStatus,
      newStatus: orderLog.newStatus,
      note: orderLog.note,
      actorName: user.name,
    })
    .from(orderLog)
    .leftJoin(user, eq(orderLog.userId, user.id))
    .where(inArray(orderLog.orderId, ids))
    .orderBy(asc(orderLog.createdAt), asc(orderLog.id));

  // Metadata only — the raw payload can carry gateway/courier detail that
  // does not belong in a spreadsheet.
  const webhooks = (await tx
    .select({
      orderId: webhookLog.orderId,
      createdAt: webhookLog.createdAt,
      provider: webhookLog.provider,
      webhookType: webhookLog.webhookType,
      status: webhookLog.status,
      errorMessage: webhookLog.errorMessage,
      processedAt: webhookLog.processedAt,
    })
    .from(webhookLog)
    .where(inArray(webhookLog.orderId, ids))
    .orderBy(asc(webhookLog.createdAt), asc(webhookLog.id))) as ExportWebhookRecord[];

  return {
    items: groupByOrder(items),
    bundles: groupByOrder(bundles),
    logs: groupByOrder(logs),
    webhooks: groupByOrder(webhooks),
  };
}

const cents = (v: string | null) => (v === null ? 0 : Math.round(Number(v) * 100));

function describeFilters(req: ExportOrdersRequest): InfoRow[] {
  if (req.scope === "all") {
    return [{ label: "Scope", value: "All orders (every status and date, no filters)" }];
  }
  const rows: InfoRow[] = [{ label: "Scope", value: "Filtered orders (Orders page filters)" }];
  rows.push({ label: "Status filter", value: req.status ?? "All statuses" });
  if (req.dateFrom || req.dateTo) {
    rows.push({
      label: "Date filter",
      value: `${req.dateLabel ? `${req.dateLabel} — ` : ""}created from ${req.dateFrom ?? "…"} up to (not including) ${req.dateTo ?? "…"} (UTC)`,
    });
  } else {
    rows.push({ label: "Date filter", value: "All time" });
  }
  rows.push({ label: "Payment issues only", value: req.paymentIssueOnly ? "Yes" : "No" });
  rows.push({ label: "Search text", value: req.search ? req.search : "(none)" });
  return rows;
}

/**
 * Builds the workbook for `req` into temporary files and returns it ready to
 * stream. The caller owns the writer and must `dispose()` it.
 */
export async function buildOrdersWorkbook(
  db: DatabaseClient,
  req: ExportOrdersRequest,
  meta: { generatedBy: string; now?: Date; batchSize?: number },
): Promise<{ workbook: XlsxWorkbookWriter; summary: ExportOrdersSummary }> {
  const now = meta.now ?? new Date();
  const batchSize = meta.batchSize ?? EXPORT_BATCH_SIZE;
  const workbook = await XlsxWorkbookWriter.create({
    sheets: ORDERS_WORKBOOK_SHEETS,
    timeZone: EXPORT_TIME_ZONE,
    title: "PERCÉ orders export",
    createdAt: now,
  });

  const summary: ExportOrdersSummary = {
    orders: 0,
    items: 0,
    units: 0,
    bundles: 0,
    historyEntries: 0,
    webhookEntries: 0,
    subtotal: 0,
    discount: 0,
    shipping: 0,
    tax: 0,
    total: 0,
    byStatus: {},
  };
  const totalsCents = { subtotal: 0, discount: 0, shipping: 0, tax: 0, total: 0 };

  try {
    const where = exportWhere(req);

    await db.transaction(
      async (tx) => {
        let cursor: number | undefined;
        for (;;) {
          const conditions = [where, cursor === undefined ? undefined : lt(order.orderNumber, cursor)].filter(
            (c): c is SQL<unknown> => c !== undefined,
          );
          const batch = (await tx
            .select(ORDER_COLUMNS)
            .from(order)
            .leftJoin(promoCode, eq(order.promoCodeId, promoCode.id))
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(order.orderNumber))
            .limit(batchSize)) as ExportOrderRecord[];

          if (batch.length === 0) break;

          const children = await loadChildren(
            tx,
            batch.map((o) => o.id),
          );

          const sheetRows = {
            orders: [] as unknown[][],
            items: [] as unknown[][],
            bundles: [] as unknown[][],
            history: [] as unknown[][],
            webhooks: [] as unknown[][],
          };

          for (const o of batch) {
            const data = {
              order: o,
              items: children.items.get(o.id) ?? [],
              bundles: children.bundles.get(o.id) ?? [],
              logs: children.logs.get(o.id) ?? [],
              webhooks: children.webhooks.get(o.id) ?? [],
            };
            const rows = rowsForOrder(data);
            sheetRows.orders.push(...rows.orders);
            sheetRows.items.push(...rows.items);
            sheetRows.bundles.push(...rows.bundles);
            sheetRows.history.push(...rows.history);
            sheetRows.webhooks.push(...rows.webhooks);

            summary.orders++;
            summary.items += data.items.length;
            summary.units += data.items.reduce((s, i) => s + i.quantity, 0);
            summary.bundles += data.bundles.length;
            summary.historyEntries += data.logs.length;
            summary.webhookEntries += data.webhooks.length;
            summary.byStatus[o.status] = (summary.byStatus[o.status] ?? 0) + 1;
            totalsCents.subtotal += cents(o.subtotal);
            totalsCents.discount += cents(o.discount);
            totalsCents.shipping += cents(o.shipping);
            totalsCents.tax += cents(o.tax);
            totalsCents.total += cents(o.total);
          }

          await workbook.sheet(SHEET.orders).writeRows(sheetRows.orders as never);
          await workbook.sheet(SHEET.items).writeRows(sheetRows.items as never);
          await workbook.sheet(SHEET.bundles).writeRows(sheetRows.bundles as never);
          await workbook.sheet(SHEET.history).writeRows(sheetRows.history as never);
          await workbook.sheet(SHEET.webhooks).writeRows(sheetRows.webhooks as never);

          if (batch.length < batchSize) break;
          cursor = batch[batch.length - 1]!.orderNumber;
        }
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );

    summary.subtotal = totalsCents.subtotal / 100;
    summary.discount = totalsCents.discount / 100;
    summary.shipping = totalsCents.shipping / 100;
    summary.tax = totalsCents.tax / 100;
    summary.total = totalsCents.total / 100;

    const statusOrder = ["pending", "processing", "shipped", "delivered", "cancelled"];
    const statuses = Object.keys(summary.byStatus).sort(
      (a, b) => (statusOrder.indexOf(a) + 1 || 99) - (statusOrder.indexOf(b) + 1 || 99),
    );

    await workbook.sheet(SHEET.info).writeRows(
      infoRows([
        { label: "Export", value: "PERCÉ orders" },
        { label: "Generated at (Cairo time)", value: now },
        { label: "Generated by", value: meta.generatedBy },
        ...describeFilters(req),
        { label: "Orders exported", value: summary.orders },
        ...statuses.map((s) => ({ label: `  Orders with status "${s}"`, value: summary.byStatus[s] ?? 0 })),
        { label: "Order item rows", value: summary.items },
        { label: "Units sold (sum of quantities)", value: summary.units },
        { label: "Set rows", value: summary.bundles },
        { label: "Status history rows", value: summary.historyEntries },
        { label: "Webhook rows", value: summary.webhookEntries },
        { label: "Sum of order subtotals", amount: summary.subtotal },
        { label: "Sum of order discounts", amount: summary.discount },
        { label: "Sum of shipping fees", amount: summary.shipping },
        { label: "Sum of tax", amount: summary.tax },
        { label: "Sum of order totals", amount: summary.total },
        { label: "Currency", value: "EGP — all amounts are as stored on each order" },
        { label: "Times", value: "Shown in Cairo local time (Africa/Cairo)" },
        {
          label: "Discounts",
          value:
            "The order Discount combines Set savings, automatic offers and the promo code; it is not split per line. Line prices on Order Items are before order-level discounts.",
        },
        {
          label: "Cost",
          value: "Unit cost is the product's CURRENT cost price, not a snapshot from the purchase date.",
        },
        {
          label: "Text safety",
          value: "Text that could be read as a spreadsheet formula is prefixed with an apostrophe (').",
        },
      ]),
    );

    await workbook.close();
    return { workbook, summary };
  } catch (err) {
    await workbook.dispose();
    throw err;
  }
}

/** ASCII file name in Cairo time, e.g. perce-orders-all-2026-11-12-1530.xlsx */
export function exportFileName(scope: ExportOrdersRequest["scope"], now: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: EXPORT_TIME_ZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(now)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  );
  return `perce-orders-${scope}-${parts.year}-${parts.month}-${parts.day}-${parts.hour}${parts.minute}.xlsx`;
}
