import type { ShippingCartSummary, ShippingQuote, ShippingQuoteResponse, ShippingSnapshot } from "#root/shared/shipping/quote";
import type { GovernorateCode } from "#root/shared/shipping/egypt-governorates";
import type { ShippingMode } from "#root/shared/shipping/rules";
import { flatFeeShippingProvider } from "./providers/flat-fee";
import { manualZoneShippingProvider } from "./providers/manual-zone";
import { getShippingRulesRaw, type SelectableDb, type StoredShippingRules } from "./rules-store";
import type { ShippingQuoteProvider } from "./types";

/**
 * The single entry point for a shipping price. The public `shipping.quote`
 * endpoint and create-order both come through here with the same inputs, so
 * the fee the customer saw and the fee the order is charged can only differ
 * if the rules changed in between — which create-order then reports as a
 * 409, never silently accepts.
 */
export function selectQuoteProvider(mode: ShippingMode): ShippingQuoteProvider {
  return mode === "zones" ? manualZoneShippingProvider : flatFeeShippingProvider;
}

/** Pure: quote against an already-read settings row. Used inside transactions and by tests. */
export function quoteShippingFromRules(
  stored: StoredShippingRules,
  governorateCode: GovernorateCode | null,
  cart: ShippingCartSummary,
): ShippingQuoteResponse {
  const provider = selectQuoteProvider(stored.rules.mode);
  return {
    mode: stored.rules.mode,
    quote: provider.quote({ governorateCode, cart, stored }),
  };
}

export async function quoteShipping(
  db: SelectableDb,
  input: { governorateCode: GovernorateCode | null; cart: ShippingCartSummary },
): Promise<{ response: ShippingQuoteResponse; stored: StoredShippingRules }> {
  const stored = await getShippingRulesRaw(db);
  return { response: quoteShippingFromRules(stored, input.governorateCode, input.cart), stored };
}

/**
 * Customer-facing wording for a quote that cannot be used to place an order.
 * Shared by create-order's rejection so it matches what checkout showed.
 */
export function describeUnavailableQuote(quote: Extract<ShippingQuote, { available: false }>): string {
  if (quote.reason === "destination_required") {
    return "Please select your governorate so we can calculate shipping.";
  }
  return quote.governorateName
    ? `We don't deliver to ${quote.governorateName} yet. Please choose another destination.`
    : "We don't deliver to the selected destination yet.";
}

/** Freeze what was quoted, and what was charged after offers, onto the order. */
export function buildShippingSnapshot(input: {
  quote: Extract<ShippingQuote, { available: true }>;
  mode: ShippingMode;
  freeShippingApplied: boolean;
  chargedFee: number;
  rulesUpdatedAt: Date | null;
  now?: Date;
}): ShippingSnapshot {
  return {
    version: 1,
    provider: input.quote.provider,
    method: input.quote.method,
    mode: input.mode,
    governorateCode: input.quote.governorateCode,
    governorateName: input.quote.governorateName,
    rateSource: input.quote.rateSource,
    ruleFee: input.quote.amount,
    freeShippingApplied: input.freeShippingApplied,
    chargedFee: input.chargedFee,
    currency: input.quote.currency,
    quotedAt: (input.now ?? new Date()).toISOString(),
    rulesUpdatedAt: input.rulesUpdatedAt ? input.rulesUpdatedAt.toISOString() : null,
  };
}
