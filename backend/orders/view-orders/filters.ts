import { order, orderItem } from "#root/shared/database/drizzle/schema";
import {
  and,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

export type OrderStatusFilter =
  | "pending"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

/** The admin Orders page's server-side filters (status, date range, payment issues). */
export type OrderListFilters = {
  status?: OrderStatusFilter;
  /** Inclusive start of the createdAt range (ISO datetime string) */
  dateFrom?: string;
  /** Exclusive end of the createdAt range (ISO datetime string) */
  dateTo?: string;
  paymentIssueOnly?: boolean;
};

/**
 * WHERE conditions for the Orders page filters. One definition shared by the
 * paginated list (`order.view`) and the Excel export, so "Export filtered
 * orders" can never disagree with what the table shows for the same filters.
 */
export function orderFilterConditions(filters: OrderListFilters): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [];
  const { status, dateFrom, dateTo, paymentIssueOnly } = filters;

  if (status) {
    conditions.push(eq(order.status, status));
  }

  if (dateFrom) {
    conditions.push(gte(order.createdAt, new Date(dateFrom)));
  }
  if (dateTo) {
    conditions.push(lt(order.createdAt, new Date(dateTo)));
  }

  if (paymentIssueOnly) {
    conditions.push(
      and(
        inArray(order.paymentMethod, ["stripe", "paymob"]),
        notInArray(order.paymentStatus, ["paid", "refunded"]),
        or(
          isNotNull(order.bostaDeliveryId),
          inArray(order.bostaSyncStatus, ["sent", "pending"]),
        )!,
      )!,
    );
  }

  return conditions;
}

/** Escapes LIKE wildcards so the admin's text is matched literally. */
function likeLiteral(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Upper bound on the search text, shared by order.view and the export. */
export const ORDER_SEARCH_MAX_LENGTH = 200;

/**
 * The Orders page search box, applied in the database so it covers every
 * order, not just the loaded page. Used by the paginated list (`order.view`)
 * and the Excel export, so the table, its count and the export always agree.
 *
 * Matches when the order id, order number ("10001" / "#10001"), customer
 * name, customer email or any line's product name contains the text,
 * case-insensitively (English; Arabic has no case). Leading and trailing
 * spaces are ignored. For the customer name, runs of spaces count as one on
 * both sides, so "Mona  Ali" and "Mona Ali" find each other — the checkout
 * has a single free-text "Full Name" field. Returns undefined for an empty
 * or all-space query.
 */
export function orderSearchCondition(rawQuery: string | undefined): SQL<unknown> | undefined {
  if (!rawQuery) return undefined;
  const q = rawQuery.trim().toLowerCase();
  if (q === "") return undefined;

  const pattern = `%${likeLiteral(q)}%`;
  const namePattern = `%${likeLiteral(q.replace(/\s+/g, " "))}%`;
  const parts: SQL<unknown>[] = [
    sql`${order.id}::text ilike ${pattern}`,
    sql`regexp_replace(${order.customerName}, ${"\\s+"}, ' ', 'g') ilike ${namePattern}`,
    sql`${order.customerEmail} ilike ${pattern}`,
    sql`exists (select 1 from ${orderItem} where ${orderItem.orderId} = ${order.id} and ${orderItem.name} ilike ${pattern})`,
  ];

  // Same rule as matchesOrderNumber(): trimmed, one leading "#" ignored.
  const numberQuery = q.replace(/^#/, "");
  if (numberQuery !== "") {
    parts.push(sql`${order.orderNumber}::text like ${`%${likeLiteral(numberQuery)}%`}`);
  }

  return or(...parts);
}
