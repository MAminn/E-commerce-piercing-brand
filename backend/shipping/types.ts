import type { GovernorateCode } from "#root/shared/shipping/egypt-governorates";
import type {
  ShippingCartSummary,
  ShippingQuote,
  ShippingQuoteProviderId,
} from "#root/shared/shipping/quote";
import type { StoredShippingRules } from "./rules-store";

export type {
  ShippingCartSummary,
  ShippingDestination,
  ShippingQuote,
  ShippingQuoteProviderId,
  ShippingQuoteResponse,
  ShippingSnapshot,
} from "#root/shared/shipping/quote";

export interface ShippingQuoteInput {
  /** `null` = the customer has not chosen a destination yet. */
  governorateCode: GovernorateCode | null;
  cart: ShippingCartSummary;
  /** The settings row read by the caller — providers never re-read it, so one request sees one revision. */
  stored: StoredShippingRules;
}

/**
 * A *pricing* provider: says what the customer is charged for delivery. It is
 * deliberately not the same thing as a dispatch carrier. The merchant's own
 * rules price the parcel today; Bosta/Fincart only move it. If a carrier's
 * account rate API is ever trusted, it becomes another implementation of this
 * interface — checkout and create-order keep calling `quoteShipping`.
 *
 * Providers are pure over their input: no I/O, no clock. That is what makes
 * create-order and the public endpoint provably agree.
 */
export interface ShippingQuoteProvider {
  id: ShippingQuoteProviderId;
  quote(input: ShippingQuoteInput): ShippingQuote;
}
