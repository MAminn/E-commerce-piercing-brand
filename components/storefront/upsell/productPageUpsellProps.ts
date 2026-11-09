import type { UpsellSource } from "#root/shared/upsell/select";
import type { ProductUpsells, UpsellProduct } from "./types";

/** The shape `upsell.forProduct` answers with (see backend/upsells/service.ts). */
export interface UpsellResponse {
  enabled: boolean;
  productPage: boolean;
  postAdd: boolean;
  limit: number;
  source: UpsellSource;
  items: UpsellProduct[];
}

/**
 * Decides, from the resolver's answer, what the product page renders.
 * Ported from Mach's rule of the same name.
 *
 *  - Upsells ON  → the upsell block / post-add sheet, and no "Style It With"
 *    strip (the same curated list is the manual upsell list, so drawing the
 *    strip as well would show it twice — relevant to the Percé templates that
 *    render that strip; the default Premium template does not).
 *  - Upsells OFF, or the request failed (`null`) → no upsells at all, and the
 *    curated strip exactly as before the feature existed.
 */
export function productPageUpsellProps<T>(
  response: UpsellResponse | null,
  curatedAddOns: T[],
): { upsells: ProductUpsells | undefined; curatedAddOns: T[] } {
  if (!response?.enabled) {
    return { upsells: undefined, curatedAddOns };
  }
  return {
    upsells: {
      items: response.items,
      limit: response.limit,
      productPage: response.productPage,
      postAdd: response.postAdd,
      source: response.source,
    },
    curatedAddOns: [],
  };
}
