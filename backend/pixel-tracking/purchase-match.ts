import { eq } from "drizzle-orm";
import { order } from "#root/shared/database/drizzle/schema";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import type { HashedMetaUserData } from "#root/shared/tracking/meta-user-data";
import { hashMetaIdentity } from "#root/backend/pixel-tracking/meta-user-data";

/**
 * Hashed customer data for a Purchase, read from the real order it names.
 *
 * Enrichment only: whether or not an order matches, the Purchase is relayed
 * exactly as before (same event_id, value, currency, contents). A match only
 * adds hashed em / ph / fn / ln / ct / st / zp / country to user_data.
 * Never carries raw customer data.
 */
export interface PurchaseMatch {
  orderId: string;
  hashedUserData: HashedMetaUserData;
}

/** How long after placement a Purchase beacon may still be enriched. */
export const PURCHASE_MATCH_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mirrors pages/order-confirmation/confirmation-state.ts: what counts as placed. */
const NOT_PLACED = new Set(["pending", "processing", "failed"]);

export interface OrderRowForMatch {
  id: string;
  createdAt: Date;
  paymentStatus: string;
  status: string;
  customerEmail: string | null;
  customerPhone: string | null;
  customerName: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingPostalCode: string | null;
  shippingCountry: string | null;
}

/** Pure decision on a fetched row (unit-tested). */
export function matchFromOrderRow(row: OrderRowForMatch | undefined, now: Date): PurchaseMatch | null {
  if (!row) return null;
  if (NOT_PLACED.has(row.paymentStatus)) return null;
  if (row.status === "cancelled") return null;
  const age = now.getTime() - row.createdAt.getTime();
  if (!(age >= -5 * 60 * 1000 && age <= PURCHASE_MATCH_MAX_AGE_MS)) return null;
  return {
    orderId: row.id,
    hashedUserData: hashMetaIdentity({
      email: row.customerEmail,
      phone: row.customerPhone,
      name: row.customerName,
      city: row.shippingCity,
      state: row.shippingState,
      zip: row.shippingPostalCode,
      country: row.shippingCountry,
    }),
  };
}

/**
 * Look up the order a `checkout_completed` beacon names. Null when the id is
 * not a UUID, the order does not exist, is not placed (pending / failed
 * online payment), is cancelled, or was placed more than 24 h ago. Read-only
 * (one SELECT by primary key); the PII it reads is hashed before this
 * function returns and is never logged.
 */
export async function loadPurchaseMatch(
  db: DatabaseClient,
  orderId: string | undefined,
  now: Date = new Date(),
): Promise<PurchaseMatch | null> {
  if (!orderId || !UUID_RE.test(orderId)) return null;
  try {
    const [row] = await db
      .select({
        id: order.id,
        createdAt: order.createdAt,
        paymentStatus: order.paymentStatus,
        status: order.status,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        customerName: order.customerName,
        shippingCity: order.shippingCity,
        shippingState: order.shippingState,
        shippingPostalCode: order.shippingPostalCode,
        shippingCountry: order.shippingCountry,
      })
      .from(order)
      .where(eq(order.id, orderId))
      .limit(1);
    return matchFromOrderRow(row as OrderRowForMatch | undefined, now);
  } catch {
    // Fixed message only: a driver error could echo row data.
    console.error("[Delivery Pipeline] Purchase order lookup failed");
    return null;
  }
}
