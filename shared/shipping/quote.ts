import type { GovernorateCode } from "./egypt-governorates";
import type { ShippingMode } from "./rules";

/**
 * The contract between the shipping quote service and everything that
 * consumes a shipping price: the public `shipping.quote` endpoint, the cart
 * context, the checkout templates and — authoritatively — create-order.
 *
 * Pricing and dispatch are separate concepts. A quote provider says what the
 * customer is charged; a dispatch carrier (Bosta, Fincart) moves the parcel.
 * Today the only quote providers are the flat fee and the merchant's own
 * governorate rules. Bosta may later become a quote provider too, if its
 * account rate API is trusted — that would be a new provider behind this same
 * contract, not a checkout change.
 */

export type ShippingQuoteProviderId = "flat" | "manual_zone";

export interface ShippingDestination {
  country: "EG";
  governorateCode: GovernorateCode;
  /** Free text from checkout; not used for pricing in Phase 1. */
  city?: string;
}

/** Cart facts a provider MAY price on. Phase 1 providers ignore it; carrier quotes (COD amount, parcel count) will not. */
export interface ShippingCartSummary {
  subtotal: number;
  itemCount: number;
}

/** Why a quote is not available. Copy is derived from this on the client. */
export type ShippingUnavailableReason =
  /** Zones mode and no governorate chosen yet — the storefront shows "calculated at checkout". */
  | "destination_required"
  /** The merchant marked this governorate unavailable, or it is unlisted and there is no fallback fee. */
  | "destination_unavailable";

/**
 * Where the rule fee came from. Persisted in the order snapshot so a later
 * rules edit can be reconciled against what the customer actually paid.
 */
export type ShippingRateSource = "flat" | "governorate_rate" | "fallback";

export type ShippingQuote =
  | {
      available: true;
      provider: ShippingQuoteProviderId;
      /** Only one method exists today; kept so a carrier's express/standard split has a slot. */
      method: "standard";
      /** The rule fee BEFORE any free-shipping offer. EGP. */
      amount: number;
      currency: "EGP";
      rateSource: ShippingRateSource;
      governorateCode: GovernorateCode | null;
      governorateName: string | null;
    }
  | {
      available: false;
      provider: ShippingQuoteProviderId;
      reason: ShippingUnavailableReason;
      governorateCode: GovernorateCode | null;
      governorateName: string | null;
    };

export interface ShippingQuoteResponse {
  mode: ShippingMode;
  quote: ShippingQuote;
}

/**
 * What `order.shipping_quote` stores. Written once at order creation and
 * never recomputed: rule edits, mode switches or governorate renames after
 * the fact must not change what an old order says it was charged and why.
 * `chargedFee` always equals `order.shipping`.
 */
export interface ShippingSnapshot {
  version: 1;
  provider: ShippingQuoteProviderId;
  method: "standard";
  mode: ShippingMode;
  governorateCode: GovernorateCode | null;
  governorateName: string | null;
  rateSource: ShippingRateSource;
  /** The quoted rule fee before offers. */
  ruleFee: number;
  /** True when a free-shipping cart offer reduced the charge to 0. */
  freeShippingApplied: boolean;
  /** The amount actually charged — mirrors `order.shipping`. */
  chargedFee: number;
  currency: "EGP";
  quotedAt: string;
  /** `store_settings.updated_at` at quote time, so a snapshot can be tied to a rules revision. */
  rulesUpdatedAt: string | null;
}
