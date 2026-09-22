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
 *                 is what will be charged after a free-shipping offer.
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
): ShippingLine {
  if (!response) return { status: "pending", fee: 0, baseFee: 0 };
  const { quote } = response;
  if (!quote.available) {
    if (quote.reason === "destination_unavailable") {
      return { status: "unavailable", fee: 0, baseFee: 0, governorateName: quote.governorateName };
    }
    return { status: "pending", fee: 0, baseFee: 0 };
  }
  const fee = deriveEffectiveShipping(quote.amount, appliedOffers);
  return {
    status: "quoted",
    baseFee: quote.amount,
    fee,
    freeShipping: fee === 0 && quote.amount > 0,
    governorateName: quote.governorateName,
  };
}

/** Whether "Place order" may be pressed as far as shipping is concerned. */
export function canPlaceOrderWithShipping(line: ShippingLine): boolean {
  return line.status === "quoted";
}
