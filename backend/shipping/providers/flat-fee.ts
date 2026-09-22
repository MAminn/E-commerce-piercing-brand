import { getGovernorate } from "#root/shared/shipping/egypt-governorates";
import { SHIPPING_CURRENCY } from "#root/shared/shipping/rules";
import type { ShippingQuoteProvider } from "../types";

/**
 * The pre-zones behaviour, wrapped: every order pays `store_settings.shipping_fee`
 * whatever the destination, and a quote is available before any destination
 * is chosen (so the cart shows the fee up front, as it always has).
 */
export const flatFeeShippingProvider: ShippingQuoteProvider = {
  id: "flat",
  quote({ governorateCode, stored }) {
    const governorate = governorateCode ? getGovernorate(governorateCode) : undefined;
    return {
      available: true,
      provider: "flat",
      method: "standard",
      amount: stored.flatFee,
      currency: SHIPPING_CURRENCY,
      rateSource: "flat",
      governorateCode: governorateCode ?? null,
      governorateName: governorate?.nameEn ?? null,
    };
  },
};
