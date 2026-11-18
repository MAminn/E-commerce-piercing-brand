/**
 * Shared vocabulary of the ABS tracking integration. The DB stores these as
 * plain text (shared/database/drizzle/schema.ts, abs_* tables).
 */

/** ABS `/shipments/list` status enum, plus the two event-code-only states and UNKNOWN. */
export const CANONICAL_STATUSES = [
  "NEW",
  "AWAITING_PICKUP",
  "PICKED_UP",
  "AT_ORIGIN_BRANCH",
  "IN_TRANSIT",
  "AT_DESTINATION_BRANCH",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "PARTIALLY_DELIVERED",
  "DELIVERY_REVERTED",
  "UNDELIVERED",
  "HOLD_DECISION",
  "REOPERATE",
  "RETURN_INITIATED",
  "RETURN_IN_TRANSIT",
  "AT_RETURN_BRANCH",
  "OUT_FOR_RETURN",
  "RETURNED_TO_SHIPPER",
  "REROUTE_INITIATED",
  "INVESTIGATION",
  "LOST",
  "DAMAGED",
  "CANCELED",
  "STOCK_IN",
  "UNDER_REVISION",
  "UNKNOWN",
] as const;
export type CanonicalStatus = (typeof CANONICAL_STATUSES)[number];

export const TRANSIT_STATUSES: readonly CanonicalStatus[] = [
  "PICKED_UP",
  "AT_ORIGIN_BRANCH",
  "IN_TRANSIT",
  "AT_DESTINATION_BRANCH",
  "OUT_FOR_DELIVERY",
];
export const RETURNING_STATUSES: readonly CanonicalStatus[] = [
  "RETURN_INITIATED",
  "RETURN_IN_TRANSIT",
  "AT_RETURN_BRANCH",
  "OUT_FOR_RETURN",
];

export type CmpService = "DELIVERY" | "REVERSE" | "EXCHANGE" | "CASH_COLLECTION";

export type LinkRole = "primary" | "reverse" | "exchange" | "other";
export type LinkState = "auto" | "needs_review" | "confirmed" | "rejected" | "unmatched";
export type LinkMethod = "reference" | "phone_amount" | "phone_amount_fuzzy" | "manual";

export type DecisionKind =
  | "no_action"
  | "would_mark_shipped"
  | "would_mark_delivered"
  | "needs_return_confirmation"
  | "alert";

/** Website `order_status` enum (read-only here). */
export type WebsiteOrderStatus = "pending" | "processing" | "shipped" | "delivered" | "cancelled";

/** A shipment row after validation + normalisation (what we store in abs_shipment). */
export interface NormalizedShipment {
  awb: string;
  reference: string | null;
  cmpService: string | null;
  statusRaw: string | null;
  status: CanonicalStatus;
  lastEventCode: string | null;
  lastReason: string | null;
  cash: number | null;
  collectedCash: number | null;
  absFees: number | null;
  totalFees: number | null;
  isPaid: boolean | null;
  paymentDate: Date | null;
  deliveryDate: Date | null;
  absCreatedAt: Date | null;
  consigneePhoneNorm: string | null;
  consigneePhoneLast4: string | null;
  noOfPieces: number | null;
  originAwb: string | null;
  raw: Record<string, unknown>;
}
