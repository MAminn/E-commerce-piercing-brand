import type { PageContext } from "vike/types";
import type { ShippingPolicyFacts } from "#root/shared/shipping/shipping-policy";
import { getShippingPolicyFactsRaw } from "#root/backend/shipping/shipping-policy";

export type Data = {
  /** Null when the shipping settings could not be read. */
  facts: ShippingPolicyFacts | null;
};

export const data = async (ctx: PageContext): Promise<Data> => ({
  facts: await getShippingPolicyFactsRaw(ctx.db),
});
