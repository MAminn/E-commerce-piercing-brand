import { courierOf, type CourierFields } from "#root/backend/erp-sync/export-service";
import { formatOrderNumber } from "#root/shared/orders/order-number";
import { effectiveUnitPriceFromRow } from "#root/shared/pricing/effective-price";
import { describeShippingSnapshot } from "#root/shared/shipping/describe-snapshot";
import type { ShippingSnapshot } from "#root/shared/shipping/quote";
import type { CellValue, ColumnKind, ColumnSpec, SheetSpec } from "./xlsx-writer";

/**
 * WHAT THE ORDERS WORKBOOK CONTAINS — one definition per sheet, header and
 * value side by side so a column can never drift from its data.
 *
 * Every value is read from what the database stores for the order. Snapshots
 * stay snapshots (line name, SKU and prices as sold; Set totals as charged).
 * Nothing is recomputed from current rules. The few derived columns (counts,
 * a line's charged total, a Set's savings) are plain arithmetic on stored
 * numbers, using the same rules the checkout used, and their headers say so.
 *
 * Deliberately NOT exported: raw payment-gateway and courier webhook
 * payloads, payment session ids, and anything from the user/auth tables
 * beyond a staff member's display name on a status change.
 */

export const EXPORT_TIME_ZONE = "Africa/Cairo";
export const EXPORT_CURRENCY = "EGP";

export type ExportOrderRecord = CourierFields & {
  id: string;
  orderNumber: number;
  userId: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: string;
  shippingDistrict: string;
  shippingCity: string;
  shippingState: string;
  shippingPostalCode: string;
  shippingCountry: string;
  shippingGovernorateCode: string | null;
  subtotal: string;
  shipping: string;
  shippingQuote: ShippingSnapshot | null;
  tax: string;
  discount: string | null;
  promoCode: string | null;
  total: string;
  status: string;
  notes: string | null;
  paymentMethod: string;
  paymentStatus: string;
  paymentTransactionId: string | null;
  createdAt: Date;
  updatedAt: Date | null;
  fincartRejectionReason: string | null;
  fincartSupportNote: string | null;
  bostaSyncStatus: string | null;
  bostaSyncError: string | null;
  bostaSyncedAt: Date | null;
  archivedAt: Date | null;
  stockRestored: boolean;
};

export type ExportItemRecord = {
  id: string;
  orderId: string;
  productId: string;
  name: string;
  internalCode: string | null;
  quantity: number;
  price: string;
  discountPrice: string | null;
  selectedOptions: Record<string, string> | null;
  orderBundleId: string | null;
  createdAt: Date;
  /** The product's CURRENT cost price (product.cost_price) — not a purchase-time snapshot. */
  currentCostPrice: string | null;
};

export type ExportBundleRecord = {
  id: string;
  orderId: string;
  instanceId: string;
  campaignSlug: string;
  campaignTitle: string;
  campaignType: string;
  pricingType: string;
  discountPercent: string | null;
  requiredQuantity: number;
  regularTotal: string;
  bundleTotal: string;
  freeShipping: boolean;
  offerStacking: string;
  createdAt: Date;
};

export type ExportLogRecord = {
  orderId: string;
  createdAt: Date;
  action: string;
  oldStatus: string | null;
  newStatus: string | null;
  note: string | null;
  /** Display name of the signed-in user who made the change; null for system/webhook events. */
  actorName: string | null;
};

export type ExportWebhookRecord = {
  orderId: string;
  createdAt: Date;
  provider: string;
  webhookType: string;
  status: string;
  errorMessage: string | null;
  processedAt: Date | null;
};

/** Everything the workbook needs about one order. */
export type ExportOrderBundle = {
  order: ExportOrderRecord;
  items: readonly ExportItemRecord[];
  bundles: readonly ExportBundleRecord[];
  logs: readonly ExportLogRecord[];
  webhooks: readonly ExportWebhookRecord[];
};

type ColumnDef<Ctx> = ColumnSpec & { get: (ctx: Ctx) => CellValue };

const col = <Ctx>(
  header: string,
  kind: ColumnKind,
  width: number,
  get: (ctx: Ctx) => CellValue,
): ColumnDef<Ctx> => ({ header, kind, width, get });

/** A stored decimal string as a number rounded to cents; null stays null. */
export function money(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function formatSelectedOptions(options: Record<string, string> | null | undefined): string {
  if (!options) return "";
  return Object.entries(options)
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");
}

export function fullShippingAddress(o: ExportOrderRecord): string {
  return [
    o.shippingAddress,
    o.shippingDistrict,
    o.shippingCity,
    o.shippingState,
    o.shippingPostalCode,
    o.shippingCountry,
  ]
    .map((p) => (p ?? "").trim())
    .filter((p) => p !== "")
    .join(", ");
}

/**
 * When the order was marked delivered, from its status history: the latest
 * transition INTO "delivered". Blank when the order is not delivered now (a
 * stale delivered date would be wrong) or when no history row records it.
 */
export function deliveredAt(o: ExportOrderRecord, logs: readonly ExportLogRecord[]): Date | null {
  if (o.status !== "delivered") return null;
  let latest: Date | null = null;
  for (const l of logs) {
    if (l.newStatus === "delivered" && (!latest || l.createdAt > latest)) latest = l.createdAt;
  }
  return latest;
}

/** One unit's charged price before order-level discounts — the checkout's own rule. */
export function chargedUnitPrice(item: Pick<ExportItemRecord, "price" | "discountPrice">): number {
  return Math.round(effectiveUnitPriceFromRow(item) * 100) / 100;
}

const cents = (n: number) => Math.round(n * 100);

export function lineTotal(item: Pick<ExportItemRecord, "price" | "discountPrice" | "quantity">): number {
  return (cents(chargedUnitPrice(item)) * item.quantity) / 100;
}

export function lineSaleDiscount(item: Pick<ExportItemRecord, "price" | "discountPrice" | "quantity">): number {
  return ((cents(Number(item.price)) - cents(chargedUnitPrice(item))) * item.quantity) / 100;
}

const courierLabel = (provider: string | null) =>
  provider === "bosta" ? "Bosta" : provider === "fincart" ? "Fincart" : null;

// ─── Sheet 1: Orders ────────────────────────────────────────────────────────

const ORDER_COLUMNS: ColumnDef<ExportOrderBundle>[] = [
  col("Order number", "integer", 12, ({ order: o }) => o.orderNumber),
  col("Order reference", "text", 11, ({ order: o }) => formatOrderNumber(o.orderNumber)),
  col("Order ID", "text", 38, ({ order: o }) => o.id),
  col("Created at (Cairo time)", "datetime", 20, ({ order: o }) => o.createdAt),
  col("Last updated (Cairo time)", "datetime", 20, ({ order: o }) => o.updatedAt),
  col("Order status", "text", 12, ({ order: o }) => o.status),
  col("Payment method", "text", 13, ({ order: o }) => o.paymentMethod),
  col("Payment status", "text", 13, ({ order: o }) => o.paymentStatus),
  col("Payment transaction ID", "text", 24, ({ order: o }) => o.paymentTransactionId),
  col("Customer name", "text", 24, ({ order: o }) => o.customerName),
  col("Customer email", "text", 28, ({ order: o }) => o.customerEmail),
  col("Customer phone", "text", 16, ({ order: o }) => o.customerPhone),
  col("Registered customer", "text", 11, ({ order: o }) => o.userId !== null),
  col("Full shipping address", "text", 48, ({ order: o }) => fullShippingAddress(o)),
  col("Street address", "text", 36, ({ order: o }) => o.shippingAddress),
  col("District", "text", 16, ({ order: o }) => o.shippingDistrict),
  col("City", "text", 16, ({ order: o }) => o.shippingCity),
  col("Governorate", "text", 16, ({ order: o }) => o.shippingState),
  col("Governorate code", "text", 11, ({ order: o }) => o.shippingGovernorateCode),
  col("Postal code", "text", 10, ({ order: o }) => o.shippingPostalCode),
  col("Country", "text", 10, ({ order: o }) => o.shippingCountry),
  col("Line items", "integer", 8, ({ items }) => items.length),
  col("Units", "integer", 8, ({ items }) => items.reduce((sum, i) => sum + i.quantity, 0)),
  col("Subtotal (EGP)", "money", 13, ({ order: o }) => money(o.subtotal)),
  col("Discount (EGP) — Sets + offers + promo code", "money", 16, ({ order: o }) => money(o.discount)),
  col("Promo code", "text", 14, ({ order: o }) => o.promoCode),
  col("Shipping fee (EGP)", "money", 12, ({ order: o }) => money(o.shipping)),
  col("Shipping pricing", "text", 34, ({ order: o }) => describeShippingSnapshot(o.shippingQuote)),
  col("Free shipping applied", "text", 11, ({ order: o }) =>
    o.shippingQuote ? Boolean(o.shippingQuote.freeShippingApplied) : null,
  ),
  col("Tax (EGP)", "money", 10, ({ order: o }) => money(o.tax)),
  col("Total (EGP)", "money", 13, ({ order: o }) => money(o.total)),
  col("Currency", "text", 9, () => EXPORT_CURRENCY),
  col("Sets in order", "integer", 8, ({ bundles }) => bundles.length),
  col("Order notes", "text", 36, ({ order: o }) => o.notes),
  col("Shipping provider", "text", 12, ({ order: o }) => courierLabel(courierOf(o).provider)),
  col("Courier delivery ID", "text", 24, ({ order: o }) => o.bostaDeliveryId),
  col("Tracking number", "text", 18, ({ order: o }) => courierOf(o).trackingNumber),
  col("Return tracking number", "text", 18, ({ order: o }) => courierOf(o).returnTrackingNumber),
  col("Shipment status (courier)", "text", 22, ({ order: o }) => courierOf(o).rawStatus),
  col("Shipment status code / sub-status", "text", 16, ({ order: o }) => {
    const c = courierOf(o);
    return c.rawStatusCode ?? c.rawSubStatus;
  }),
  col("Shipment status updated (Cairo time)", "datetime", 20, ({ order: o }) => {
    const at = courierOf(o).statusUpdatedAt;
    return at ? new Date(at) : null;
  }),
  col("Courier rejection reason", "text", 24, ({ order: o }) => o.fincartRejectionReason),
  col("Courier support note", "text", 24, ({ order: o }) => o.fincartSupportNote),
  col("Bosta sync status", "text", 12, ({ order: o }) => o.bostaSyncStatus),
  col("Bosta sync error", "text", 30, ({ order: o }) => o.bostaSyncError),
  col("Sent to Bosta at (Cairo time)", "datetime", 20, ({ order: o }) => o.bostaSyncedAt),
  col("Delivered at (Cairo time, from status history)", "datetime", 20, ({ order: o, logs }) => deliveredAt(o, logs)),
  col("Stock restored", "text", 9, ({ order: o }) => o.stockRestored),
  col("Archived at (Cairo time)", "datetime", 20, ({ order: o }) => o.archivedAt),
];

// ─── Sheet 2: Order Items ───────────────────────────────────────────────────

type ItemCtx = { data: ExportOrderBundle; item: ExportItemRecord; lineNo: number; bundle: ExportBundleRecord | undefined };

const ITEM_COLUMNS: ColumnDef<ItemCtx>[] = [
  col("Order number", "integer", 12, ({ data }) => data.order.orderNumber),
  col("Order ID", "text", 38, ({ data }) => data.order.id),
  col("Order created at (Cairo time)", "datetime", 20, ({ data }) => data.order.createdAt),
  col("Order status", "text", 12, ({ data }) => data.order.status),
  col("Line", "integer", 6, ({ lineNo }) => lineNo),
  col("Product ID", "text", 38, ({ item }) => item.productId),
  col("Product name (as sold)", "text", 36, ({ item }) => item.name),
  col("SKU / internal code (as sold)", "text", 16, ({ item }) => item.internalCode),
  col("Variant / selected options", "text", 26, ({ item }) => formatSelectedOptions(item.selectedOptions)),
  col("Quantity", "integer", 9, ({ item }) => item.quantity),
  col("Regular unit price (EGP)", "money", 13, ({ item }) => money(item.price)),
  col("Sale unit price (EGP)", "money", 13, ({ item }) => money(item.discountPrice)),
  col("Charged unit price before order discounts (EGP)", "money", 16, ({ item }) => chargedUnitPrice(item)),
  col("Sale discount on line (EGP)", "money", 13, ({ item }) => lineSaleDiscount(item)),
  col("Line total before order discounts (EGP)", "money", 15, ({ item }) => lineTotal(item)),
  col("Current unit cost (EGP, not a purchase-time snapshot)", "money", 16, ({ item }) => money(item.currentCostPrice)),
  col("Set name", "text", 22, ({ bundle }) => bundle?.campaignTitle),
  col("Set type", "text", 16, ({ bundle }) => bundle?.campaignType),
  col("Set ID", "text", 38, ({ item }) => item.orderBundleId),
  col("Order item ID", "text", 38, ({ item }) => item.id),
];

// ─── Sheet 3: Sets (bundle snapshots) ──────────────────────────────────────

type BundleCtx = { data: ExportOrderBundle; bundle: ExportBundleRecord };

const BUNDLE_COLUMNS: ColumnDef<BundleCtx>[] = [
  col("Order number", "integer", 12, ({ data }) => data.order.orderNumber),
  col("Order ID", "text", 38, ({ data }) => data.order.id),
  col("Set ID", "text", 38, ({ bundle }) => bundle.id),
  col("Set name", "text", 24, ({ bundle }) => bundle.campaignTitle),
  col("Set slug", "text", 18, ({ bundle }) => bundle.campaignSlug),
  col("Set type", "text", 16, ({ bundle }) => bundle.campaignType),
  col("Pricing type", "text", 18, ({ bundle }) => bundle.pricingType),
  col("Discount %", "decimal", 10, ({ bundle }) => money(bundle.discountPercent)),
  col("Units in set", "integer", 9, ({ bundle }) => bundle.requiredQuantity),
  col("Regular total (EGP)", "money", 13, ({ bundle }) => money(bundle.regularTotal)),
  col("Charged total (EGP)", "money", 13, ({ bundle }) => money(bundle.bundleTotal)),
  col("Set savings (EGP)", "money", 12, ({ bundle }) =>
    (cents(Number(bundle.regularTotal)) - cents(Number(bundle.bundleTotal))) / 100,
  ),
  col("Free shipping", "text", 9, ({ bundle }) => bundle.freeShipping),
  col("Offer stacking", "text", 14, ({ bundle }) => bundle.offerStacking),
  col("Cart instance ID", "text", 26, ({ bundle }) => bundle.instanceId),
];

// ─── Sheet 4: Status History (order_log) ───────────────────────────────────

type LogCtx = { data: ExportOrderBundle; log: ExportLogRecord };

const LOG_COLUMNS: ColumnDef<LogCtx>[] = [
  col("Order number", "integer", 12, ({ data }) => data.order.orderNumber),
  col("Order ID", "text", 38, ({ data }) => data.order.id),
  col("Date (Cairo time)", "datetime", 20, ({ log }) => log.createdAt),
  col("Event", "text", 24, ({ log }) => log.action),
  col("From status", "text", 12, ({ log }) => log.oldStatus),
  col("To status", "text", 12, ({ log }) => log.newStatus),
  col("Note", "text", 48, ({ log }) => log.note),
  col("Changed by", "text", 20, ({ log }) => log.actorName),
];

// ─── Sheet 5: Payment & Courier Webhooks (metadata only) ───────────────────

type WebhookCtx = { data: ExportOrderBundle; webhook: ExportWebhookRecord };

const WEBHOOK_COLUMNS: ColumnDef<WebhookCtx>[] = [
  col("Order number", "integer", 12, ({ data }) => data.order.orderNumber),
  col("Order ID", "text", 38, ({ data }) => data.order.id),
  col("Received at (Cairo time)", "datetime", 20, ({ webhook }) => webhook.createdAt),
  col("Provider", "text", 12, ({ webhook }) => webhook.provider),
  col("Type", "text", 16, ({ webhook }) => webhook.webhookType),
  col("Processing status", "text", 12, ({ webhook }) => webhook.status),
  col("Error", "text", 40, ({ webhook }) => webhook.errorMessage),
  col("Processed at (Cairo time)", "datetime", 20, ({ webhook }) => webhook.processedAt),
];

// ─── Sheet 6: Export Info ──────────────────────────────────────────────────

export type InfoRow = { label: string; value?: string | number | Date | null; amount?: number | null };

const INFO_COLUMNS: ColumnDef<InfoRow>[] = [
  col("Item", "text", 44, (r) => r.label),
  col("Value", "text", 60, (r) => r.value ?? null),
  col("Amount (EGP)", "money", 16, (r) => r.amount ?? null),
];

export const SHEET = {
  orders: "Orders",
  items: "Order Items",
  bundles: "Sets",
  history: "Status History",
  webhooks: "Payment & Courier Webhooks",
  info: "Export Info",
} as const;

const spec = (name: string, columns: readonly ColumnSpec[]): SheetSpec => ({
  name,
  columns: columns.map(({ header, kind, width }) => ({ header, kind, width })),
});

/** Workbook sheet order: Orders first, Order Items second, Export Info last. */
export const ORDERS_WORKBOOK_SHEETS: readonly SheetSpec[] = [
  spec(SHEET.orders, ORDER_COLUMNS),
  spec(SHEET.items, ITEM_COLUMNS),
  spec(SHEET.bundles, BUNDLE_COLUMNS),
  spec(SHEET.history, LOG_COLUMNS),
  spec(SHEET.webhooks, WEBHOOK_COLUMNS),
  spec(SHEET.info, INFO_COLUMNS),
];

const row = <Ctx>(columns: readonly ColumnDef<Ctx>[], ctx: Ctx): CellValue[] => columns.map((c) => c.get(ctx));

export type OrderSheetRows = {
  orders: CellValue[][];
  items: CellValue[][];
  bundles: CellValue[][];
  history: CellValue[][];
  webhooks: CellValue[][];
};

/** All rows one order contributes, sheet by sheet. Pure. */
export function rowsForOrder(data: ExportOrderBundle): OrderSheetRows {
  const bundleById = new Map(data.bundles.map((b) => [b.id, b]));
  return {
    orders: [row(ORDER_COLUMNS, data)],
    items: data.items.map((item, i) =>
      row(ITEM_COLUMNS, {
        data,
        item,
        lineNo: i + 1,
        bundle: item.orderBundleId ? bundleById.get(item.orderBundleId) : undefined,
      }),
    ),
    bundles: data.bundles.map((bundle) => row(BUNDLE_COLUMNS, { data, bundle })),
    history: data.logs.map((log) => row(LOG_COLUMNS, { data, log })),
    webhooks: data.webhooks.map((webhook) => row(WEBHOOK_COLUMNS, { data, webhook })),
  };
}

export function infoRows(rows: readonly InfoRow[]): CellValue[][] {
  return rows.map((r) => row(INFO_COLUMNS, r));
}
