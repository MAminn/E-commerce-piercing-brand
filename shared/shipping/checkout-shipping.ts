import { deriveEffectiveShipping } from "#root/shared/pricing/cart-math";
import type { ShippingQuoteResponse } from "./quote";

/**
 * What the cart / checkout summary should say on its shipping line, derived
 * from the latest server quote plus the offers currently applied. Pure, so
 * the cart context, both checkout templates and the tests all agree.
 *
 *   pending     — no usable quote yet (zones mode with no destination, or
 *                 the quote has not come back): "Calculated at checkout".
 *                 `fee` is 0 so totals are the goods total.
 *   quoted      — the exact fee is known. `baseFee` is the rule fee; `fee`
 *                 is what will be charged after a free-shipping offer or
 *                 free-shipping promo code.
 *   unavailable — the merchant does not deliver to this destination; the
 *                 order cannot be placed.
 */
export type ShippingLine =
  | { status: "pending"; fee: 0; baseFee: 0 }
  | {
      status: "quoted";
      baseFee: number;
      fee: number;
      freeShipping: boolean;
      governorateName: string | null;
    }
  | { status: "unavailable"; fee: 0; baseFee: 0; governorateName: string | null };

export type ShippingLineStatus = ShippingLine["status"];

export interface ShippingWaivers {
  /** A qualifying free-shipping promo code (e.g. PICK6). */
  promoFreeShipping?: boolean;
  /** A valid free-shipping Pick Your Set in the cart (e.g. a complete PICK6). */
  bundleFreeShipping?: boolean;
}

/**
 * Whether a free-shipping benefit the cart already qualifies for waives the
 * fee. Each source is destination-independent — it zeroes the quote of EVERY
 * deliverable governorate — which is what lets the cart say "Free" before a
 * governorate is chosen. It never makes an undeliverable destination
 * deliverable (see deriveShippingLine).
 */
export function isShippingWaived(
  appliedOffers: readonly { freeShipping: boolean }[],
  waivers: ShippingWaivers = {},
): boolean {
  return Boolean(waivers.promoFreeShipping || waivers.bundleFreeShipping || appliedOffers.some((o) => o.freeShipping));
}

export function deriveShippingLine(
  response: ShippingQuoteResponse | null | undefined,
  appliedOffers: readonly { freeShipping: boolean }[],
  /**
   * A qualifying promo code with free shipping (e.g. PICK6), or a
   * free-shipping Pick Your Set in the cart. Like an offer it only ever
   * zeroes an AVAILABLE quote: an unavailable destination stays unavailable,
   * and a pending quote stays pending.
   */
  options: ShippingWaivers = {},
): ShippingLine {
  if (!response) return { status: "pending", fee: 0, baseFee: 0 };
  const { quote } = response;
  if (!quote.available) {
    if (quote.reason === "destination_unavailable") {
      return { status: "unavailable", fee: 0, baseFee: 0, governorateName: quote.governorateName };
    }
    return { status: "pending", fee: 0, baseFee: 0 };
  }
  // Zeroed once, whichever (and however many) free-shipping sources qualify.
  const fee =
    options.promoFreeShipping || options.bundleFreeShipping
      ? 0
      : deriveEffectiveShipping(quote.amount, appliedOffers);
  return {
    status: "quoted",
    baseFee: quote.amount,
    fee,
    freeShipping: fee === 0 && quote.amount > 0,
    governorateName: quote.governorateName,
  };
}

/**
 * The amount the cart / checkout SUMMARY's shipping row should show, or
 * `undefined` for "no numeric row" (the templates then show their pending /
 * unavailable wording, or nothing).
 *
 *   quoted, fee > 0                       → the governorate fee
 *   quoted, fee waived (set / code / offer) → 0, which every template renders
 *                                           as "Free" / "مجاني" — the row must
 *                                           not vanish just because it is 0
 *   quoted, zero-rate zone                → 0 ("Free"), a real quote
 *   quoted, flat mode with no fee set     → undefined (unchanged: a store
 *                                           that charges no shipping at all
 *                                           shows no shipping row)
 *   pending / unavailable                 → undefined (status wording instead)
 */
export function summaryShippingAmount(line: ShippingLine, mode: "flat" | "zones"): number | undefined {
  if (line.status !== "quoted") return undefined;
  if (line.fee > 0) return line.fee;
  if (line.freeShipping || mode === "zones") return 0;
  return undefined;
}

/**
 * The CART page's shipping row. The cart knows no governorate, so in zones
 * mode the quote is pending ("Calculated at checkout") — unless the cart
 * already holds a free-shipping benefit (a valid PICK6, a qualifying
 * free-shipping code or offer). Those waive every deliverable destination, so
 * the row says "Free" (`waived`, amount 0) instead of promising a fee that
 * will not be charged. A cart that loses the benefit (a piece removed, the
 * code no longer qualifying) is back to pending on the next render; an
 * unavailable destination stays unavailable.
 */
export type CartShippingStatus = ShippingLineStatus | "waived";

export function cartSummaryShipping(
  line: ShippingLine,
  mode: "flat" | "zones",
  waived: boolean,
): { shipping: number | undefined; shippingStatus: CartShippingStatus } {
  if (line.status === "pending" && waived) return { shipping: 0, shippingStatus: "waived" };
  return { shipping: summaryShippingAmount(line, mode), shippingStatus: line.status };
}

/** Whether "Place order" may be pressed as far as shipping is concerned. */
export function canPlaceOrderWithShipping(line: ShippingLine): boolean {
  return line.status === "quoted";
}
