import { getGovernorate } from "#root/shared/shipping/egypt-governorates";
import { resolveZoneRate, SHIPPING_CURRENCY } from "#root/shared/shipping/rules";
import type { ShippingQuoteProvider } from "../types";

/**
 * Prices delivery from the merchant's governorate rules (shared/shipping/rules.ts).
 *
 *   rates[code] is a number  → that rate
 *   rates[code] is null      → unavailable (merchant opted the governorate out)
 *   rates[code] is absent    → fallbackFee, or unavailable when that is null
 *
 * No destination yet → "destination_required": the storefront renders
 * "calculated at checkout" and the order cannot be placed until one is chosen.
 * The flat `shipping_fee` column is never read here.
 */
export const manualZoneShippingProvider: ShippingQuoteProvider = {
  id: "manual_zone",
  quote({ governorateCode, stored }) {
    if (!governorateCode) {
      return {
        available: false,
        provider: "manual_zone",
        reason: "destination_required",
        governorateCode: null,
        governorateName: null,
      };
    }

    const governorate = getGovernorate(governorateCode);
    const governorateName = governorate?.nameEn ?? null;
    const resolution = resolveZoneRate(stored.rules, governorateCode);

    if (resolution.kind === "unavailable") {
      return {
        available: false,
        provider: "manual_zone",
        reason: "destination_unavailable",
        governorateCode,
        governorateName,
      };
    }

    return {
      available: true,
      provider: "manual_zone",
      method: "standard",
      amount: resolution.fee,
      currency: SHIPPING_CURRENCY,
      rateSource: resolution.kind,
      governorateCode,
      governorateName,
    };
  },
};
