import { usePageContext } from "vike-react/usePageContext";
import type { ShippingFeeRange } from "#root/shared/shipping/shipping-policy";

/**
 * The live delivery-fee span (resolved from `store_settings.shipping_rules` on
 * the server for every page render and passed to the client), or null when
 * no fee is charged / the rules could not be read — callers hide the line.
 * No client request: it is in the first paint.
 */
export function useShippingFeeRange(): ShippingFeeRange | null {
  return usePageContext()?.shippingFeeRange ?? null;
}
