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

export function deriveShippingLine(
  response: ShippingQuoteResponse | null | undefined,
  appliedOffers: readonly { freeShipping: boolean }[],
  /**
   * A qualifying promo code with free shipping (e.g. PICK6), or a
   * free-shipping Pick Your Set in the cart. Like an offer it only ever
   * zeroes an AVAILABLE quote: an unavailable destination stays unavailable,
   * and a pending quote stays pending.
   */
  options: { promoFreeShipping?: boolean; bundleFreeShipping?: boolean } = {},
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

/** Whether "Place order" may be pressed as far as shipping is concerned. */
export function canPlaceOrderWithShipping(line: ShippingLine): boolean {
  return line.status === "quoted";
}
