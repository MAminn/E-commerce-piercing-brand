import type { SocialProofConfig } from "#root/shared/database/drizzle/schema";

/**
 * Server-side sanitisation for the public social-proof feed.
 *
 * Everything in this file is pure so the privacy rules can be tested without
 * a database. The rule the whole feature rests on: an order row goes IN, and
 * only the fields on `PublicSocialProofEvent` come OUT. The row itself is
 * never spread, never partially copied, and never returned — each public
 * field is constructed explicitly below, so a column added to `order` later
 * cannot leak by accident.
 */

/** The complete set of fields the storefront receives per event. */
export interface PublicSocialProofEvent {
  /**
   * Stable per-event key for React and for client-side de-duplication.
   * Deliberately NOT the order id: it is a salted hash, so it identifies the
   * card without being a handle anyone can use against the order API.
   */
  eventKey: string;
  /** "Ahmed M." — never the full customer name. */
  displayName: string;
  /** Broad city/governorate only, or null when location display is off. */
  location: string | null;
  productId: string;
  productSlug: string | null;
  productName: string;
  productImageUrl: string | null;
  occurredAt: Date;
}

/** The shape the feed query hands to the sanitiser. Internal — never returned. */
export interface RawSocialProofRow {
  orderId: string;
  customerName: string;
  shippingCity: string | null;
  shippingState: string | null;
  occurredAt: Date;
  productId: string;
  productSlug: string | null;
  productName: string;
  productImageDiskname: string | null;
}

/**
 * "Ahmed Mohamed Hassan" → "Ahmed M."; "Ahmed" → "Ahmed".
 *
 * Only the first token survives in full, and only the first letter of the
 * second. Anything beyond the second token is dropped entirely rather than
 * initialised — three initials narrow a person down far more than one does.
 * Returns "" for a name with no usable letters, which callers treat as an
 * ineligible row rather than rendering an empty card.
 */
export function sanitizeDisplayName(customerName: string): string {
  const tokens = (customerName ?? "")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const first = tokens[0];
  if (!first) return "";

  const second = tokens[1];
  if (!second) return first;

  // Take the first character by code point so an Arabic or accented initial
  // isn't sliced into half a surrogate pair.
  const initial = [...second][0];
  return initial ? `${first} ${initial}.` : first;
}

/**
 * Broad location only, per config. `city` reads the shipping city and
 * `governorate` the shipping state — both are area-level fields. The street
 * address, building and apartment are never read here, and are not even
 * selected by the feed query.
 */
export function sanitizeLocation(
  row: Pick<RawSocialProofRow, "shippingCity" | "shippingState">,
  config: Pick<SocialProofConfig, "showLocation" | "locationSource">,
): string | null {
  if (!config.showLocation) return null;
  const raw =
    config.locationSource === "governorate" ? row.shippingState : row.shippingCity;
  const trimmed = (raw ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Uploaded files are served from /uploads/<diskname> (same convention as the
 * order and product views). A row with no image still produces an event —
 * the card falls back to a neutral stage rather than disappearing.
 */
export function productImageUrl(diskname: string | null): string | null {
  const value = (diskname ?? "").trim();
  if (!value) return null;
  if (value.startsWith("http") || value.startsWith("/")) return value;
  return `/uploads/${value}`;
}

/**
 * Non-reversible, non-enumerable event key.
 *
 * FNV-1a over the order id plus a fixed salt. It is not a security boundary
 * (nothing is gated on it) — it exists so the public payload carries no
 * order identifier at all, not even an opaque-looking one that is really the
 * primary key. Deterministic, so the same order produces the same key across
 * requests and the client can de-duplicate.
 */
export function eventKeyForOrder(orderId: string): string {
  const input = `perce-social-proof:${orderId}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `sp_${hash.toString(36)}`;
}

/**
 * Collapses raw rows into at most one public event per order.
 *
 * Rows arrive newest-first with one row per eligible order item, so an order
 * containing four products would otherwise produce four consecutive toasts
 * naming the same buyer — which both bores the visitor and, by repetition,
 * says more about that person than a single card does. The first eligible
 * item per order wins and the rest of that order is discarded.
 *
 * A row whose name sanitises to nothing is dropped: a card reading
 * "in Cairo just ordered" is worse than no card.
 */
export function toPublicEvents(
  rows: RawSocialProofRow[],
  config: Pick<SocialProofConfig, "showLocation" | "locationSource">,
  limit: number,
): PublicSocialProofEvent[] {
  const seenOrders = new Set<string>();
  const events: PublicSocialProofEvent[] = [];

  for (const row of rows) {
    if (events.length >= limit) break;
    if (seenOrders.has(row.orderId)) continue;

    const displayName = sanitizeDisplayName(row.customerName);
    if (!displayName) continue;

    seenOrders.add(row.orderId);
    events.push({
      eventKey: eventKeyForOrder(row.orderId),
      displayName,
      location: sanitizeLocation(row, config),
      productId: row.productId,
      productSlug: row.productSlug,
      productName: row.productName,
      productImageUrl: productImageUrl(row.productImageDiskname),
      occurredAt: row.occurredAt,
    });
  }

  return events;
}
